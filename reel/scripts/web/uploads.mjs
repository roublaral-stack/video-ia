import {mkdir,readFile,readdir,stat,open,rename,unlink,rm,statfs} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import path from 'node:path';
import {z} from 'zod';
import {json,readJson,digest} from '../pipeline/store.mjs';
import {HttpError} from './http.mjs';

export const validId=id=>/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id);
const inputSchema=z.object({name:z.string().min(1).max(180).regex(/^[^/\\\x00-\x1f]+$/),size:z.number().int().positive(),sha256:z.string().regex(/^[a-f0-9]{64}$/),kind:z.enum(['visual','narration'])});
const visuals=new Set(['.jpg','.jpeg','.png','.webp','.heic','.heif','.mp4','.mov','.m4v','.webm','.mkv']);
const audios=new Set(['.wav','.mp3']);
const publicAsset=a=>({id:a.id,name:a.name,size:a.size,sha256:a.sha256,kind:a.kind,extension:a.extension,renderSupported:!['.heic','.heif'].includes(a.extension)});

export class UploadStore {
 constructor(directory,{chunkBytes=8*1024*1024,maxFileBytes=2*1024**3,quotaBytes=10*1024**3,reserveBytes=1024**3}={}){this.directory=directory;this.chunkBytes=chunkBytes;this.maxFileBytes=maxFileBytes;this.quotaBytes=quotaBytes;this.reserveBytes=reserveBytes;this.mutex=new Map();}
 async init(){for(const name of ['uploads','assets'])await mkdir(path.join(this.directory,name),{recursive:true,mode:0o700});}
 folder(id){if(!validId(id))throw new HttpError(404,'Import inconnu.');return path.join(this.directory,'uploads',id);}
 async exclusive(id,fn){const previous=this.mutex.get(id)??Promise.resolve();let release;const next=new Promise(r=>release=r);const current=previous.then(()=>next);this.mutex.set(id,current);await previous;try{return await fn();}finally{release();if(this.mutex.get(id)===current)this.mutex.delete(id);}}
 async metadata(id){try{return await readJson(path.join(this.folder(id),'upload.json'));}catch(e){if(e.code==='ENOENT')throw new HttpError(404,'Import inconnu.');throw e;}}
 async asset(id){if(!validId(id))throw new HttpError(404,'Fichier inconnu.');try{const a=await readJson(path.join(this.directory,'assets',id,'asset.json'));return {...a,file:path.join(this.directory,'assets',id,'original'+a.extension)};}catch(e){if(e.code==='ENOENT')throw new HttpError(404,'Fichier inconnu.');throw e;}}
 async listAssets(){const files=await readdir(path.join(this.directory,'assets'));const values=[];for(const id of files)if(validId(id)){try{values.push(publicAsset(await this.asset(id)));}catch(e){if(e.status!==404)throw e;}}return values;}
 async reserved(){const sizes=new Map((await this.listAssets()).map(a=>[a.id,a.size]));for(const id of await readdir(path.join(this.directory,'uploads')))if(validId(id)){const u=await this.metadata(id);sizes.set(id,u.size);}return [...sizes.values()].reduce((n,size)=>n+size,0);}
 async create(input){return this.exclusive('quota',async()=>{
  const parsed=inputSchema.safeParse(input);if(!parsed.success)throw new HttpError(400,'Nom, taille, type ou empreinte SHA-256 invalide.');
  const value=parsed.data,extension=path.extname(value.name).toLowerCase();
  if(!(value.kind==='visual'?visuals:audios).has(extension))throw new HttpError(415,'Format non accepté pour cet import.');
  if(value.size>this.maxFileBytes)throw new HttpError(413,'Fichier supérieur à la limite configurée.');
  const existing=(await this.listAssets()).find(a=>a.sha256===value.sha256&&a.size===value.size&&a.kind===value.kind&&a.extension===extension);
  if(existing)return {status:'complete',asset:existing};
  for(const id of await readdir(path.join(this.directory,'uploads')))if(validId(id)){const u=await this.metadata(id);if(u.status==='uploading'&&u.sha256===value.sha256&&u.size===value.size&&u.kind===value.kind&&u.extension===extension)return this.status(id);}
  if(await this.reserved()+value.size>this.quotaBytes)throw new HttpError(507,'Quota privé atteint. Nettoyer les imports incomplets ou augmenter le stockage.');
  const disk=await statfs(this.directory);if(Number(disk.bavail)*Number(disk.bsize)<value.size+this.reserveBytes)throw new HttpError(507,'Espace disque insuffisant pour conserver cet original.');
  const id=randomUUID(),u={...value,id,extension,chunkBytes:this.chunkBytes,parts:{},status:'uploading',created:new Date().toISOString()};await json(path.join(this.folder(id),'upload.json'),u);return this.status(id);
 });}
 async status(id){const u=await this.metadata(id);return {id:u.id,name:u.name,size:u.size,sha256:u.sha256,kind:u.kind,status:u.status,chunkBytes:u.chunkBytes,parts:Object.entries(u.parts).map(([index,p])=>({index:Number(index),...p})),uploadedBytes:Object.values(u.parts).reduce((n,p)=>n+p.size,0),...(u.status==='complete'?{asset:publicAsset(await this.asset(id))}:{})};}
 async part(id,index,expectedHash,req){return this.exclusive(id,async()=>{
  const u=await this.metadata(id);if(u.status!=='uploading')throw new HttpError(409,'Cet import est déjà terminé.');
  const count=Math.ceil(u.size/u.chunkBytes);if(!Number.isSafeInteger(index)||index<0||index>=count||!/^[a-f0-9]{64}$/.test(expectedHash??''))throw new HttpError(400,'Morceau ou empreinte invalide.');
  const expectedSize=Math.min(u.chunkBytes,u.size-index*u.chunkBytes);
  if(req.headers['content-length']&&Number(req.headers['content-length'])!==expectedSize)throw new HttpError(413,'Taille du morceau incorrecte.');
  if(u.parts[index]){req.resume();if(u.parts[index].sha256!==expectedHash)throw new HttpError(409,'Ce morceau existe avec une autre empreinte.');return {accepted:true,reused:true};}
  const target=path.join(this.folder(id),`${index}.chunk`),temp=target+'.tmp-'+randomUUID();let length=0;const hash=createHash('sha256'),fd=await open(temp,'wx',0o600);
  try{
   for await(const data of req){length+=data.length;if(length>expectedSize)throw new HttpError(413,'Morceau trop volumineux.');hash.update(data);let offset=0;while(offset<data.length){const {bytesWritten}=await fd.write(data,offset,data.length-offset);offset+=bytesWritten;}}
   if(length!==expectedSize||hash.digest('hex')!==expectedHash)throw new HttpError(422,'Intégrité du morceau refusée. Réessayer ce morceau.');
   await fd.sync();await fd.close();await rename(temp,target);u.parts[index]={size:length,sha256:expectedHash};u.updated=new Date().toISOString();await json(path.join(this.folder(id),'upload.json'),u);return {accepted:true,reused:false};
  }catch(e){await fd.close().catch(()=>{});await unlink(temp).catch(()=>{});throw e;}
 });}
 async complete(id){return this.exclusive(id,async()=>{
  const u=await this.metadata(id);if(u.status==='complete')return publicAsset(await this.asset(id));
  const count=Math.ceil(u.size/u.chunkBytes);for(let i=0;i<count;i++)if(!u.parts[i])throw new HttpError(409,'Import incomplet : reprendre les morceaux manquants.');
  const disk=await statfs(this.directory);if(Number(disk.bavail)*Number(disk.bsize)<u.size+this.reserveBytes)throw new HttpError(507,'Espace insuffisant pour assembler le fichier. Les morceaux sont conservés.');
  const folder=path.join(this.directory,'assets',id);await mkdir(folder,{recursive:true,mode:0o700});const temp=path.join(folder,'final.tmp-'+randomUUID()),fd=await open(temp,'wx',0o600),whole=createHash('sha256');
  try{
   for(let i=0;i<count;i++){
    const partHash=createHash('sha256');let size=0;for await(const data of createReadStream(path.join(this.folder(id),`${i}.chunk`))){whole.update(data);partHash.update(data);size+=data.length;let offset=0;while(offset<data.length){const {bytesWritten}=await fd.write(data,offset,data.length-offset);offset+=bytesWritten;}}
    if(size!==u.parts[i].size||partHash.digest('hex')!==u.parts[i].sha256){delete u.parts[i];await unlink(path.join(this.folder(id),`${i}.chunk`)).catch(()=>{});await json(path.join(this.folder(id),'upload.json'),u);throw new HttpError(422,`Morceau ${i+1} corrompu sur le stockage : le renvoyer.`);}
   }
   if(whole.digest('hex')!==u.sha256)throw new HttpError(422,'Empreinte intégrale incorrecte. Réimporter le fichier original.');
   await fd.sync();await fd.close();const original=path.join(folder,'original'+u.extension);
   try{await stat(original);if(await digest(original)!==u.sha256)throw new HttpError(409,'Original existant incohérent, aucun écrasement.');await unlink(temp);}catch(e){if(e.code!=='ENOENT')throw e;await rename(temp,original);}
   const asset={id:u.id,name:u.name,size:u.size,sha256:u.sha256,kind:u.kind,extension:u.extension,verified:true,created:u.created};await json(path.join(folder,'asset.json'),asset);
   u.status='complete';await json(path.join(this.folder(id),'upload.json'),u);
   for(let i=0;i<count;i++)await unlink(path.join(this.folder(id),`${i}.chunk`)).catch(()=>{});return publicAsset(asset);
  }catch(e){await fd.close().catch(()=>{});await unlink(temp).catch(()=>{});throw e;}
 });}
 async cancel(id){return this.exclusive(id,async()=>{const u=await this.metadata(id);if(u.status==='complete')throw new HttpError(409,'L’original vérifié est conservé.');await rm(this.folder(id),{recursive:true});});}
}
