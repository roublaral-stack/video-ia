import {readFile,writeFile,mkdir,access,unlink} from 'node:fs/promises';
import path from 'node:path';
import {assertApproval} from './pipeline/review.mjs';
import {spawn} from 'node:child_process';
import {projectSchema,buildTimeline,exampleProject,parseSrt,makeCaptions} from '../src/generator/project.ts';
import {root,importMedia,probe,command} from './media.mjs';
export async function validateAssets(project){
 const p=projectSchema.parse(project);buildTimeline(p);
 for(const item of [...p.media,...(p.audio?[p.audio]:[])]){
  const file=path.join(root,'public',item.src);await access(file);const meta=await probe(file);
  const expected=item.type==='image'||item.type==='video'?'video':'audio';
  if(!meta.streams.some(s=>s.codec_type===expected))throw new Error(`Type de média incompatible : ${item.src}`);
  if(item.durationSeconds&&Math.abs(Number(meta.format.duration)-item.durationSeconds)>.15)throw new Error(`Durée du fichier différente du projet : ${item.src}`);
 }
 return p;
}
export async function renderProject(file,output,{scale=1,approvalFile}={}){
 const input=JSON.parse(await readFile(file,'utf8'));const project=await validateAssets(input.project??input);
 if(project.requiresCreativeApproval&&scale>=1)await assertApproval(path.resolve(file),approvalFile);
 const {randomUUID}=await import('node:crypto');await mkdir(path.join(root,'projects'),{recursive:true});
 const props=path.join(root,'projects',`render-${randomUUID()}.json`);await writeFile(props,JSON.stringify({project},null,2));
 const out=path.resolve(output);await mkdir(path.dirname(out),{recursive:true});
 const nativeOut=project.audio?.preserveSource?out+'.remotion.mp4':out;
 const browser=process.env.REMOTION_BROWSER_EXECUTABLE||'/usr/bin/chromium';await access(browser);
 await new Promise((resolve,reject)=>{const p=spawn(process.execPath,[path.join(root,'node_modules/@remotion/cli/remotion-cli.js'),'render','src/index.ts','ReelGenerator',nativeOut,`--props=${props}`,`--browser-executable=${browser}`,'--concurrency=2',`--scale=${scale}`,'--is-production=false',...(!project.audio?['--muted']:[])],{cwd:root,stdio:'inherit'});p.on('error',reject);p.on('close',code=>code===0?resolve(out):reject(new Error(`Rendu échoué (${code})`)));});
 if(project.audio?.preserveSource){
  // Copy Remotion's video stream, encode the protected input voice directly.
  // No mixer, fades, volume filter, trim, time stretch or loop on this path.
  await command('ffmpeg',['-v','error','-y','-i',nativeOut,'-i',path.join(root,'public',project.audio.src),'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','256k','-ar','48000','-map_metadata','-1','-movflags','+faststart',out]);
  await unlink(nativeOut);
 }
 return out;
}
async function main(){
 const [cmd,...args]=process.argv.slice(2);
 if(cmd==='init'){
  const [file='projects/mon-reel.json',template='educatif',duration='15',subject='Mon aquarium']=args;
  const p=projectSchema.parse({...exampleProject,subject,template,duration:Number(duration),titles:[],captions:[]});await mkdir(path.dirname(path.resolve(file)),{recursive:true});await writeFile(file,JSON.stringify(p,null,2),{flag:'wx'});console.log(file);
 }else if(cmd==='import'){
  const [file,...files]=args;if(!file||!files.length)throw new Error('import projet.json media1 media2 ...');const p=JSON.parse(await readFile(file,'utf8'));
  for(const media of files){const m=await importMedia(media);if(m.type==='audio'){const {type,...audio}=m;p.audio=audio;}else p.media.push(m);}
  const checked=projectSchema.parse(p);buildTimeline(checked);await writeFile(file,JSON.stringify(checked,null,2));console.log(`${p.media.length} médias ; audio ${p.audio?'oui':'non'}`);
 }else if(cmd==='captions'){
  const [file,text]=args;const p=JSON.parse(await readFile(file,'utf8'));p.captions=makeCaptions(await readFile(text,'utf8'),p.duration);p.captionOffset=0;await writeFile(file,JSON.stringify(projectSchema.parse(p),null,2));
 }else if(cmd==='srt'){
  const [file,srt,offset='0']=args;const p=JSON.parse(await readFile(file,'utf8'));p.captions=parseSrt(await readFile(srt,'utf8'));p.captionOffset=Number(offset);await writeFile(file,JSON.stringify(projectSchema.parse(p),null,2));
 }else if(cmd==='check'){
  const p=await validateAssets(JSON.parse(await readFile(args[0],'utf8')));console.log(JSON.stringify({project:p,timeline:buildTimeline(p)},null,2));
 }else if(cmd==='pack'||cmd==='restore'){
  if(!args[0]||!args[1])throw new Error('pack/restore projet.json archive.zip');
  if(cmd==='pack')await validateAssets(JSON.parse(await readFile(args[0],'utf8')));
  console.log(await command('python3',['scripts/archive.py',cmd,path.resolve(args[0]),path.resolve(args[1])]));
  if(cmd==='restore')await validateAssets(JSON.parse(await readFile(args[0],'utf8')));
 }else if(cmd==='render'){
  if(!args[0])throw new Error('render projet.json [out/reel.mp4]');console.log(await renderProject(path.resolve(args[0]),args[1]??'out/reel-generator.mp4'));
 }else throw new Error('Commandes : init, import, captions, srt, check, render, pack, restore');
}
if(process.argv[1]&&path.resolve(process.argv[1])===import.meta.filename)main().catch(e=>{console.error(e.message);process.exitCode=1;});
