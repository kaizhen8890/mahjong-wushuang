import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir,writeFile } from 'node:fs/promises';
import { previewServer } from '../witch/serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await previewServer(5196,'treasure');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
const output='../outputs/treasure-cinematic-v1.1.0-beta.6';await mkdir(output,{recursive:true});
const errors=[],checks=[];
try {
  const page=await browser.newPage({viewport:{width:1600,height:1000}});page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{const NativeAudio=window.Audio;window.auditAudio=[];window.Audio=function(...args){const a=new NativeAudio(...args);window.auditAudio.push(a);return a;};window.Audio.prototype=NativeAudio.prototype;});
  const open=()=>page.getByText('发动宝箱猎人',{exact:true}).click();
  const skip=()=>page.getByText('跳过演出',{exact:true}).click();
  const simulate=label=>page.getByText(label,{exact:true}).evaluate(e=>e.click());
  const confirm=()=>page.locator('[data-confirmed]').getAttribute('data-confirmed');
  const movie=()=>page.locator('video'),overlay=()=>page.locator('.treasure-cinematic');
  await page.goto('http://127.0.0.1:5196/?restored=1');await page.locator('[data-env-active=true]').waitFor();assert.equal(await overlay().count(),0);
  await page.goto('http://127.0.0.1:5196/');const scores=await page.locator('[data-scores]').getAttribute('data-scores');
  for(const viewport of [{width:1600,height:1000},{width:800,height:1280}]) {
    await page.setViewportSize(viewport);await open();await page.waitForFunction(()=>document.querySelector('video')?.currentTime>3.55);
    assert.equal(await page.locator('[data-env-active]').getAttribute('data-env-active'),'true');assert.equal(await confirm(),'false');
    assert.ok(Math.abs(await movie().evaluate(v=>v.duration)-6.4)<.05);assert.equal(await movie().evaluate(v=>v.videoWidth),viewport.width===1600?1600:1000);
    assert.equal(await movie().evaluate(v=>getComputedStyle(v).objectFit),'contain');await page.screenshot({path:`${output}/opening-${viewport.width}.png`});
    await page.waitForFunction(()=>document.querySelector('video')?.currentTime>4.8);await page.screenshot({path:`${output}/gold-${viewport.width}.png`});
    await page.locator('.treasure-cinematic[data-phase=return]').waitFor();assert.match(await page.locator('.treasure-declaration').textContent(),/请在现实牌桌/);
    await overlay().waitFor({state:'detached'});assert.equal(await confirm(),'false');assert.equal(await page.locator('[data-scores]').getAttribute('data-scores'),scores);
  }
  checks.push('Both 6.4-second films decode and finish naturally; real Host environment is immediate; animation never confirms tiles or awards pictured coins');
  await simulate('重复快照');assert.equal(await overlay().count(),0);
  await open();await page.waitForFunction(()=>document.querySelector('video')?.currentTime>.4);
  const src=await movie().getAttribute('src');await simulate('重复快照');await page.setViewportSize({width:1600,height:1000});
  assert.equal(await movie().getAttribute('src'),src);assert.ok(await movie().evaluate(v=>v.currentTime)>.3);await skip();assert.equal(await movie().count(),0);
  // Confirmation is a real accepted owner command. If it arrives during the film,
  // it queues once and only produces the lightweight confirmation after that film.
  await open();await page.waitForFunction(()=>document.querySelector('video')?.currentTime>.2);await simulate('确认现实翻牌');assert.equal(await confirm(),'true');
  assert.equal(await page.locator('.treasure-confirmed').count(),0);await skip();await page.locator('.treasure-confirmed').waitFor();assert.equal(await movie().count(),0);
  assert.match(await page.locator('.treasure-declaration strong').textContent(),/宝牌已揭示/);
  await page.waitForFunction(()=>window.auditAudio.some(a=>a.currentTime>.03));assert.equal(await page.evaluate(()=>window.auditAudio.at(-1).volume),.55);
  await page.screenshot({path:`${output}/confirmation.png`});await skip();assert.equal(await page.evaluate(()=>window.auditAudio.at(-1).paused),true);assert.equal(await page.evaluate(()=>window.auditAudio.at(-1).getAttribute('src')),null);
  await simulate('重复快照');assert.equal(await overlay().count(),0);assert.equal(await page.locator('[data-scores]').getAttribute('data-scores'),scores);
  checks.push('Recovery and duplicates do not replay; rotation preserves movie clock; owner confirmation queues once, uses no second video, and cleans up its chime on skip');
  await open();await page.waitForFunction(()=>document.querySelector('video')?.currentTime>.2);await simulate('替换环境');await overlay().waitFor({state:'detached'});
  await open();await page.getByLabel('暗夜',{exact:true}).evaluate(e=>e.click());await overlay().waitFor({state:'detached'});await page.getByLabel('暗夜',{exact:true}).uncheck();
  await open();await page.waitForFunction(()=>document.querySelector('video')?.currentTime>.2);await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});await overlay().waitFor({state:'detached'});
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});await simulate('重复快照');assert.equal(await movie().count(),0);
  checks.push('Environment replacement, night and backgrounding cancel the film and do not replay it on return');
  let movieRequests=0;page.on('request',r=>{if(r.url().endsWith('.mp4'))movieRequests++;});
  await page.setViewportSize({width:390,height:844});await page.getByLabel('手机反馈').check();await open();await overlay().waitFor();assert.equal(await movie().count(),0);
  const box=await page.locator('.treasure-declaration').boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=390&&box.y+box.height<=844);await page.screenshot({path:`${output}/phone.png`});await skip();
  const audioCount=await page.evaluate(()=>window.auditAudio.length);await simulate('确认现实翻牌');await page.locator('.treasure-confirmed').waitFor();assert.equal(await page.evaluate(()=>window.auditAudio.length),audioCount);await overlay().waitFor({state:'detached'});
  await page.getByLabel('手机反馈').uncheck();await page.emulateMedia({reducedMotion:'reduce'});await open();await page.locator('[data-phase=fallback]').waitFor();assert.equal(await movie().count(),0);await overlay().waitFor({state:'detached'});await page.emulateMedia({reducedMotion:'no-preference'});assert.equal(movieRequests,0);
  checks.push('Phones and reduced motion load no video; phone copy fits; phone confirmation makes no competing chime');
  await page.setViewportSize({width:1600,height:1000});await page.getByLabel('静音',{exact:true}).check();await open();await page.waitForFunction(()=>document.querySelector('video')?.currentTime>.2);assert.equal(await movie().evaluate(v=>v.volume),0);
  await page.getByLabel('静音',{exact:true}).evaluate(e=>e.click());assert.equal(await movie().evaluate(v=>v.volume),.85);await skip();
  await page.evaluate(()=>{const original=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){return this.muted?original.call(this):Promise.reject(new DOMException('blocked','NotAllowedError'));};window.restorePlay=()=>HTMLMediaElement.prototype.play=original;});
  await open();await page.waitForFunction(()=>document.querySelector('video')?.currentTime>.2);assert.equal(await movie().evaluate(v=>v.muted),true);await skip();await page.evaluate(()=>window.restorePlay());
  await open();await page.waitForFunction(()=>document.querySelector('video')?.currentTime>.2);await movie().evaluate(v=>v.pause());await page.locator('[data-phase=fallback]').waitFor();assert.equal(await confirm(),'false');await overlay().waitFor({state:'detached'});
  await page.route('**/cinematics/treasure/v1/*.mp4',r=>r.abort());await open();await page.locator('[data-phase=fallback]').waitFor();await overlay().waitFor({state:'detached'});assert.equal(await confirm(),'false');assert.equal(await page.locator('[data-scores]').getAttribute('data-scores'),scores);
  checks.push('App mute/gain, muted autoplay retry, stalled/missing media fallback and unchanged Host state verified');
  assert.deepEqual(errors,[]);await writeFile(`${output}/browser-checks.json`,JSON.stringify({checks,errors},null,2));console.log(checks.join('\n'));
} finally {await browser.close();await server.close();}
