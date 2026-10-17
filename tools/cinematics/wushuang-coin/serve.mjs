import {createServer} from 'node:http';
import {readFileSync,statSync,createReadStream} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..'),publicDir=path.join(root,'public');
const port=Number(process.env.PORT||5199);
const server=createServer((req,res)=>{
  let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname)}catch{res.writeHead(400).end();return}
  if(pathname==='/'||pathname.endsWith('/preview.html')){res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});res.end(readFileSync(path.join(here,'preview.html')));return}
  if(!pathname.startsWith('/cinematics/wushuang-coin/v1/')&&pathname!=='/fonts/Wushuang-Jianghu.ttf'){res.writeHead(404).end();return}
  const file=path.resolve(publicDir,'.'+pathname);
  if(!file.startsWith(publicDir+path.sep)){res.writeHead(403).end();return}
  try{
    const size=statSync(file).size,r=req.headers.range?.match(/^bytes=(\d+)-(\d*)$/),start=r?Number(r[1]):0,end=r&&r[2]?Math.min(Number(r[2]),size-1):size-1;
    if(start>end){res.writeHead(416,{'Content-Range':`bytes */${size}`}).end();return}
    const type={'.mp4':'video/mp4','.jpg':'image/jpeg','.json':'application/json','.ttf':'font/ttf'}[path.extname(file)]||'application/octet-stream';
    res.writeHead(r?206:200,{'Content-Type':type,'Content-Length':end-start+1,'Accept-Ranges':'bytes',...(r?{'Content-Range':`bytes ${start}-${end}/${size}`}:{})});
    if(req.method==='HEAD')res.end();else createReadStream(file,{start,end}).pipe(res);
  }catch{res.writeHead(404).end()}
});
server.listen(port,'127.0.0.1',()=>console.log(`http://127.0.0.1:${port}`));
