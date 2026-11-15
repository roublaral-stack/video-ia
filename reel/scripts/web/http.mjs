import {stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';

export class HttpError extends Error {constructor(status,message){super(message);this.status=status;}}
export function reply(res,status,data){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data));}
export async function readJsonBody(req,limit=256*1024){
 if(!req.headers['content-type']?.startsWith('application/json'))throw new HttpError(415,'JSON attendu.');
 let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>limit)throw new HttpError(413,'Requête trop volumineuse.');chunks.push(chunk);}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new HttpError(400,'JSON invalide.');}
}
export async function sendFile(req,res,file,{mime='application/octet-stream',name='fichier',attachment=false}={}){
 const info=await stat(file),fallback=name.replace(/[^\x20-\x7e]|["\\;]/g,'_').slice(0,180);const headers={'content-type':mime,'cache-control':'no-store','accept-ranges':'bytes','content-disposition':`${attachment?'attachment':'inline'}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name).replaceAll("'",'%27')}`};
 let start=0,end=info.size-1,status=200;
 if(req.headers.range){
  const r=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
  if(!r||(!r[1]&&!r[2]))throw new HttpError(416,'Plage invalide.');
  start=r[1]?Number(r[1]):Math.max(0,info.size-Number(r[2]));end=r[1]&&r[2]?Math.min(Number(r[2]),info.size-1):info.size-1;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||start>=info.size){res.writeHead(416,{'content-range':`bytes */${info.size}`});res.end();return;}
  status=206;headers['content-range']=`bytes ${start}-${end}/${info.size}`;
 }
 res.writeHead(status,{...headers,'content-length':Math.max(0,end-start+1)});
 if(req.method==='HEAD'){res.end();return;}
 const stream=createReadStream(file,{start,end});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
}
