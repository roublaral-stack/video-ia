import {mkdir,readdir,readFile,writeFile,appendFile,stat} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import path from 'node:path';
import {z} from 'zod';
import {json,readJson,digest} from '../pipeline/store.mjs';
import {loadConfig} from '../pipeline/config.mjs';
import {identify} from '../pipeline/run.mjs';
import {preflight} from '../pipeline/creative.mjs';
import {approvePreview} from '../pipeline/review.mjs';
import {root} from '../media.mjs';
import {HttpError} from './http.mjs';
import {validId} from './uploads.mjs';

const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const draftSchema=z.object({subject:z.string().trim().min(1).max(120),script:z.string().trim().min(1).max(10000),scriptValidated:z.boolean(),template:z.enum(['educatif','vlog','application']),duration:z.union([z.literal(15),z.literal(30),z.literal(60)]),mediaIds:z.array(z.string().uuid()).max(30),audioId:z.string().uuid().nullable().default(null),hook:z.string().max(72).default(''),intention:z.string().max(600).default(''),workingCopiesConsent:z.boolean()}).strict();
export class JobStore {
 constructor(directory,uploads){this.directory=directory;this.uploads=uploads;this.queue=[];this.active=null;this.stopping=false;this.starting=false;this.runs=path.join(directory,'pipeline-runs');}
 async init(){for(const name of ['projects','jobs','pipeline-runs'])await mkdir(path.join(this.directory,name),{recursive:true,mode:0o700});for(const id of await readdir(path.join(this.directory,'jobs')))if(validId(id)){const j=await this.get(id);if(j.status==='running'){j.status='interrupted';j.error='Traitement serveur interrompu. Relancer pour reprendre les checkpoints.';await this.saveJob(j);}else if(j.status==='queued')this.queue.push(j.id);}setImmediate(()=>this.pump());}
 async project(id){if(!validId(id))throw new HttpError(404,'Projet inconnu.');try{return await readJson(path.join(this.directory,'projects',id,'project.json'));}catch(e){if(e.code==='ENOENT')throw new HttpError(404,'Projet inconnu.');throw e;}}
 async projects(){const all=[];for(const id of await readdir(path.join(this.directory,'projects')))if(validId(id))all.push(await this.project(id));return all.sort((a,b)=>b.updated.localeCompare(a.updated));}
 async saveProject(input,id){const p=draftSchema.safeParse(input);if(!p.success)throw new HttpError(400,'Projet invalide. Vérifier script, modèle, durée et médias.');if(id)await this.project(id);else id=randomUUID();const value=p.data;
  for(const mid of value.mediaIds)if((await this.uploads.asset(mid)).kind!=='visual')throw new HttpError(400,'Un audio ne peut pas servir de vidéo/photo.');
  if(value.audioId&&(await this.uploads.asset(value.audioId)).kind!=='narration')throw new HttpError(400,'Piste ElevenLabs invalide.');
  const project={id,...value,revision:hash(value),updated:new Date().toISOString()};await json(path.join(this.directory,'projects',id,'project.json'),project);return project;
 }
 async get(id){if(!validId(id))throw new HttpError(404,'Traitement inconnu.');try{return await readJson(path.join(this.directory,'jobs',id,'job.json'));}catch(e){if(e.code==='ENOENT')throw new HttpError(404,'Traitement inconnu.');throw e;}}
 async saveJob(j){await json(path.join(this.directory,'jobs',j.id,'job.json'),j);}
 async config(project){
  if(!project.workingCopiesConsent)throw new HttpError(409,'Autoriser les copies de travail nécessaires au montage. Les originaux resteront inchangés.');
  if(!project.scriptValidated)throw new HttpError(409,'Valider le texte exact du script avant de générer un aperçu.');
  if(!project.mediaIds.length)throw new HttpError(409,'Importer au moins une vraie photo ou vidéo avant de rendre le montage. Le script seul peut être enregistré.');
  const media=[];for(const id of project.mediaIds){const a=await this.uploads.asset(id);if(['.heic','.heif'].includes(a.extension))throw new HttpError(415,'HEIC conservé intact, mais non pris en charge par ce pipeline. Fournir un JPEG ou autoriser une conversion dans une future étape.');media.push(a.file);}
  const audio=project.audioId?await this.uploads.asset(project.audioId):null;
  return {version:1,mode:'production',subject:project.subject,template:project.template,duration:project.duration,script:{text:project.script,validated:true},media,visualStyle:'cinematic',captionStyle:'editorial',narration:audio?{engine:'files',audio:audio.file,origin:'elevenlabs-export',durationPolicy:'audio',alignment:{mode:'acoustic',model:path.join(root,'.alignment/fr'),python:path.join(root,'.venv/bin/python')}}:{engine:'none'},creative:{hook:project.hook||project.subject,intention:project.intention},exceptions:{illustrations:false,demoVoice:false},brag:{mode:'off',files:[]}};
 }
 async create(projectId){return this.uploads.exclusive('job-create-'+projectId,async()=>{const project=await this.project(projectId),config=await this.config(project);const configFile=path.join(this.directory,'projects',project.id,`revision-${project.revision}.private.json`);await json(configFile,config);await preflight(await loadConfig(configFile));const spec=await identify(configFile,{directoryRoot:this.runs});
  const key=hash([project.id,project.revision,spec.key]);for(const id of await readdir(path.join(this.directory,'jobs')))if(validId(id)){const j=await this.get(id);if(j.key===key)return this.publicJob(j);}
  const j={id:randomUUID(),projectId,revision:project.revision,key,configFile,status:'queued',phase:'En attente',created:new Date().toISOString(),attempts:0};await this.saveJob(j);this.queue.push(j.id);setImmediate(()=>this.pump());return this.publicJob(j);
 });}
 publicJob(j){return {id:j.id,projectId:j.projectId,revision:j.revision,created:j.created,status:j.status,phase:j.phase,error:j.error,progress:j.progress,attempts:j.attempts,result:j.result?{status:j.result.status,stage:j.result.stage,captionTiming:j.result.captionTiming,previewSha:j.result.previewSha??j.previewSha,assets:{preview:`/api/jobs/${j.id}/files/preview`,zip:`/api/jobs/${j.id}/files/zip`,srt:`/api/jobs/${j.id}/files/srt`,...(j.result.status==='done'?{mp4:`/api/jobs/${j.id}/files/mp4`,finalZip:`/api/jobs/${j.id}/files/final-zip`}:{})}}:undefined};}
 async resume(id){const j=await this.get(id);if(!['failed','interrupted'].includes(j.status))throw new HttpError(409,'Ce traitement ne nécessite pas de reprise.');j.status='queued';delete j.error;await this.saveJob(j);if(!this.queue.includes(id))this.queue.push(id);setImmediate(()=>this.pump());return this.publicJob(j);}
 async approve(id,input){const j=await this.get(id),p=await this.project(j.projectId);if(j.status!=='awaiting_review'||!j.result||p.revision!==j.revision)throw new HttpError(409,'Aperçu périmé ou indisponible : générer la version actuelle.');
  if(input.confirmed!==true||typeof input.note!=='string'||input.note.trim().length<12||input.note.length>2000)throw new HttpError(400,'Confirmer le visionnage et fournir une note de validation.');
  const dir=path.dirname(j.result.preview);await approvePreview(dir,input.previewSha,input.note,{reviewer:'authenticated-owner'});j.previewSha=input.previewSha;j.status='queued';delete j.error;await this.saveJob(j);this.queue.push(j.id);setImmediate(()=>this.pump());return this.publicJob(j);
 }
 async file(id,name){const j=await this.get(id);const result=j.result;if(!result)throw new HttpError(404,'Résultat indisponible.');
  const keys={preview:'preview',zip:'zip',srt:'srt',mp4:'mp4','final-zip':'zip'};if(!keys[name]||(['mp4','final-zip'].includes(name)&&result.status!=='done'))throw new HttpError(409,'Fichier indisponible avant validation et export.');
  const file=name==='zip'&&result.status==='done'?path.join(path.dirname(result.preview),'preview-sources.zip'):result[keys[name]];
  if(!file||!path.resolve(file).startsWith(this.runs+path.sep))throw new HttpError(404,'Fichier indisponible.');await stat(file);return {file,name:path.basename(file),mime:file.endsWith('.mp4')?'video/mp4':file.endsWith('.zip')?'application/zip':'application/x-subrip; charset=utf-8'};
 }
 async pump(){if(this.stopping||this.active||this.starting)return;this.starting=true;try{
  const id=this.queue.shift();if(!id)return;const j=await this.get(id);j.status='running';j.phase='Préparation';j.attempts++;await this.saveJob(j);
  const resultFile=path.join(this.directory,'jobs',id,'result.private.json'),logFile=path.join(this.directory,'jobs',id,'worker.log');
  const child=spawn(process.execPath,[path.join(root,'scripts/web/worker.mjs'),j.configFile,resultFile],{cwd:root,detached:true,env:{PATH:process.env.PATH,LANG:process.env.LANG??'C.UTF-8',HOME:process.env.HOME,REMOTION_BROWSER_EXECUTABLE:process.env.REMOTION_BROWSER_EXECUTABLE??'/usr/bin/chromium',VIDEO_IA_RUNS_DIR:this.runs,VIDEO_IA_MAX_MEDIA_BYTES:String(this.uploads.maxFileBytes)},stdio:['ignore','pipe','pipe']});this.active={child,id};let tail='';
  const output=data=>{const value=data.toString();tail=(tail+value).slice(-8000);appendFile(logFile,data,{mode:0o600}).catch(()=>{});const step=[...value.matchAll(/(?:En cours|Réutilisé) : (\w+)/g)].at(-1);if(step)j.phase=step[1];const frame=[...value.matchAll(/Rendered (\d+)\/(\d+)/g)].at(-1);if(frame)j.progress={rendered:+frame[1],total:+frame[2]};};child.stdout.on('data',output);child.stderr.on('data',output);
  const ticker=setInterval(()=>this.saveJob(j).catch(()=>{}),1000);ticker.unref();
  child.once('error',e=>{tail=e.message;});child.once('close',async code=>{clearInterval(ticker);try{
   if(this.stopping){j.status='interrupted';j.error='Serveur arrêté ; reprise nécessaire.';}
   else if(code===0){const result=await readJson(resultFile);j.result={...j.result,...result};j.previewSha=result.previewSha??j.previewSha;j.status=result.status;j.phase='Aperçu disponible';}
   else{j.status='failed';j.error=tail.replaceAll(this.directory,'[stockage privé]').slice(-2500)||'Le traitement serveur a échoué.';}
   await this.saveJob(j);
  }catch(e){j.status='failed';j.error=e.message;await this.saveJob(j);}finally{this.active=null;setImmediate(()=>this.pump());}});
 }finally{this.starting=false;}}
 async close(){this.stopping=true;if(this.active){const {child}=this.active;const closed=new Promise(r=>child.once('close',r));try{process.kill(-child.pid,'SIGTERM');}catch{}const kill=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},1500);await closed;clearTimeout(kill);}}
}
