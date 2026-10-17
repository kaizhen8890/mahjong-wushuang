import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/kaizhen8890/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
for(const outcome of ['heads','tails']){
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(pathToFileURL(path.resolve(`../outputs/wushuang-${outcome}-v1/成片/预览.html`)).href);
  await page.click('#play');await page.waitForFunction(()=>window.previewState?.().ended,{},{timeout:10000});
  const state=await page.evaluate(()=>({...window.previewState(),images:[...document.images].every(x=>x.complete&&x.naturalWidth>0)}));
  if(errors.length||!state.images||state.duration!==6)throw Error(JSON.stringify({outcome,errors,state}));
  results.push({outcome,offlinePlayback:true,imagesLoaded:true,errors});await page.close();
}
await writeFile('../outputs/wushuang-tails-v1/offline-preview-audit.json',JSON.stringify(results,null,2));await browser.close();console.log(JSON.stringify(results));
