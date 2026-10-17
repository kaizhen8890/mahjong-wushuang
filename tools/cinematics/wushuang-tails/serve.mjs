import {createServer} from 'node:http';
import {readFileSync,statSync,createReadStream} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..'),publicDir=path.join(root,'public');
const delivery=path.resolve(root,'../outputs/wushuang-tails-v1/成片');
const port=Number(process.env.PORT||5204);
const aliases=new Map([['/preview-assets/Wushuang-Jianghu.ttf',path.join(publicDir,'fonts/Wushuang-Jianghu.ttf')],['/preview-assets/portrait.png',path.join(publicDir,'characters/claude/portrait.png')],['/preview-assets/avatar.png',path.join(publicDir,'characters/claude/avatar.png')]]);
createServer((req,res)=>{
  let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname)}catch{res.writeHead(400).end();return}
  if(pathname==='/'||pathname==='/preview.html'){res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'}).end(readFileSync(path.join(here,'preview.html')));return}
  let file=aliases.get(pathname);
  if(!file&&/^\/showcase\/coin-and-effect-(landscape|portrait)\.mp4$/.test(pathname))file=path.join(delivery,path.basename(pathname));
  if(!file&&/^\/cinematics\/wushuang-tails\/v1\/(effect-(landscape|portrait)\.(mp4|jpg)|manifest\.json)$/.test(pathname))file=path.join(publicDir,pathname.slice(1));
  if(!file){res.writeHead(404).end();return}
  try{
    const size=statSync(file).size,range=req.headers.range?.match(/^bytes=(\d+)-(\d*)$/),start=range?Number(range[1]):0,end=range&&range[2]?Math.min(Number(range[2]),size-1):size-1;
    if(start>end||start>=size){res.writeHead(416,{'Content-Range':`bytes */${size}`}).end();return}
    const type={'.mp4':'video/mp4','.jpg':'image/jpeg','.png':'image/png','.json':'application/json','.ttf':'font/ttf'}[path.extname(file)]||'application/octet-stream';
    res.writeHead(range?206:200,{'Content-Type':type,'Content-Length':end-start+1,'Accept-Ranges':'bytes',...(range?{'Content-Range':`bytes ${start}-${end}/${size}`}:{})});
    if(req.method==='HEAD')res.end();else createReadStream(file,{start,end}).pipe(res);
  }catch{res.writeHead(404).end()}
}).listen(port,'127.0.0.1',()=>console.log(`http://127.0.0.1:${port}`));
