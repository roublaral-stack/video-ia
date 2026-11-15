import http from 'node:http';
import {serveProduction} from './pipeline/downloads.mjs';
import {readFile,writeFile,mkdir,unlink,stat} from 'node:fs/promises';
import {createWriteStream,createReadStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {Transform} from 'node:stream';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,importMedia} from './media.mjs';
import {projectSchema,buildTimeline,parseSrt,makeCaptions} from '../src/generator/project.ts';
import {validateAssets,renderProject} from './project.mjs';
const jobs=new Map();let importing=false;
const json=(res,code,data)=>{res.writeHead(code,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));};
async function body(req,limit=1024*1024){let size=0;const chunks=[];for await(const b of req){size+=b.length;if(size>limit)throw new Error('Requête trop volumineuse');chunks.push(b);}return Buffer.concat(chunks);}
const server=http.createServer(async(req,res)=>{
 try{
  if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)return json(res,403,{error:'Origine refusée'});
  const url=new URL(req.url,'http://localhost');
  if(await serveProduction(req,res,url))return;
  if(req.method==='GET'&&url.pathname==='/'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(await readFile(path.join(root,'editor/index.html')));}
  if(req.method==='POST'&&url.pathname==='/api/import'){
   if(importing)throw new Error('Un import est déjà en cours.');importing=true;let file;
   try{
    const name=url.searchParams.get('name')??'';const ext=path.extname(name).toLowerCase();if(!/^\.[a-z0-9]{2,5}$/.test(ext))throw new Error('Extension invalide');
    file=path.join('/tmp',`video-ia-${randomUUID()}${ext}`);let size=0;
    await pipeline(req,new Transform({transform(chunk,_,cb){size+=chunk.length;cb(size>500*1024*1024?new Error('Maximum 500 Mo'):null,chunk);}}),createWriteStream(file,{flags:'wx'}));
    return json(res,200,await importMedia(file));
   }finally{importing=false;if(file)await unlink(file).catch(()=>{});}
  }
  if(req.method==='POST'&&url.pathname==='/api/captions/auto'){const p=JSON.parse((await body(req)).toString());if(![15,30,60].includes(p.duration)||typeof p.text!=='string')throw new Error('Texte ou durée invalide');return json(res,200,makeCaptions(p.text,p.duration));}
  if(req.method==='POST'&&url.pathname==='/api/srt')return json(res,200,parseSrt((await body(req)).toString('utf8')));
  if(req.method==='POST'&&url.pathname==='/api/projects'){
   const p=await validateAssets(JSON.parse((await body(req)).toString('utf8')));const id=randomUUID();await mkdir(path.join(root,'projects'),{recursive:true});await writeFile(path.join(root,'projects',id+'.json'),JSON.stringify(p,null,2));return json(res,200,{id,project:p,timeline:buildTimeline(p)});
  }
  const project=/^\/api\/projects\/([\w-]+)$/.exec(url.pathname);
  if(req.method==='GET'&&project){res.writeHead(200,{'content-type':'application/json'});return res.end(await readFile(path.join(root,'projects',project[1]+'.json')));}
  if(req.method==='POST'&&url.pathname==='/api/render'){
   if([...jobs.values()].some(j=>j.status==='running'))throw new Error('Un export est déjà en cours.');
   const {id}=JSON.parse((await body(req)).toString());if(!/^[\w-]+$/.test(id))throw new Error('Projet invalide');
   const file=path.join(root,'projects',id+'.json');await validateAssets(JSON.parse(await readFile(file,'utf8')));
   const jobId=randomUUID();jobs.set(jobId,{status:'running',project:id});
   renderProject(file,path.join(root,'out',jobId+'.mp4')).then(()=>jobs.set(jobId,{status:'done',url:'/exports/'+jobId+'.mp4'})).catch(e=>jobs.set(jobId,{status:'failed',error:e.message}));
   return json(res,202,{jobId});
  }
  const job=/^\/api\/jobs\/([\w-]+)$/.exec(url.pathname);if(req.method==='GET'&&job)return json(res,jobs.has(job[1])?200:404,jobs.get(job[1])??{error:'Export inconnu'});
  const output=/^\/exports\/([\w-]+)\.mp4$/.exec(url.pathname);
  if(req.method==='GET'&&output){if(jobs.get(output[1])?.status!=='done')return json(res,404,{error:'Export indisponible'});const file=path.join(root,'out',output[1]+'.mp4');const info=await stat(file);res.writeHead(200,{'content-type':'video/mp4','content-length':info.size,'content-disposition':'attachment; filename="plantes-bulles.mp4"'});return createReadStream(file).pipe(res);}
  json(res,404,{error:'Introuvable'});
 }catch(e){if(!res.headersSent)json(res,400,{error:e.message});else res.destroy();}
});
server.listen(Number(process.env.PORT||3210),'127.0.0.1',()=>console.log(`VIDEO IA editor: http://127.0.0.1:${server.address().port}`));
