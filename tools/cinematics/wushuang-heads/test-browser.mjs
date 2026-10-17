import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/kaizhen8890/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=path.resolve(process.argv[2]||'../outputs/wushuang-heads-v1/browser');await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],results=[];
page.on('pageerror',e=>errors.push(String(e)));page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('/favicon.ico'))errors.push(`${r.status()} ${r.url()}`)});
await page.goto('http://127.0.0.1:5203/');
for(const ori of ['landscape','portrait'])for(const cut of ['effect','full']){
  await page.selectOption('#orientation',ori);await page.selectOption('#cut',cut);await page.waitForFunction(()=>document.getElementById('film').readyState>=2);
  await page.click('#play');await page.waitForFunction(()=>document.getElementById('film').ended,{},{timeout:25000});
  const state=await page.evaluate(()=>({...window.previewState(),quality:document.getElementById('film').getVideoPlaybackQuality().toJSON?.()||{total:document.getElementById('film').getVideoPlaybackQuality().totalVideoFrames,dropped:document.getElementById('film').getVideoPlaybackQuality().droppedVideoFrames},overflow:document.documentElement.scrollWidth>innerWidth}));
  const expected=cut==='full'?19:6;if(Math.abs(state.duration-expected)>.05||!state.ended||state.overflow||state.width!==(ori==='portrait'?1000:1600)||state.height!==(ori==='portrait'?1600:1000))throw Error(JSON.stringify(state));
  results.push({orientation:ori,cut,...state});
}
// Confirm optional portrait art is a separately layered foreground, not baked into the MP4.
await page.selectOption('#orientation','landscape');await page.selectOption('#cut','effect');await page.check('#actorToggle');await page.click('#play');
await page.waitForFunction(()=>window.previewState().foreground,{},{timeout:8000});await page.waitForTimeout(550);
await page.screenshot({path:path.join(out,'foreground-landscape.png')});
await page.uncheck('#sound');if(!(await page.evaluate(()=>window.previewState().muted)))throw Error('Mute did not apply');
await page.uncheck('#actorToggle');if(await page.locator('#foreground').evaluate(e=>e.classList.contains('show')))throw Error('Foreground did not hide');
await page.click('#play');await page.waitForFunction(()=>document.getElementById('film').currentTime>3.35);await page.evaluate(()=>document.getElementById('film').pause());await page.screenshot({path:path.join(out,'peak-landscape.png')});
await page.setViewportSize({width:800,height:1280});await page.selectOption('#orientation','portrait');await page.click('#play');await page.waitForFunction(()=>document.getElementById('film').currentTime>3.35);await page.evaluate(()=>document.getElementById('film').pause());await page.screenshot({path:path.join(out,'peak-portrait.png')});
if(errors.length)throw Error(errors.join('\n'));
await writeFile(path.join(out,'audit.json'),JSON.stringify({environment:'Desktop Chrome; no Android device test',results,errors,foregroundOverlay:true,muteToggle:true},null,2));await browser.close();console.log(JSON.stringify({passed:true,files:results.length,errors}));
