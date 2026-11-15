import {readFile,writeFile,mkdir,readdir,rename,stat,unlink,open} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {root,command,importMedia,probe} from '../media.mjs';
import {renderProject,validateAssets} from '../project.mjs';
import {projectSchema,buildTimeline,parseSrt,templates} from '../../src/generator/project.ts';
import {loadConfig,sha,splitScript,defaultScript} from './config.mjs';
import {digest,json,readJson,fingerprints,intact,lock} from './store.mjs';
import {demoSpeech,chatterboxSpeech,assembleSpeech,importedSpeech,toSrt,pcm} from './speech.mjs';
export const runsRoot=path.join(root,'pipeline-runs');
export const steps=['plan','media','voice','captions','scenes','render','verify','archive'];
async function sourceFiles(dir){const result=[];for(const e of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,e.name);if(e.isDirectory())result.push(...await sourceFiles(file));else if(/\.(mjs|py|tsx?|json)$/.test(e.name))result.push(file);}return result;}
export async function identify(configFile){
 const config=await loadConfig(configFile);
 const inputs=[...config.media,...config.brag.files,...['audio','srt','referenceAudio'].map(k=>config.narration[k]).filter(Boolean)];
 const inputHashes=await fingerprints(inputs);
 const sourceHashes=await fingerprints([...(await sourceFiles(path.join(root,'src'))),...(await sourceFiles(path.join(root,'scripts'))),...(await sourceFiles(path.join(root,'adapters'))),path.join(root,'package-lock.json')]);
 const key=sha(JSON.stringify({config,inputHashes,sourceHashes}));return {config,inputHashes,key,id:key.slice(0,24),directory:path.join(runsRoot,key.slice(0,24))};
}
async function demoMedia(dir){
 await command(path.join(root,'.venv/bin/python'),[path.join(root,'scripts/pipeline/demo.py'),dir]);
 const file=path.join(dir,'video.mp4');await command('ffmpeg',['-v','error','-y','-loop','1','-i',path.join(dir,'photo.jpg'),'-t','2','-vf',"zoompan=z='min(zoom+0.0006,1.08)':d=60:s=540x960:fps=30",'-c:v','libx264','-pix_fmt','yuv420p',file]);return [path.join(dir,'photo.jpg'),file];
}
function energy(data,start=0,end=data.length/96000){
 let sum=0,count=0;for(let i=Math.max(0,Math.floor(start*48000))*2;i<Math.min(data.length,Math.floor(end*48000)*2);i+=2){sum+=(data.readInt16LE(i)/32768)**2;count++;}return count?Math.sqrt(sum/count):0;
}
function onset(data){for(let t=0;t<data.length/96000;t+=.01)if(energy(data,t,t+.02)>.0003)return t;return null;}
export async function verifyProduction(dir,duration){
 const file=path.join(dir,'final.mp4'),meta=await probe(file);const v=meta.streams.find(s=>s.codec_type==='video'),a=meta.streams.find(s=>s.codec_type==='audio');
 if(!v||v.codec_name!=='h264'||v.width!==1080||v.height!==1920||v.r_frame_rate!=='30/1'||Number(v.nb_frames)!==duration*30||Math.abs(Number(v.duration)-duration)>.001||!a||a.codec_name!=='aac'||Math.abs(Number(meta.format.duration)-duration)>.05)throw new Error('ffprobe : format, durée, audio ou nombre d’images incorrect.');
 await command('ffmpeg',['-v','error','-i',file,'-f','null','-']);const decoded=path.join(dir,'decoded-audio.wav');await command('ffmpeg',['-v','error','-y','-i',file,'-vn','-ar','48000','-ac','1','-c:a','pcm_s16le',decoded]);
 const original=pcm(await readFile(path.join(dir,'voice/narration.wav'))),rendered=pcm(await readFile(decoded));const captions=parseSrt(await readFile(path.join(dir,'captions.srt'),'utf8'));const sourceOnset=onset(original),renderOnset=onset(rendered);
 if(sourceOnset===null||renderOnset===null||Math.abs(sourceOnset-renderOnset)>.1||energy(rendered)<.0001)throw new Error('Audio silencieux ou décalé dans le MP4.');
 for(const c of captions)if(c.end>duration||energy(original,c.start,c.end)<.0001)throw new Error('Un sous-titre est hors audio ou couvre uniquement du silence.');
 const project=projectSchema.parse(await readJson(path.join(dir,'project.json')));if(JSON.stringify(project.captions)!==JSON.stringify(captions))throw new Error('Les sous-titres du montage diffèrent du SRT.');
 const report={passed:true,duration,width:v.width,height:v.height,frames:Number(v.nb_frames),fps:v.r_frame_rate,videoCodec:v.codec_name,audioCodec:a.codec_name,decoded:true,sourceAudioOnset:sourceOnset,renderedAudioOnset:renderOnset,audioRms:energy(rendered),captionCount:captions.length,captionMethod:(await readJson(path.join(dir,'voice/result.json'))).method,alignmentScope:'Measured phrase boundaries for synthesized speech; imported SRT is not a forced speech alignment.'};
 await json(path.join(dir,'verification.json'),report);return report;
}
export async function runPipeline(configFile,{dryRun=false,failOnce,restartFrom,log=console.log}={}){
 const spec=await identify(configFile);const {config:c,directory:dir,id}=spec;
 if(restartFrom&&!steps.includes(restartFrom))throw new Error('Étape --from inconnue.');
 if(failOnce&&!steps.includes(failOnce))throw new Error('Étape --fail-once inconnue.');
 if(dryRun)return {dryRun:true,id,subject:c.subject,template:c.template,duration:c.duration,engine:c.narration.engine,brag:c.brag.mode,inputCount:spec.inputHashes.length,steps,directory:dir,warnings:[...(c.narration.engine==='chatterbox'?['Runtime Chatterbox et modèles requis ; aucun téléchargement ne sera lancé en dry-run.']:[]),...(c.brag.mode==='files'?['Exports Brag importés ; aucune API Brag directe.']:[])]};
 const release=await lock(dir);let state;
 try{
  try{state=await readJson(path.join(dir,'state.json'));}catch(e){if(e.code!=='ENOENT')throw e;state={version:1,id,key:spec.key,created:new Date().toISOString(),status:'pending',steps:{},injectedFailures:[]};}
  if(state.key!==spec.key)throw new Error('Checkpoint incompatible avec les entrées.');
  await json(path.join(dir,'config.private.json'),c);
  const save=()=>json(path.join(dir,'state.json'),state);
  let invalidate=false;
  const handlers={
   plan:async()=>{
    let text=c.narration.text??defaultScript(c);
    if(c.narration.engine==='files'&&!c.narration.text)text=parseSrt(await readFile(c.narration.srt,'utf8')).map(c=>c.text).join('\n');
    const parts=splitScript(text);await writeFile(path.join(dir,'script.txt'),parts.join('\n')+'\n',{mode:0o600});
    const title=c.subject.length>28?c.subject.slice(0,25).trim()+'…':c.subject;
    const titles=[title,templates[c.template].beats[1],...(c.duration>=30?[templates[c.template].beats[2]]:[]),'Plantes & Bulles'];
    await json(path.join(dir,'plan.json'),{subject:c.subject,template:c.template,duration:c.duration,parts,titles,direction:'Voix posée, phrases courtes, respirations naturelles.',scriptOrigin:c.narration.text?'user-text':c.narration.engine==='files'?'imported-srt':'deterministic-template-no-LLM',brag:c.brag.mode});
    await writeFile(path.join(dir,'brag-brief.md'),c.template==='application'?`# Brief Brag optionnel\nSujet : ${c.subject}\nImporter les exports MP4/photos de Brag ; pas d’API de scène supposée.\n`:'# Brag non utilisé\nCe modèle ne dépend pas de Brag.\n');
    return ['script.txt','plan.json','brag-brief.md'];
   },
   media:async()=>{
    const mediaDir=path.join(dir,'media');await mkdir(mediaDir,{recursive:true,mode:0o700});
    let files=[...c.media,...(c.brag.mode==='files'?c.brag.files:[])];if(c.demo&&!files.length)files=await demoMedia(mediaDir);
    const imported=[];for(const file of files){const m=await importMedia(file);if(m.type==='audio')throw new Error('Une piste audio ne peut pas servir de scène.');m.label=c.demo?'Démo · médias et voix synthétiques':'Média personnel importé';imported.push(m);}
    await json(path.join(dir,'media.json'),imported);return [path.join(dir,'media.json'),...imported.map(m=>path.join(root,'public',m.src))];
   },
   voice:async()=>{
    const voiceDir=path.join(dir,'voice');await mkdir(voiceDir,{recursive:true,mode:0o700});const plan=await readJson(path.join(dir,'plan.json'));
    const result=c.narration.engine==='files'?await importedSpeech(c,voiceDir,parseSrt):await assembleSpeech(await(c.narration.engine==='demo'?demoSpeech(plan.parts,voiceDir,c.narration):chatterboxSpeech(plan.parts,voiceDir,c.narration)),voiceDir,c.duration);
    await json(path.join(voiceDir,'result.json'),result);return [result.audio,path.join(voiceDir,'result.json'),path.join(voiceDir,'alignment.json')];
   },
   captions:async()=>{
    const result=await readJson(path.join(dir,'voice/result.json'));
    projectSchema.parse({subject:c.subject,template:c.template,duration:c.duration,captions:result.captions});
    await writeFile(path.join(dir,'captions.srt'),toSrt(result.captions),{mode:0o600});return ['captions.srt'];
   },
   scenes:async()=>{
    const plan=await readJson(path.join(dir,'plan.json'));const result=await readJson(path.join(dir,'voice/result.json'));const {type,...audio}=await importMedia(result.audio);audio.volume=1;
    const project=projectSchema.parse({subject:c.subject,template:c.template,duration:c.duration,titles:plan.titles,media:await readJson(path.join(dir,'media.json')),captions:result.captions,captionOffset:0,audio,titleAnimation:'snapcn'});
    await validateAssets(project);await json(path.join(dir,'project.json'),project);await json(path.join(dir,'storyboard.json'),buildTimeline(project));return [path.join(dir,'project.json'),path.join(dir,'storyboard.json'),path.join(root,'public',audio.src)];
   },
   render:async()=>{await renderProject(path.join(dir,'project.json'),path.join(dir,'final.mp4'));return ['final.mp4'];},
   verify:async()=>{await verifyProduction(dir,c.duration);return ['verification.json'];},
   archive:async()=>{
    const temp=path.join(dir,`sources-${randomUUID()}.zip`);
    await command('python3',['scripts/archive.py','pack',path.join(dir,'project.json'),temp]);
    await command('python3',[path.join(root,'scripts/pipeline/package.py'),temp,dir]);await rename(temp,path.join(dir,'sources.zip'));
    let token;try{token=(await readJson(path.join(dir,'download.private.json'))).token;}catch{token=randomUUID();}
    await json(path.join(dir,'download.private.json'),{id,token,mp4:`/api/production/${id}/final.mp4?token=${token}`,zip:`/api/production/${id}/sources.zip?token=${token}`,visibility:'local-private-no-publication'});
    return ['sources.zip','download.private.json'];
   },
  };
  state.status='running';await save();
  for(const step of steps){
   if(restartFrom===step)invalidate=true;
   const previous=state.steps[step];
   if(!invalidate&&previous?.status==='done'&&await intact(previous.outputs)){log(`Réutilisé : ${step}`);continue;}
   invalidate=true;state.steps[step]={status:'running',attempts:(previous?.attempts??0)+1,started:new Date().toISOString()};await save();log(`En cours : ${step}`);
   try{
    if(failOnce===step&&!state.injectedFailures.includes(step)){state.injectedFailures.push(step);throw new Error(`Échec de test injecté à ${step}. Relancer la même commande sans --fail-once pour reprendre.`);}
    const files=(await handlers[step]()).map(f=>path.isAbsolute(f)?f:path.join(dir,f));state.steps[step]={...state.steps[step],status:'done',finished:new Date().toISOString(),outputs:await fingerprints(files)};await save();
   }catch(e){
    state.steps[step]={...state.steps[step],status:'failed',error:e.message};state.status='failed';state.failedStep=step;await save();
    throw new Error(`Production ${id} arrêtée à « ${step} » : ${e.message}\nReprise : npm run produce -- ${configFile}\nCheckpoint privé : ${path.join(dir,'state.json')}`);
   }
  }
  state.status='done';delete state.failedStep;state.finished=new Date().toISOString();await save();
  return {id,status:'done',directory:dir,mp4:path.join(dir,'final.mp4'),zip:path.join(dir,'sources.zip'),verification:path.join(dir,'verification.json'),downloadPage:`/production/${id}`};
 }finally{await release();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 process.umask(0o077);const args=process.argv.slice(2),file=args[0];
 const value=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:undefined;};
 if(!file||file.startsWith('--')){console.error('Usage : npm run produce -- config.json [--dry-run] [--from étape] [--fail-once étape]');process.exitCode=1;}
 else runPipeline(path.resolve(file),{dryRun:args.includes('--dry-run'),restartFrom:value('--from'),failOnce:value('--fail-once')}).then(result=>console.log(JSON.stringify(result,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});
}
