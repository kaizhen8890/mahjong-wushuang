import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { previewServer } from './serve.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server=await previewServer(5188);
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
const outputs='../outputs/witch-cinematic-v1.1.0-beta.1'; await mkdir(outputs,{recursive:true});
const errors=[];
try {
  const page=await browser.newPage({viewport:{width:1600,height:1000}});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5188/tools/cinematics/witch/preview.html');
  await page.getByText('播放开场',{exact:true}).waitFor();
  assert.equal(await page.locator('.witch-cinematic').count(),0,'Restored snapshots must not replay');
  await page.getByText('播放开场',{exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('video')?.currentTime>1.5);
  assert.equal(await page.locator('video').evaluate(v=>v.videoWidth),1600);
  await page.screenshot({path:`${outputs}/intro-landscape.png`});
  await page.getByText('跳过演出',{exact:true}).click();
  assert.equal(await page.locator('video').count(),0);
  await page.getByText('重复快照',{exact:true}).click();
  assert.equal(await page.locator('.witch-cinematic').count(),0,'Duplicate snapshot must not replay');
  for(const viewport of [{width:1600,height:1000},{width:800,height:1280}]) {
    await page.setViewportSize(viewport);
    for(const id of ['p1','p2','p3','p4']) {
      await page.getByLabel('审判目标').selectOption(id);
      await page.getByText('审判目标',{exact:true}).click();
      await page.locator('.witch-target-impact').waitFor();
      const measured=await page.evaluate(id=>{
        const rect=document.querySelector(`[data-player-id="${id}"]`).getBoundingClientRect();
        const hit=document.querySelector('.witch-target-impact').getBoundingClientRect();
        return {dx:Math.abs((rect.left+rect.width/2)-(hit.left+hit.width/2)),dy:Math.abs((rect.top+rect.height/2)-(hit.top+hit.height/2))};
      },id);
      assert.ok(measured.dx<1&&measured.dy<1,JSON.stringify({viewport,id,measured}));
      if(id==='p2')await page.screenshot({path:`${outputs}/target-${viewport.width}.png`});
      await page.locator('.witch-cinematic').waitFor({state:'detached'});
    }
  }
  // Resize during the same film: don't restart media; update target geometry.
  await page.getByText('播放开场',{exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('video')?.currentTime>.6);
  const source=await page.locator('video').getAttribute('src');
  await page.setViewportSize({width:1280,height:800});
  assert.equal(await page.locator('video').getAttribute('src'),source);
  await page.getByText('跳过演出',{exact:true}).click();
  await page.getByText('播放开场',{exact:true}).click();
  await page.getByText('替换环境',{exact:true}).evaluate(b=>b.click());
  await page.locator('.witch-cinematic').waitFor({state:'detached'});
  await page.getByText('播放开场',{exact:true}).click();
  await page.getByLabel('暗夜',{exact:true}).evaluate(b=>b.click());
  await page.locator('.witch-cinematic').waitFor({state:'detached'});
  await page.getByLabel('暗夜',{exact:true}).uncheck();
  await page.getByLabel('手机反馈').check();
  await page.getByText('审判目标',{exact:true}).click();
  await page.locator('.witch-phone').waitFor();
  assert.equal(await page.locator('video').count(),0,'Phones must not decode full movies');
  await page.locator('.witch-cinematic').waitFor({state:'detached'});
  await page.getByLabel('手机反馈').uncheck();
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.getByText('播放开场',{exact:true}).click();
  await page.locator('.witch-cinematic[data-phase=fallback]').waitFor();
  assert.equal(await page.locator('video').count(),0);
  await page.locator('.witch-cinematic').waitFor({state:'detached'});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.getByLabel('静音',{exact:true}).check();
  await page.getByText('播放开场',{exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('video')?.currentTime>.3);
  assert.equal(await page.locator('video').evaluate(v=>v.volume),0);
  await page.getByLabel('静音',{exact:true}).evaluate(b=>b.click());
  assert.equal(await page.locator('video').evaluate(v=>v.volume),.85);
  await page.getByText('跳过演出',{exact:true}).click();
  // Emulate a WebView rejecting audible autoplay while permitting muted video.
  await page.evaluate(()=>{
    const original=HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play=function(){return this.muted?original.call(this):Promise.reject(new DOMException('blocked','NotAllowedError'));};
    window.restoreWitchPlay=()=>{HTMLMediaElement.prototype.play=original;};
  });
  await page.getByText('播放开场',{exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('video')?.currentTime>.3);
  assert.equal(await page.locator('video').evaluate(v=>v.muted),true);
  await page.getByText('跳过演出',{exact:true}).click();
  await page.evaluate(()=>window.restoreWitchPlay());
  await page.route('**/cinematics/witch/v1/*.mp4',r=>r.abort());
  await page.getByText('播放开场',{exact:true}).click();
  await page.locator('.witch-cinematic[data-phase=fallback]').waitFor();
  await page.locator('.witch-cinematic').waitFor({state:'detached'});
  assert.deepEqual(errors,[]);
  console.log('PASS: actual video decoding; 8 rotated seat targets; skip; replay suppression; orientation change; replacement; darkness; phone; reduced motion; mute; autoplay fallback; media failure.');
} finally { await browser.close(); await server.close(); }
