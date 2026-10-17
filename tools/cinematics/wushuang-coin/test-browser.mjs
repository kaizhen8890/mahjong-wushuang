import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const output=path.resolve('../outputs/wushuang-coin-v1');await mkdir(output,{recursive:true});
const server=spawn(process.execPath,['tools/cinematics/wushuang-coin/serve.mjs'],{env:{...process.env,PORT:'5201'},stdio:['ignore','pipe','pipe']});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',c=>{if(c)reject(new Error(`Server exited ${c}`))})});
const browser=await chromium.launch({channel:'chrome',headless:true});
const checks=[],errors=[];
try{
  const page=await browser.newPage({viewport:{width:1600,height:1000}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5201');
  for(const shape of ['landscape','portrait']){
    await page.setViewportSize(shape==='landscape'?{width:1600,height:1000}:{width:800,height:1280});
    await page.locator(`button[data-shape=${shape}]`).click();
    for(const result of ['heads','tails']){
      await page.locator(`button[data-result=${result}]`).click();
      await page.waitForFunction(()=>document.querySelector('video').readyState>=1);
      const metadata=await page.locator('video').evaluate(v=>({duration:v.duration,width:v.videoWidth,height:v.videoHeight,paused:v.paused}));
      assert.ok(Math.abs(metadata.duration-13)<.06);assert.equal(metadata.width,shape==='landscape'?1600:1000);assert.equal(metadata.height,shape==='landscape'?1000:1600);assert.equal(metadata.paused,true);
      await page.locator('#play').click();await page.waitForFunction(()=>document.querySelector('video').currentTime>5.8);
      assert.equal(await page.locator('.result').evaluate(e=>e.classList.contains('show')),false);
      await page.screenshot({path:path.join(output,`browser-flight-${result}-${shape}.png`)});
      await page.waitForFunction(()=>document.querySelector('video').currentTime>11.8);
      assert.equal(await page.locator('.result b').textContent(),result==='heads'?'正面':'反面');assert.equal(await page.locator('.result').evaluate(e=>e.classList.contains('show')),true);
      await page.screenshot({path:path.join(output,`browser-result-${result}-${shape}.png`)});
      await page.waitForFunction(()=>document.querySelector('video').ended);
      const quality=await page.locator('video').evaluate(v=>({error:v.error?.message||null,...v.getVideoPlaybackQuality().toJSON?.(),totalFrames:v.getVideoPlaybackQuality().totalVideoFrames,droppedFrames:v.getVideoPlaybackQuality().droppedVideoFrames,audioDecodedBytes:v.webkitAudioDecodedByteCount}));
      assert.equal(quality.error,null);assert.ok(quality.totalFrames>300);assert.ok(quality.audioDecodedBytes>0);
      const overflow=await page.evaluate(()=>({x:document.documentElement.scrollWidth>innerWidth,y:document.documentElement.scrollHeight>innerHeight}));assert.equal(overflow.x,false);
      checks.push({result,shape,metadata,quality,overflow,completedNaturally:true});
    }
  }
  await page.locator('#play').click();await page.waitForFunction(()=>document.querySelector('video').currentTime>.3&&document.querySelector('video').currentTime<2);
  await page.locator('#mute').click();assert.equal(await page.locator('video').evaluate(v=>v.muted),true);
  await page.locator('#play').click();assert.equal(await page.locator('video').evaluate(v=>v.paused),true);
  await page.locator('button[data-result=heads]').click();assert.equal(await page.locator('video').evaluate(v=>v.paused),true);assert.equal(await page.locator('.result').evaluate(e=>e.classList.contains('show')),false);
  assert.deepEqual(errors,[]);
  await writeFile(path.join(output,'browser-audit.json'),JSON.stringify({checks,errors,replayPauseMuteAndVariantSwitch:true,scope:'Desktop Chrome only; no Android device test'},null,2));
  console.log(JSON.stringify({movies:checks.length,errors,passed:true}));
}finally{await browser.close();server.kill()}
