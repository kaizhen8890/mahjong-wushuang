import path from 'node:path';
import { createRequire } from 'node:module';
import { readdirSync, statSync, createReadStream, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
const require=createRequire(import.meta.url);
export async function previewServer(port=5187,project='witch') {
  if(!['witch','rulebook','night','azoru','treasure'].includes(project))throw new Error('Unknown cinematic preview');
  const pkg=readdirSync('node_modules/.pnpm').find(name=>/^esbuild@\d/.test(name));
  const {build}=require(path.resolve(`node_modules/.pnpm/${pkg}/node_modules/esbuild`));
  await build({entryPoints:[`tools/cinematics/${project}/preview.tsx`],bundle:true,outfile:`.tmp/${project}-preview/app.js`,format:'esm',jsx:'automatic',alias:{'@':process.cwd()},external:['/fonts/*'],define:{'process.env.NODE_ENV':'"development"'},logLevel:'warning'});
  if(project==='night') {
    // Compile the same utility styles as the app; portals rely on their positioning.
    const tailwind=require('@tailwindcss/postcss'),postcss=createRequire(require.resolve('@tailwindcss/postcss'))('postcss');
    const globals=await postcss([tailwind({base:process.cwd()})]).process(readFileSync('app/globals.css','utf8'),{from:path.resolve('app/globals.css')});
    const css=[globals.css,...['app/sakura-theme.css','app/presentation.css','app/table-layout-tuning.css'].map(file=>readFileSync(file,'utf8'))].join('\n');
    writeFileSync('.tmp/night-preview/globals.css',css);
  }
  const html='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>魔女审判 · 演出样片</title><link rel="stylesheet" href="/app.css"><div id="root"></div><script type="module" src="/app.js"></script></html>';
  const server=createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');
    const assetPath=path.resolve('public',`.${decodeURIComponent(url.pathname)}`);
    const publicAsset=assetPath.startsWith(path.resolve('public')+path.sep)&&existsSync(assetPath)&&statSync(assetPath).isFile();
    const file=publicAsset?assetPath:['/app.js','/app.css',...(project==='night'?['/globals.css']:[])].includes(url.pathname)?path.resolve(`.tmp/${project}-preview`,path.basename(url.pathname)):null;
    if(!file){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html.replace('魔女审判',({witch:'魔女审判',rulebook:'规则怪谈',night:'暗夜之战',azoru:'偶氮玉红',treasure:'宝箱猎人'})[project]));return;}
    if(publicAsset&&!file.startsWith(path.resolve('public')+path.sep)){res.writeHead(403);res.end();return;}
    try{
      const size=statSync(file).size;const range=req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
      const start=range?Number(range[1]):0,end=range&&range[2]?Math.min(Number(range[2]),size-1):size-1;
      if(start> end){res.writeHead(416);res.end();return;}
      const type={'.js':'text/javascript','.css':'text/css','.mp4':'video/mp4','.mp3':'audio/mpeg','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'}[path.extname(file)]||'application/octet-stream';
      res.writeHead(range?206:200,{'Content-Type':type,'Content-Length':end-start+1,'Accept-Ranges':'bytes',...(range?{'Content-Range':`bytes ${start}-${end}/${size}`}:{})});
      createReadStream(file,{start,end}).pipe(res);
    }catch{res.writeHead(404);res.end();}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  return {close:()=>new Promise(resolve=>server.close(resolve))};
}
if(path.resolve(process.argv[1]??'')===path.resolve('tools/cinematics/witch/serve.mjs')){
  await previewServer();console.log('http://127.0.0.1:5187/tools/cinematics/witch/preview.html');
}
