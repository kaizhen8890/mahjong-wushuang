import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir,writeFile } from 'node:fs/promises';
import { previewServer } from '../witch/serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await previewServer(5194,'azoru');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
const output='../outputs/azoru-cinematic-v1.1.0-beta.4';await mkdir(output,{recursive:true});
const errors=[],checks=[];
try {
  const page=await browser.newPage({viewport:{width:1600,height:1000}});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5194/');await page.getByText('播放演出',{exact:true}).waitFor();
  assert.equal(await page.locator('.azoru-cinematic').count(),0);checks.push('Restored snapshot does not replay');
  for(const [viewport,number] of [[{width:1600,height:1000},'1'],[{width:800,height:1280},'9']]) {
    await page.setViewportSize(viewport);await page.getByLabel('声明数字').selectOption(number);await page.getByText('播放演出',{exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('video')?.currentTime>4.4);
    await page.locator('video').evaluate(v=>v.pause());
    assert.equal(await page.locator('video').evaluate(v=>v.videoWidth),viewport.width===1600?1600:1000);
    assert.ok(Math.abs(await page.locator('video').evaluate(v=>v.duration)-6)<.05);
    assert.equal(await page.locator('.azoru-inscription strong').textContent(),number);
    const bounds=await page.locator('.azoru-inscription').boundingBox();
    assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=viewport.width&&bounds.y+bounds.height<=viewport.height);
    await page.screenshot({path:`${output}/declaration-${viewport.width}.png`});
    await page.locator('video').evaluate(v=>v.play());
    await page.locator('.azoru-cinematic[data-phase=return]').waitFor();
    assert.equal(await page.locator('.azoru-declaration strong').textContent(),number);
    await page.locator('.azoru-cinematic').waitFor({state:'detached'});
    checks.push(`${viewport.width}x${viewport.height}: six-second decode, saved number ${number}, contained projection, natural completion`);
  }
  await page.getByText('重复快照',{exact:true}).click();assert.equal(await page.locator('.azoru-cinematic').count(),0);
  await page.getByText('播放演出',{exact:true}).click();await page.waitForFunction(()=>document.querySelector('video')?.currentTime>.5);
  const src=await page.locator('video').getAttribute('src');await page.setViewportSize({width:1600,height:1000});
  assert.equal(await page.locator('video').getAttribute('src'),src);assert.ok(await page.locator('video').evaluate(v=>v.currentTime)>.4);
  await page.getByText('跳过演出',{exact:true}).click();assert.equal(await page.locator('video').count(),0);
  checks.push('Duplicate suppression; rotation keeps film and clock; skip removes media');
  for(const control of ['替换环境','暗夜']) {
    await page.getByText('播放演出',{exact:true}).click();
    if(control==='暗夜')await page.getByLabel('暗夜',{exact:true}).evaluate(e=>e.click());
    else await page.getByText(control,{exact:true}).evaluate(e=>e.click());
    await page.locator('.azoru-cinematic').waitFor({state:'detached'});
    if(control==='暗夜')await page.getByLabel('暗夜',{exact:true}).uncheck();
  }
  await page.getByText('播放演出',{exact:true}).click();await page.waitForFunction(()=>document.querySelector('video')?.currentTime>.2);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  await page.locator('.azoru-cinematic').waitFor({state:'detached'});
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
  await page.getByText('重复快照',{exact:true}).click();assert.equal(await page.locator('video').count(),0);
  checks.push('Replacement, darkness and backgrounding cancel presentation without replay');
  let movieRequests=0;page.on('request',r=>{if(r.url().endsWith('.mp4'))movieRequests++;});
  await page.setViewportSize({width:390,height:844});await page.getByLabel('手机反馈').check();
  for(const number of ['2','3','4','5','6','7','8']) {
    await page.getByLabel('声明数字').selectOption(number);await page.getByText('播放演出',{exact:true}).click();await page.locator('.azoru-phone').waitFor();
    assert.equal(await page.locator('.azoru-declaration strong').textContent(),number);
    assert.equal(await page.locator('video').count(),0);
    if(number==='5')await page.screenshot({path:`output/phone.png`.replace('output',output)});
    await page.getByText('跳过演出',{exact:true}).click();
  }
  assert.equal(movieRequests,0);await page.getByLabel('手机反馈').uncheck();
  await page.emulateMedia({reducedMotion:'reduce'});await page.getByText('播放演出',{exact:true}).click();await page.locator('[data-phase=fallback]').waitFor();
  assert.equal(await page.locator('video').count(),0);await page.locator('.azoru-cinematic').waitFor({state:'detached'});await page.emulateMedia({reducedMotion:'no-preference'});
  assert.equal(movieRequests,0);checks.push('All nine displayed numbers; phones and reduced motion request no movie');
  await page.setViewportSize({width:1600,height:1000});
  await page.getByLabel('静音',{exact:true}).check();await page.getByText('播放演出',{exact:true}).click();await page.waitForFunction(()=>document.querySelector('video')?.currentTime>.2);
  assert.equal(await page.locator('video').evaluate(v=>v.volume),0);await page.getByLabel('静音',{exact:true}).evaluate(e=>e.click());assert.equal(await page.locator('video').evaluate(v=>v.volume),.85);
  await page.getByText('跳过演出',{exact:true}).click();
  await page.evaluate(()=>{const original=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){return this.muted?original.call(this):Promise.reject(new DOMException('blocked','NotAllowedError'));};window.restorePlay=()=>HTMLMediaElement.prototype.play=original;});
  await page.getByText('播放演出',{exact:true}).click();await page.waitForFunction(()=>document.querySelector('video')?.currentTime>.2);assert.equal(await page.locator('video').evaluate(v=>v.muted),true);
  await page.getByText('跳过演出',{exact:true}).click();await page.evaluate(()=>window.restorePlay());
  checks.push('Movie respects app sound gain; rejected audible autoplay retries silently');
  await page.getByText('播放演出',{exact:true}).click();await page.waitForFunction(()=>document.querySelector('video')?.currentTime>.2);await page.locator('video').evaluate(v=>v.pause());
  await page.locator('[data-phase=fallback]').waitFor();await page.locator('.azoru-cinematic').waitFor({state:'detached'});
  await page.route('**/cinematics/azoru/v1/*.mp4',r=>r.abort());await page.getByText('播放演出',{exact:true}).click();
  await page.locator('[data-phase=fallback]').waitFor();await page.locator('.azoru-cinematic').waitFor({state:'detached'});
  checks.push('Stalled or missing film reveals saved declaration and exits');
  assert.deepEqual(errors,[]);await writeFile(`${output}/browser-checks.json`,JSON.stringify({checks,errors},null,2));console.log(checks.join('\n'));
} finally {await browser.close();await server.close();}
