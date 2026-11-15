import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loadConfig} from './pipeline/config.mjs';
import {identify,createHandlers,verifyProduction,runPipeline} from './pipeline/run.mjs';
import {root,command} from './media.mjs';
import {renderProject} from './project.mjs';
import {projectSchema} from '../src/generator/project.ts';
import {json,readJson,lock,fingerprints,intact,digest} from './pipeline/store.mjs';
import {preflight,createCuts,reviewBrief} from './pipeline/creative.mjs';
import {approvePreview,assertApproval} from './pipeline/review.mjs';
import {attachAudio} from './pipeline/attach-audio.mjs';
export const productionSteps=['plan','media','voice','captions','scenes','preview','review','render','verify','archive'];
async function downloadLinks(dir,id,done=false){
 let token;try{token=(await readJson(path.join(dir,'download.private.json'))).token;}catch{token=randomUUID();}
 const link=file=>`/api/production/${id}/${file}?token=${token}`;
 const timing=await readJson(path.join(dir,'captions.timing.json'));
 await json(path.join(dir,'download.private.json'),{id,token,preview:link('preview.mp4'),draftZip:link('preview-sources.zip'),srt:link(timing.srt),...(done?{mp4:link('final.mp4'),zip:link('sources.zip')}:{}),visibility:'local-private-no-publication'});
}
export async function runProduction(configFile,{dryRun=false,failOnce,restartFrom,approve,reviewNote,reviewer='user',audioFile,origin,log=console.log}={}){
 if(audioFile){
  const attachment=await attachAudio(configFile,audioFile,{origin,dryRun});
  if(dryRun)return {dryRun:true,stage:'voiced',resources:await preflight(attachment.config),derivedConfig:attachment.configFile,newCreativeApprovalRequired:true,wouldCreatePrivateConfig:true};
  if(attachment.previewMusicRemoved)log('La musique de l’aperçu sans voix est retirée : la finalisation vérifie et préserve la voix importée seule.');
  return {...await runProduction(attachment.configFile,{failOnce,restartFrom,approve,reviewNote,reviewer,log}),audioConfig:attachment.configFile,scriptRunId:attachment.scriptRunId,newCreativeApprovalRequired:true};
 }
 const loaded=await loadConfig(configFile);
 if(loaded.mode==='demo')return runPipeline(configFile,{dryRun,failOnce,restartFrom,log});
 const resources=await preflight(loaded);
 const spec=await identify(configFile),{directory:dir,id}=spec;
 const c={...spec.config,duration:resources.effectiveDuration,requestedDuration:spec.config.duration};
 const scriptOnly=c.narration.engine==='none';
 if(restartFrom&&!productionSteps.includes(restartFrom))throw new Error('Étape inconnue.');
 if(failOnce&&!productionSteps.includes(failOnce))throw new Error('Étape inconnue pour --fail-once.');
 if(dryRun)return {dryRun:true,id,mode:c.mode,stage:scriptOnly?'script-first':'voiced',steps:productionSteps,directory:dir,resources,hdRequiresExplicitCreativeReview:true,automaticSpeechSynthesis:false};
 const release=await lock(dir);let state;
 try{
  try{state=await readJson(path.join(dir,'state.json'));}catch(e){if(e.code!=='ENOENT')throw e;state={version:2,id,key:spec.key,status:'pending',configPath:path.resolve(configFile),steps:{},injectedFailures:[]};}
  if(state.key!==spec.key)throw new Error('Checkpoint incompatible.');
  state.stage=scriptOnly?'script-first':'voiced';
  await json(path.join(dir,'config.private.json'),c);const save=()=>json(path.join(dir,'state.json'),state);
  const base=createHandlers(c,dir);let invalid=false;
  const handlers={...base,
   scenes:async()=>{
    const outputs=await base.scenes();const file=path.join(dir,'project.json');const p=await readJson(file);
    const project=projectSchema.parse({...p,requiresCreativeApproval:true,captionStyle:c.captionStyle==='classic'?'editorial':c.captionStyle,montage:{hook:c.creative.hook||c.subject,shots:createCuts(c,p)}});
    for(const s of project.montage.shots){const m=project.media[s.mediaIndex];if(m?.type==='video'&&(m.durationSeconds-m.trimStart)<s.end-s.start-.034)throw new Error('Plan vidéo trop court : changer le point de coupe ou fournir un plan plus long, sans boucle automatique.');}
    await json(file,project);await json(path.join(dir,'storyboard.json'),project.montage.shots);await json(path.join(dir,'creative-brief.json'),reviewBrief(c,project,resources));
    return [...outputs,path.join(dir,'creative-brief.json')];
   },
   preview:async()=>{
    await renderProject(path.join(dir,'project.json'),path.join(dir,'preview.mp4'),{scale:2/3});
    await verifyProduction(dir,c.duration,{kind:'preview',width:720,height:1280});
    const project=await readJson(path.join(dir,'project.json'));const shots=project.montage.shots;const framesDir=path.join(dir,'preview-frames');await mkdir(framesDir,{recursive:true});const files=[];
    for(const [i,s] of shots.slice(0,8).entries()){
     const file=path.join(framesDir,`frame-${i+1}.jpg`);const at=Math.min(s.end-.1,s.start+Math.min(.8,(s.end-s.start)*.45));
     await command('ffmpeg',['-v','error','-y','-ss',String(at),'-i',path.join(dir,'preview.mp4'),'-frames:v','1',file]);files.push(file);
    }
    const technical=await readJson(path.join(dir,'preview-verification.json'));const brief=await readJson(path.join(dir,'creative-brief.json'));
    const assets=await fingerprints([...project.media,...(project.audio?[project.audio]:[])].map(m=>path.join(root,'public',m.src)));
    await json(path.join(dir,'creative-review.json'),{...brief,technical,previewSha:await digest(path.join(dir,'preview.mp4')),projectSha:await digest(path.join(dir,'project.json')),assets,frames:files.map(f=>path.relative(dir,f))});
    const archive=path.join(dir,`preview-${randomUUID()}.zip`);await command('python3',['scripts/archive.py','pack',path.join(dir,'project.json'),archive]);await command('python3',['scripts/pipeline/package.py',archive,dir,'preview']);await import('node:fs/promises').then(f=>f.rename(archive,path.join(dir,'preview-sources.zip')));
    return ['preview.mp4','preview-verification.json','creative-review.json','preview-sources.zip',...(technical.sourceIntegrity?['preview-voice-integrity.json']:[]),...files];
   },
   render:async()=>{await assertApproval(path.join(dir,'project.json'),path.join(dir,'approval.private.json'));await renderProject(path.join(dir,'project.json'),path.join(dir,'final.mp4'),{approvalFile:path.join(dir,'approval.private.json')});return ['final.mp4'];},
   archive:async()=>{const outputs=await base.archive();await downloadLinks(dir,id,true);return outputs;},
  };
  state.status='running';await save();
  for(const step of productionSteps){
   if(restartFrom===step)invalid=true;
   if(step==='review'){
    await downloadLinks(dir,id,state.steps.archive?.status==='done');const previewSha=await digest(path.join(dir,'preview.mp4'));
    if(approve){try{await approvePreview(dir,approve,reviewNote,{reviewer});}catch(e){state.status='awaiting_review';state.steps.review={status:'awaiting_review',previewSha,error:e.message};await save();throw e;}}
    let accepted=false;try{await assertApproval(path.join(dir,'project.json'),path.join(dir,'approval.private.json'),{allowProvisional:scriptOnly});accepted=true;}catch{}
    const timing=await readJson(path.join(dir,'captions.timing.json'));
    const previewResult={id,stage:state.stage,preview:path.join(dir,'preview.mp4'),zip:path.join(dir,'preview-sources.zip'),srt:path.join(dir,timing.srt),captionTiming:timing.status,review:path.join(dir,'creative-review.json'),frames:path.join(dir,'preview-frames'),previewSha,downloadPage:`/production/${id}`};
    if(!accepted){state.status='awaiting_review';state.steps.review={status:'awaiting_review',previewSha};await save();return {...previewResult,status:'awaiting_review',next:scriptOnly?'Revoir le montage sans voix. Sous-titres provisoires ; cette validation ne lance pas la HD.':'Regarder les plans et écouter la voix. Nouvel accord requis avant la HD.',approvalCommand:`npm run produce -- ${configFile} --approve-preview ${previewSha} --review-note "Votre avis explicite après visionnage"`};}
    state.steps.review={status:'done',outputs:await fingerprints([path.join(dir,'approval.private.json')])};
    if(scriptOnly){state.status='awaiting_audio';delete state.failedStep;await save();return {...previewResult,status:'awaiting_audio',scope:'montage-only-provisional',next:'Montage validé uniquement. Importer le WAV/MP3 pour recaler les sous-titres et créer un nouvel aperçu avant la HD.',audioCommand:`npm run produce -- ${configFile} --audio /chemin/voix.wav --origin elevenlabs-export`};}
    await save();continue;
   }
   const previous=state.steps[step];
   if(!invalid&&previous?.status==='done'&&await intact(previous.outputs)){log(`Réutilisé : ${step}`);continue;}
   invalid=true;
   if(productionSteps.indexOf(step)<=productionSteps.indexOf('preview')){
    // An approval of different frames is never silently reused.
    state.steps.review={status:'awaiting_review'};
   }
   state.steps[step]={status:'running',attempts:(previous?.attempts??0)+1};await save();log(`En cours : ${step}`);
   try{
    if(failOnce===step&&!state.injectedFailures.includes(step)){state.injectedFailures.push(step);throw new Error(`Échec de test injecté à ${step}.`);}
    const outputs=(await handlers[step]()).map(f=>path.isAbsolute(f)?f:path.join(dir,f));state.steps[step]={...state.steps[step],status:'done',outputs:await fingerprints(outputs)};if(state.failedStep===step)delete state.failedStep;await save();
   }catch(e){state.status='failed';state.failedStep=step;state.steps[step]={...state.steps[step],status:'failed',error:e.message};await save();throw new Error(`Production ${id}, étape ${step} : ${e.message}\nReprise : npm run produce -- ${configFile}`);}
  }
  state.status='done';delete state.failedStep;await downloadLinks(dir,id,true);await save();return {id,status:'done',mp4:path.join(dir,'final.mp4'),zip:path.join(dir,'sources.zip'),preview:path.join(dir,'preview.mp4'),approval:await readJson(path.join(dir,'approval.private.json'))};
 }finally{await release();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 process.umask(0o077);const args=process.argv.slice(2);const value=n=>args.includes(n)?args[args.indexOf(n)+1]:undefined;
 if(!args[0]||args[0].startsWith('--')){console.error('Usage : npm run produce -- config.json [--dry-run] [--audio voix.wav|mp3 --origin elevenlabs-export] [--approve-preview SHA --review-note AVIS] [--from étape]');process.exitCode=1;}
 else runProduction(path.resolve(args[0]),{dryRun:args.includes('--dry-run'),audioFile:value('--audio'),origin:value('--origin'),approve:value('--approve-preview'),reviewNote:value('--review-note'),restartFrom:value('--from'),failOnce:value('--fail-once')}).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});
}
