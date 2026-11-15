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
import {configuredGroups,provisionalCaptions,validateGroups} from './script-captions.mjs';
export const runsRoot=path.resolve(process.env.VIDEO_IA_RUNS_DIR??path.join(root,'pipeline-runs'));
export const steps=['plan','media','voice','captions','scenes','render','verify','archive'];
async function sourceFiles(dir){const result=[];for(const e of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,e.name);if(e.isDirectory())result.push(...await sourceFiles(file));else if(/\.(mjs|py|tsx?|json)$/.test(e.name))result.push(file);}return result;}
export async function identify(configFile,{directoryRoot=runsRoot}={}){
 const config=await loadConfig(configFile);
 const inputs=[...config.media,...config.brag.files,...['audio','srt','referenceAudio'].map(k=>config.narration[k]).filter(Boolean)];
 if(config.music)inputs.push(config.music.audio);
 if(config.subtitles.srt)inputs.push(config.subtitles.srt);
 if(config.narration.alignment.model){const model=config.narration.alignment.model;inputs.push(path.join(model,'dictionary.dict'));for(const e of await readdir(path.join(model,'acoustic_model'),{withFileTypes:true})){if(e.isFile())inputs.push(path.join(model,'acoustic_model',e.name));}for(const name of ['custom.dict','provenance.json']){try{await stat(path.join(model,name));inputs.push(path.join(model,name));}catch(e){if(e.code!=='ENOENT')throw e;}}}
 if(config.narration.modelDirectory){for(const name of ['ve.pt','s3gen.pt','t3_mtl23ls_v3.safetensors','grapheme_mtl_merged_expanded_v1.json'])inputs.push(path.join(config.narration.modelDirectory,name));}
 const inputHashes=await fingerprints(inputs);
 const fonts=(await readdir(path.join(root,'public/fonts'))).filter(f=>/\.ttf$/.test(f)).sort().map(f=>path.join(root,'public/fonts',f));
 const sourceHashes=await fingerprints([...(await sourceFiles(path.join(root,'src'))),...(await sourceFiles(path.join(root,'scripts'))),...(await sourceFiles(path.join(root,'adapters'))),...fonts,...['package.json','package-lock.json','tsconfig.json','requirements-alignment.txt','requirements-render.txt'].map(f=>path.join(root,f))]);
 const key=sha(JSON.stringify({config,inputHashes,sourceHashes}));return {config,inputHashes,key,id:key.slice(0,24),directory:path.join(directoryRoot,key.slice(0,24))};
}
async function demoMedia(dir){
 await command(path.join(root,'.venv/bin/python'),[path.join(root,'scripts/pipeline/demo.py'),dir]);
 const file=path.join(dir,'video.mp4');await command('ffmpeg',['-v','error','-y','-loop','1','-i',path.join(dir,'photo.jpg'),'-t','2','-vf',"zoompan=z='min(zoom+0.0006,1.08)':d=60:s=540x960:fps=30",'-c:v','libx264','-pix_fmt','yuv420p',file]);return [path.join(dir,'photo.jpg'),file];
}
function energy(data,start=0,end=data.length/96000){
 let sum=0,count=0;for(let i=Math.max(0,Math.floor(start*48000))*2;i<Math.min(data.length,Math.floor(end*48000)*2);i+=2){sum+=(data.readInt16LE(i)/32768)**2;count++;}return count?Math.sqrt(sum/count):0;
}
function onset(data){for(let t=0;t<data.length/96000;t+=.01)if(energy(data,t,t+.02)>.0003)return t;return null;}
export async function verifyProduction(dir,duration,{kind='final',width=1080,height=1920}={}){
 const file=path.join(dir,kind+'.mp4'),meta=await probe(file);
 const v=meta.streams.find(s=>s.codec_type==='video'),a=meta.streams.find(s=>s.codec_type==='audio');
 const project=projectSchema.parse(await readJson(path.join(dir,'project.json')));
 const voice=await readJson(path.join(dir,'voice/result.json'));
 if(!v||v.codec_name!=='h264'||v.width!==width||v.height!==height||v.r_frame_rate!=='30/1'||Number(v.nb_frames)!==Math.round(duration*30)||Math.abs(Number(v.duration)-duration)>.001||Math.abs(Number(meta.format.duration)-duration)>.08)throw new Error('ffprobe : format, durée ou nombre d’images incorrect.');
 if(project.audio?(!a||a.codec_name!=='aac'):Boolean(a))throw new Error('ffprobe : piste audio absente ou inattendue dans cet aperçu.');
 await command('ffmpeg',['-v','error','-i',file,'-f','null','-']);
 const captions=parseSrt(await readFile(path.join(dir,'captions.srt'),'utf8'));
 if(JSON.stringify(project.captions)!==JSON.stringify(captions))throw new Error('Les sous-titres du montage diffèrent du SRT.');
 let sourceIntegrity,sourceOnset=null,renderOnset=null,audioRms=null;
 if(a){
  const decoded=path.join(dir,kind==='final'?'decoded-audio.wav':'preview-decoded-audio.wav');
  await command('ffmpeg',['-v','error','-y','-i',file,'-vn','-ar','48000','-ac','1','-c:a','pcm_s16le',decoded]);
  const rendered=pcm(await readFile(decoded));renderOnset=onset(rendered);audioRms=energy(rendered);
  if(renderOnset===null||audioRms<.0001)throw new Error('Piste audio silencieuse dans le MP4.');
  if(voice.engine!=='none'){
   const original=pcm(await readFile(path.join(dir,'voice/narration.wav')));sourceOnset=onset(original);
   if(sourceOnset===null||Math.abs(sourceOnset-renderOnset)>.1)throw new Error('Audio silencieux ou décalé dans le MP4.');
   for(const cue of captions)if(cue.end>duration||energy(original,cue.start,cue.end)<.0001)throw new Error('Un sous-titre est hors audio ou couvre uniquement du silence.');
   if(voice.engine==='files'){
    if(await digest(voice.originalFile)!==voice.inputSha256)throw new Error('Le fichier vocal source a changé depuis son import.');
    const integrity=path.join(dir,kind==='final'?'voice-integrity.json':'preview-voice-integrity.json');
    await command(path.join(root,'.venv/bin/python'),[path.join(root,'scripts/verify-original-audio.py'),voice.originalFile,path.join(dir,'voice/narration.wav'),decoded,integrity]);
    sourceIntegrity=await readJson(integrity);
   }
  }
 }
 const report={passed:true,sourceIntegrity,duration,width:v.width,height:v.height,frames:Number(v.nb_frames),fps:v.r_frame_rate,videoCodec:v.codec_name,audioCodec:a?.codec_name??null,audioMode:voice.engine==='none'?(a?'music-preview':'silent'):'narration',voicePresent:voice.engine!=='none',decoded:true,sourceAudioOnset:sourceOnset,renderedAudioOnset:renderOnset,audioRms,captionCount:captions.length,captionMethod:voice.method,captionTiming:project.captionTiming,subtitlesSynchronized:!voice.provisional,alignmentScope:voice.provisional?'PROVISIONAL: reading timings from the validated script; no speech or acoustic synchronization.':voice.method==='pocketsphinx-fr-forced-word-alignment'?'Local acoustic forced word alignment of the supplied French transcript. No independent ASR or perceptual listening claimed.':voice.engine==='files'?'Imported SRT timings, not forced-aligned to speech.':'Measured synthesized phrase boundaries.'};
 await json(path.join(dir,kind==='final'?'verification.json':'preview-verification.json'),report);return report;
}
export function createHandlers(c,dir){
 return {
   plan:async()=>{
    const text=c.script?.text??(c.narration.engine==='files'?parseSrt(await readFile(c.narration.srt,'utf8')).map(c=>c.text).join('\n'):c.narration.text??defaultScript(c));
    const parts=splitScript(text);await writeFile(path.join(dir,'script.txt'),parts.join('\n')+'\n',{mode:0o600});
    const title=c.subject.length>28?c.subject.slice(0,25).trim()+'…':c.subject;
    const titles=[title,templates[c.template].beats[1],...(c.duration>=30?[templates[c.template].beats[2]]:[]),'Plantes & Bulles'];
    await json(path.join(dir,'plan.json'),{subject:c.subject,template:c.template,duration:c.duration,requestedDuration:c.requestedDuration??c.duration,parts,titles,direction:'Voix posée, phrases courtes, respirations naturelles.',scriptOrigin:c.script?'validated-script':c.narration.engine==='files'?'imported-srt':c.narration.text?'user-text':'deterministic-template-no-LLM',brag:c.brag.mode});
    await writeFile(path.join(dir,'brag-brief.md'),c.template==='application'?`# Brief Brag optionnel\nSujet : ${c.subject}\nImporter les exports MP4/photos de Brag ; pas d’API de scène supposée.\n`:'# Brag non utilisé\nCe modèle ne dépend pas de Brag.\n');
    return ['script.txt','plan.json','brag-brief.md'];
   },
   media:async()=>{
    const mediaDir=path.join(dir,'media');await mkdir(mediaDir,{recursive:true,mode:0o700});
    let files=[...c.media,...(c.brag.mode==='files'?c.brag.files:[])];if(c.demo&&!files.length)files=await demoMedia(mediaDir);
    const imported=[];for(const file of files){const m=await importMedia(file);if(m.type==='audio')throw new Error('Une piste audio ne peut pas servir de scène.');m.label=c.demo?'Mode démonstration':'Média réel importé';imported.push(m);}
    await json(path.join(dir,'media.json'),imported);return [path.join(dir,'media.json'),...imported.map(m=>path.join(root,'public',m.src))];
   },
   voice:async()=>{
    const voiceDir=path.join(dir,'voice');await mkdir(voiceDir,{recursive:true,mode:0o700});const plan=await readJson(path.join(dir,'plan.json'));
    if(c.narration.engine==='none'){
     const groups=await configuredGroups(c,parseSrt);const captions=c.subtitles.srt?parseSrt(await readFile(c.subtitles.srt,'utf8')):provisionalCaptions(groups,c.duration);
     const result={engine:'none',method:c.subtitles.srt?'edited-script-provisional-timing':'script-provisional-weighted-reading',provisional:true,synchronized:false,captions};
     await json(path.join(voiceDir,'result.json'),result);return [path.join(voiceDir,'result.json')];
    }
    const result=c.narration.engine==='files'?await importedSpeech(c,voiceDir,parseSrt):await assembleSpeech(await(c.narration.engine==='demo'?demoSpeech(plan.parts,voiceDir,c.narration):chatterboxSpeech(plan.parts,voiceDir,c.narration)),voiceDir,c.duration,{natural:c.mode==='production'});
    await json(path.join(voiceDir,'result.json'),result);return [result.audio,path.join(voiceDir,'result.json'),path.join(voiceDir,'alignment.json'),...(c.narration.alignment.mode==='acoustic'?[path.join(voiceDir,'acoustic-alignment.json')]:[])];
   },
   captions:async()=>{
    const result=await readJson(path.join(dir,'voice/result.json'));
    if(c.script)validateGroups(c.script.text,result.captions.map(x=>x.text),c.subtitles);
    if(c.mode==='production'&&result.captions.some(cue=>cue.text.length>52||cue.text.split(/\s+/).length>7))throw new Error('Sous-titres trop longs pour le mobile. Recaler acoustiquement ou fournir des groupes vérifiés de 7 mots / 52 caractères maximum.');
    projectSchema.parse({subject:c.subject,template:c.template,duration:c.duration,durationPolicy:c.narration.durationPolicy,captions:result.captions});
    const status=result.provisional?'provisional':result.method==='pocketsphinx-fr-forced-word-alignment'?'aligned':'reviewed';
    const srt=toSrt(result.captions),named=`captions.${status}.srt`;await writeFile(path.join(dir,'captions.srt'),srt,{mode:0o600});await writeFile(path.join(dir,named),srt,{mode:0o600});
    await json(path.join(dir,'captions.timing.json'),{status,synchronized:status!=='provisional',method:result.method,srt:named,editable:true,notice:status==='provisional'?'TIMINGS PROVISOIRES — aucune voix présente, aucune synchronisation vocale.':'Alignement à vérifier à l’écoute avant validation HD.'});
    return ['captions.srt',named,'captions.timing.json'];
   },
   scenes:async()=>{
    const plan=await readJson(path.join(dir,'plan.json'));const result=await readJson(path.join(dir,'voice/result.json'));let audio;
    if(c.narration.engine!=='none'){const {type,...track}=await importMedia(c.narration.engine==='files'?result.originalFile:result.audio,{preserveAudio:c.narration.engine==='files'});audio={...track,volume:1,preserveSource:c.narration.engine==='files'};}
    else if(c.music){const {type,...track}=await importMedia(c.music.audio);if(type!=='audio')throw new Error('La musique doit être un fichier audio.');audio={...track,volume:c.music.volume,loop:c.music.loop};}
    const project=projectSchema.parse({subject:c.subject,template:c.template,duration:c.duration,durationPolicy:c.narration.durationPolicy,requestedDuration:c.requestedDuration,titles:plan.titles,media:await readJson(path.join(dir,'media.json')),captions:result.captions,captionTiming:result.provisional?'provisional':result.method==='pocketsphinx-fr-forced-word-alignment'?'aligned':'reviewed',captionAnimation:c.subtitles.animation,phraseBoundaries:result.phraseBoundaries,audioRole:c.music?'music':'narration',captionOffset:0,audio,titleAnimation:'snapcn',visualStyle:c.visualStyle,captionStyle:c.captionStyle,productionMode:c.mode,allowIllustrations:c.mode==='demo'||c.exceptions.illustrations});
    await validateAssets(project);await json(path.join(dir,'project.json'),project);await json(path.join(dir,'storyboard.json'),buildTimeline(project));return [path.join(dir,'project.json'),path.join(dir,'storyboard.json'),...(audio?[path.join(root,'public',audio.src)]:[])];
   },
   render:async()=>{await renderProject(path.join(dir,'project.json'),path.join(dir,'final.mp4'));return ['final.mp4'];},
   verify:async()=>{await verifyProduction(dir,c.duration);const voice=await readJson(path.join(dir,'voice/result.json'));return ['verification.json',...(voice.engine==='files'?['voice-integrity.json']:[])];},
   archive:async()=>{
    const id=path.basename(dir);
    const temp=path.join(dir,`sources-${randomUUID()}.zip`);
    await command('python3',['scripts/archive.py','pack',path.join(dir,'project.json'),temp]);
    await command('python3',[path.join(root,'scripts/pipeline/package.py'),temp,dir]);await rename(temp,path.join(dir,'sources.zip'));
    let token;try{token=(await readJson(path.join(dir,'download.private.json'))).token;}catch{token=randomUUID();}
    await json(path.join(dir,'download.private.json'),{id,token,mp4:`/api/production/${id}/final.mp4?token=${token}`,zip:`/api/production/${id}/sources.zip?token=${token}`,visibility:'local-private-no-publication'});
    return ['sources.zip','download.private.json'];
   },
 };
}
export async function runPipeline(configFile,{dryRun=false,failOnce,restartFrom,log=console.log}={}){
 const spec=await identify(configFile);const {config:c,directory:dir,id}=spec;
 if(c.mode==='production')throw new Error('Le mode production passe par npm run produce et son aperçu obligatoire.');
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
  const handlers=createHandlers(c,dir);
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
