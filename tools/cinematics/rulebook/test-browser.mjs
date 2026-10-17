import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { previewServer } from '../witch/serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await previewServer(5190,'rulebook');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
const output='../outputs/rulebook-cinematic-v1.1.0-beta.2';await mkdir(output,{recursive:true});
const errors=[],checks=[];
try {
  const page=await browser.newPage({viewport:{width:1600,height:1000}});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5190/');await page.getByText('播放演出',{exact:true}).waitFor();
  assert.equal(await page.locator('.rulebook-cinematic').count(),0);checks.push('Restored snapshot does not replay');
  const options=await page.getByLabel('声明役种').locator('option').allTextContents();
  const longest=options.reduce((a,b)=>a.length>b.length?a:b);
  for(const [viewport,label] of [[{width:1600,height:1000},'断幺九'],[{width:800,height:1280},longest]]) {
    await page.setViewportSize(viewport);await page.getByLabel('声明役种').selectOption({label});await page.getByText('播放演出',{exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('video')?.currentTime>4.25);
    await page.locator('video').evaluate(v=>v.pause());
    assert.equal(await page.locator('video').evaluate(v=>v.videoWidth),viewport.width===1600?1600:1000);
    assert.equal(await page.locator('.rulebook-inscription strong').textContent(),label);
    const bounds=await page.locator('.rulebook-inscription').boundingBox();
    assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=viewport.width&&bounds.y+bounds.height<=viewport.height);
    await page.screenshot({path:`${output}/declaration-${viewport.width}.png`});
    await page.locator('video').evaluate(v=>v.play());
    await page.locator('.rulebook-cinematic[data-phase=return]').waitFor();
    assert.equal(await page.locator('.rulebook-declaration strong').textContent(),label);
    await page.locator('.rulebook-cinematic').waitFor({state:'detached'});
    checks.push(`${viewport.width}x${viewport.height}: decoded movie, live yaku ${label}, contained page text, natural completion`);
  }
  await page.getByText('重复快照',{exact:true}).click();assert.equal(await page.locator('.rulebook-cinematic').count(),0);
  await page.getByText('播放演出',{exact:true}).click();await page.waitForFunction(()=>document.querySelector('video')?.currentTime>.5);
  const src=await page.locator('video').getAttribute('src');await page.setViewportSize({width:1600,height:1000});
  assert.equal(await page.locator('video').getAttribute('src'),src);assert.ok(await page.locator('video').evaluate(v=>v.currentTime)>.4);
  await page.getByText('跳过演出',{exact:true}).click();assert.equal(await page.locator('video').count(),0);
  checks.push('Duplicate suppression; rotation keeps movie timeline; skip removes media');
  for(const control of ['替换环境','暗夜']) {
    await page.getByText('播放演出',{exact:true}).click();
    if(control==='暗夜')await page.getByLabel('暗夜',{exact:true}).evaluate(e=>e.click());
    else await page.getByText(control,{exact:true}).evaluate(e=>e.click());
    await page.locator('.rulebook-cinematic').waitFor({state:'detached'});
    if(control==='暗夜')await page.getByLabel('暗夜',{exact:true}).uncheck();
  }
  checks.push('Environment replacement and darkness remove video and text');
  await page.getByLabel('手机反馈').check();await page.getByText('播放演出',{exact:true}).click();await page.locator('.rulebook-phone').waitFor();
  assert.equal(await page.locator('video').count(),0);await page.locator('.rulebook-cinematic').waitFor({state:'detached'});await page.getByLabel('手机反馈').uncheck();
  await page.emulateMedia({reducedMotion:'reduce'});await page.getByText('播放演出',{exact:true}).click();await page.locator('[data-phase=fallback]').waitFor();
  assert.equal(await page.locator('video').count(),0);await page.locator('.rulebook-cinematic').waitFor({state:'detached'});await page.emulateMedia({reducedMotion:'no-preference'});
  checks.push('Phones and reduced-motion mode show rules without movie decoding');
  await page.getByLabel('静音',{exact:true}).check();await page.getByText('播放演出',{exact:true}).click();await page.waitForFunction(()=>document.querySelector('video')?.currentTime>.2);
  assert.equal(await page.locator('video').evaluate(v=>v.volume),0);await page.getByLabel('静音',{exact:true}).evaluate(e=>e.click());assert.equal(await page.locator('video').evaluate(v=>v.volume),.85);
  await page.getByText('跳过演出',{exact:true}).click();
  await page.evaluate(()=>{const original=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){return this.muted?original.call(this):Promise.reject(new DOMException('blocked','NotAllowedError'));};window.restorePlay=()=>HTMLMediaElement.prototype.play=original;});
  await page.getByText('播放演出',{exact:true}).click();await page.waitForFunction(()=>document.querySelector('video')?.currentTime>.2);assert.equal(await page.locator('video').evaluate(v=>v.muted),true);
  await page.getByText('跳过演出',{exact:true}).click();await page.evaluate(()=>window.restorePlay());
  checks.push('App volume controls movie; audible-autoplay rejection continues silently');
  await page.getByText('播放演出',{exact:true}).click();await page.waitForFunction(()=>document.querySelector('video')?.currentTime>.2);await page.locator('video').evaluate(v=>v.pause());
  await page.locator('[data-phase=fallback]').waitFor();await page.locator('.rulebook-cinematic').waitFor({state:'detached'});
  await page.route('**/cinematics/rulebook/v1/*.mp4',r=>r.abort());await page.getByText('播放演出',{exact:true}).click();
  await page.locator('[data-phase=fallback]').waitFor();await page.locator('.rulebook-cinematic').waitFor({state:'detached'});
  checks.push('Stalled or missing media shows rules and exits automatically');
  assert.deepEqual(errors,[]);await writeFile(`${output}/browser-checks.json`,JSON.stringify({checks,errors},null,2));console.log(checks.join('\n'));
} finally {await browser.close();await server.close();}
