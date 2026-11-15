import http from 'node:http';
import {mkdir,readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {root} from '../media.mjs';
import {lock} from '../pipeline/store.mjs';
import {Auth} from './auth.mjs';
import {UploadStore,validId} from './uploads.mjs';
import {JobStore} from './jobs.mjs';
import {reply,readJsonBody,sendFile,HttpError} from './http.mjs';

const staticFiles={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/app.css':['app.css','text/css; charset=utf-8']};
const vendor=new Set(['sha2.js','utils.js','_md.js','_u64.js']);
export async function createWebApp({directory=path.join(root,'private/web-data'),origin='http://127.0.0.1:3300',uploadOptions={}}={}){
 directory=path.resolve(directory);const publicUrl=new URL(origin);
 if(!['http:','https:'].includes(publicUrl.protocol)||publicUrl.pathname!=='/'||publicUrl.search||publicUrl.hash||publicUrl.username)throw Error('VIDEO_WEB_ORIGIN invalide.');
 if(publicUrl.protocol==='http:'&&!['127.0.0.1','localhost','[::1]'].includes(publicUrl.hostname))throw Error('Une origine distante exige HTTPS.');
 await mkdir(directory,{recursive:true,mode:0o700});const release=await lock(directory);
 let auth,uploads,jobs;
 try{auth=new Auth(path.join(directory,'auth'),{secure:publicUrl.protocol==='https:'});await auth.credential();uploads=new UploadStore(directory,uploadOptions);await uploads.init();jobs=new JobStore(directory,uploads);await jobs.init();}catch(e){await release();throw e;}
 const server=http.createServer(async(req,res)=>{
  res.setHeader('cache-control','no-store');res.setHeader('x-content-type-options','nosniff');res.setHeader('referrer-policy','no-referrer');res.setHeader('x-frame-options','DENY');res.setHeader('content-security-policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; media-src 'self' blob:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  try{
   if(req.headers.host!==publicUrl.host)throw new HttpError(421,'Hôte refusé.');
   const url=new URL(req.url,publicUrl);
   if(!['GET','HEAD'].includes(req.method)&&req.headers.origin!==publicUrl.origin)throw new HttpError(403,'Origine refusée.');
   if(req.method==='GET'&&staticFiles[url.pathname]){const [file,mime]=staticFiles[url.pathname];res.writeHead(200,{'content-type':mime});res.end(await readFile(path.join(root,'web',file)));return;}
   const v=/^\/vendor\/([\w.]+)$/.exec(url.pathname);if(req.method==='GET'&&v&&vendor.has(v[1])){res.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});res.end(await readFile(path.join(root,'node_modules/@noble/hashes',v[1])));return;}
   if(req.method==='GET'&&url.pathname==='/healthz')return reply(res,200,{status:'ok'});
   if(req.method==='POST'&&url.pathname==='/api/login'){
    const input=await readJsonBody(req,4096),login=await auth.login(input.password,req.socket.remoteAddress);res.setHeader('set-cookie',auth.cookie(login.token));return reply(res,200,{authenticated:true,csrf:login.session.csrf});
   }
   const session=await auth.require(req);
   if(req.method==='POST'&&url.pathname==='/api/logout'){await auth.logout(req);res.setHeader('set-cookie',auth.cookie('',0));return reply(res,200,{loggedOut:true});}
   if(req.method==='GET'&&url.pathname==='/api/session')return reply(res,200,{authenticated:true,csrf:session.csrf,limits:{maxFileBytes:uploads.maxFileBytes,chunkBytes:uploads.chunkBytes,quotaBytes:uploads.quotaBytes,videoMaxSeconds:600},deployment:{iphoneUrlVerified:false,local:publicUrl.protocol==='http:'}});
   if(req.method==='GET'&&url.pathname==='/api/assets')return reply(res,200,await uploads.listAssets());
   if(url.pathname==='/api/uploads'){
    if(req.method==='POST')return reply(res,201,await uploads.create(await readJsonBody(req)));
    if(req.method==='GET'){const all=[];for(const id of await readdir(path.join(directory,'uploads')))if(validId(id)){const value=await uploads.status(id);if(value.status!=='complete')all.push(value);}return reply(res,200,all);}
   }
   const upload=/^\/api\/uploads\/([^/]+)$/.exec(url.pathname);
   if(upload&&req.method==='GET')return reply(res,200,await uploads.status(upload[1]));
   if(upload&&req.method==='DELETE'){await uploads.cancel(upload[1]);return reply(res,200,{cancelled:true});}
   const part=/^\/api\/uploads\/([^/]+)\/parts\/(\d+)$/.exec(url.pathname);
   if(part&&req.method==='PUT')return reply(res,200,await uploads.part(part[1],Number(part[2]),req.headers['x-chunk-sha256'],req));
   const complete=/^\/api\/uploads\/([^/]+)\/complete$/.exec(url.pathname);
   if(complete&&req.method==='POST')return reply(res,200,await uploads.complete(complete[1]));
   const asset=/^\/api\/assets\/([^/]+)\/original$/.exec(url.pathname);
   if(asset&&['GET','HEAD'].includes(req.method)){const a=await uploads.asset(asset[1]);await sendFile(req,res,a.file,{name:a.name,attachment:true});return;}
   if(url.pathname==='/api/projects'){
    if(req.method==='GET')return reply(res,200,await jobs.projects());
    if(req.method==='POST')return reply(res,201,await jobs.saveProject(await readJsonBody(req)));
   }
   const project=/^\/api\/projects\/([^/]+)$/.exec(url.pathname);
   if(project&&req.method==='PUT')return reply(res,200,await jobs.saveProject(await readJsonBody(req),project[1]));
   const generate=/^\/api\/projects\/([^/]+)\/preview$/.exec(url.pathname);
   if(generate&&req.method==='POST')return reply(res,202,await jobs.create(generate[1]));
   if(req.method==='GET'&&url.pathname==='/api/jobs'){const all=[];for(const id of await readdir(path.join(directory,'jobs')))if(validId(id))all.push(jobs.publicJob(await jobs.get(id)));return reply(res,200,all);}
   const job=/^\/api\/jobs\/([^/]+)$/.exec(url.pathname);
   if(job&&req.method==='GET')return reply(res,200,jobs.publicJob(await jobs.get(job[1])));
   const retry=/^\/api\/jobs\/([^/]+)\/resume$/.exec(url.pathname);
   if(retry&&req.method==='POST')return reply(res,202,await jobs.resume(retry[1]));
   const approve=/^\/api\/jobs\/([^/]+)\/approve$/.exec(url.pathname);
   if(approve&&req.method==='POST')return reply(res,202,await jobs.approve(approve[1],await readJsonBody(req)));
   const artifact=/^\/api\/jobs\/([^/]+)\/files\/(preview|zip|srt|mp4|final-zip)$/.exec(url.pathname);
   if(artifact&&['GET','HEAD'].includes(req.method)){const f=await jobs.file(artifact[1],artifact[2]);await sendFile(req,res,f.file,{mime:f.mime,name:f.name,attachment:artifact[2]!=='preview'||url.searchParams.has('download')});return;}
   throw new HttpError(404,'Introuvable.');
  }catch(e){if(res.headersSent){res.destroy();return;}res.setHeader('connection','close');const status=e.status??(e.code==='ENOSPC'?507:e.code==='ENOENT'?404:400);reply(res,status,{error:(e.code==='ENOSPC'?'Stockage plein ; les morceaux acceptés sont conservés.':e.message).replaceAll(directory,'[stockage privé]')});}
 });
 server.requestTimeout=10*60_000;server.headersTimeout=30_000;
 return {server,uploads,jobs,auth,directory,async listen(port=Number(publicUrl.port||3300)){await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});if(publicUrl.port==='0')publicUrl.port=String(server.address().port);return publicUrl.origin;},async close(){await jobs.close();await new Promise(r=>server.close(r));await release();}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 process.umask(0o077);const port=Number(process.env.PORT||3300),directory=path.resolve(process.env.VIDEO_WEB_DATA_DIR??path.join(root,'private/web-data'));
 const app=await createWebApp({directory,origin:process.env.VIDEO_WEB_ORIGIN??`http://127.0.0.1:${port}`});await app.listen(port);
 console.log(`Atelier privé démarré sur 127.0.0.1:${port}. Aucune URL iPhone ni aucun hébergement externe vérifié.`);
 let closing=false;for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{if(!closing){closing=true;app.close().then(()=>process.exit(0));}});
}
