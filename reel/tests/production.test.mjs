import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:http';
import {schema,defaultScript} from '../scripts/pipeline/config.mjs';
import {preflight,createCuts} from '../scripts/pipeline/creative.mjs';
import {approvePreview,assertApproval} from '../scripts/pipeline/review.mjs';
import {runProduction} from '../scripts/production.mjs';
import {serveProduction} from '../scripts/pipeline/downloads.mjs';
import {assembleSpeech} from '../scripts/pipeline/speech.mjs';
import {json,readJson,digest,fingerprints} from '../scripts/pipeline/store.mjs';
import {command} from '../scripts/media.mjs';
import {renderProject} from '../scripts/project.mjs';

const config={version:1,mode:'production',subject:'Une observation concrète',template:'vlog',duration:15,media:['plant.jpg'],narration:{engine:'files',audio:'voice.wav',srt:'voice.srt',alignment:{mode:'srt',reviewed:true}}};
test('production refuses silent demo fallbacks and estimated subtitles',()=>{
 assert.equal(schema.parse(config).mode,'production');
 for(const patch of [{narration:{engine:'demo'}},{media:[]},{demo:true},{narration:{...config.narration,alignment:{mode:'srt'}}},{exceptions:{demoVoice:true}}])assert.throws(()=>schema.parse({...config,...patch}));
 assert.doesNotThrow(()=>schema.parse({...config,media:[],visualStyle:'typography'}));
 assert.doesNotThrow(()=>schema.parse({...config,narration:{engine:'demo'},exceptions:{demoVoice:true,reason:'Exception explicitement demandée pour un test.'}}));
 assert.equal(schema.parse({...config,mode:'demo',narration:{engine:'demo'}}).demo,true);
 assert.throws(()=>defaultScript(schema.parse(config)),/Script éditorial manquant/);
});
test('a missing personal resource or runtime blocks rather than substitutes',async()=>{
 const c=schema.parse({...config,media:[],visualStyle:'typography'});
 await assert.rejects(()=>preflight(c),/Ressource vocale manquante.*Aucun remplacement/);
 assert.throws(()=>schema.parse({...config,narration:{engine:'chatterbox',text:'Une phrase.'}}),/Voix personnalisée indisponible/);
 const runtime=schema.parse({...config,media:[],visualStyle:'typography',narration:{engine:'chatterbox',text:'Un détail visible.',referenceAudio:'/missing/reference.wav',modelDirectory:'/missing/weights'}});
 await assert.rejects(()=>preflight(runtime),/referenceAudio inaccessible/);
});
test('cuts use actual cue starts and explicit storyboards must be complete',()=>{
 const c=schema.parse(config),p={media:[{}],captions:[{start:.2},{start:2.4},{start:4.6},{start:7},{start:10},{start:13}]};
 const shots=createCuts(c,p);assert.deepEqual(shots.map(s=>s.start),[0,2.4,4.6,7,10,13]);assert.equal(shots.at(-1).end,15);assert(shots.every(s=>s.zoomTo<=1.08));
 for(const bad of [[{start:1,end:15,mediaIndex:0}],[{start:0,end:14,mediaIndex:0}],[{start:0,end:15,mediaIndex:2}]])assert.throws(()=>createCuts({...c,creative:{...c.creative,shots:bad}},p),/storyboard|Storyboard/);
});
test('production speech assembly refuses artificial silence filling',async()=>{
 const dir=await mkdtemp('/tmp/video-ia-natural-');const file=path.join(dir,'signal.wav');
 await command('ffmpeg',['-v','error','-y','-f','lavfi','-i','sine=frequency=440:duration=1:sample_rate=48000','-c:a','pcm_s16le',file]);
 await assert.rejects(()=>assembleSpeech([{audio:file,text:'Fixture.'}],dir,15,{natural:true}),/Aucun remplissage artificiel/);
 // Fixed inter-phrase breaths must also fit; the spoken ending cannot be cut.
 await command('ffmpeg',['-v','error','-y','-f','lavfi','-i','sine=frequency=440:duration=4.85:sample_rate=48000','-c:a','pcm_s16le',file]);
 await assert.rejects(()=>assembleSpeech(Array.from({length:3},()=>({audio:file,text:'Fixture.'})),dir,15,{natural:true}),/Narration trop longue/);
});
test('creative approval binds the real preview, project and media bytes',async()=>{
 const dir=await mkdtemp('/tmp/video-ia-review-');const asset=path.join(dir,'asset');await writeFile(asset,'source');
 const project=path.join(dir,'project.json'),preview=path.join(dir,'preview.mp4'),approval=path.join(dir,'approval.private.json');
 await writeFile(project,'{}');await writeFile(preview,'actual-preview');
 await json(path.join(dir,'preview-verification.json'),{passed:true});
 const previewSha=await digest(preview);await json(path.join(dir,'creative-review.json'),{previewSha,projectSha:await digest(project),assets:await fingerprints([asset])});
 await assert.rejects(()=>approvePreview(dir,'wrong','Fixture de test uniquement.'),/ne correspond/);
 await assert.rejects(()=>approvePreview(dir,previewSha,'oui'),/note de validation/);
 await approvePreview(dir,previewSha,'Fixture de test uniquement.',{reviewer:'automated-regression-fixture'});
 await assertApproval(project,approval);
 for(const [file,original] of [[project,'{}'],[preview,'actual-preview'],[asset,'source']]){
  await writeFile(file,'changed');await assert.rejects(()=>assertApproval(project,approval),/Validation périmée/);await writeFile(file,original);
 }
 await writeFile(asset,'changed-before-approval');await assert.rejects(()=>approvePreview(dir,previewSha,'Fixture de test uniquement.'),/sources ont changé/);
});
test('real preview, failure recovery, review gate, explicit fixture approval, HD and private downloads',{timeout:300000},async()=>{
 // These deliberately synthetic signals exercise mechanics only. They are never
 // labelled as a Chatterbox voice or delivered as the user's creative sample.
 const dir=await mkdtemp('/tmp/video-ia-production-fixture-');const image=path.join(dir,'fixture.jpg'),audio=path.join(dir,'fixture.wav'),srt=path.join(dir,'fixture.srt');
 await command('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=c=0x274d3b:s=1440x2560','-frames:v','1',image]);
 await command('ffmpeg',['-v','error','-y','-f','lavfi','-i','sine=frequency=440:sample_rate=24000:duration=15','-c:a','pcm_s16le',audio]);
 await writeFile(srt,'1\n00:00:00,100 --> 00:00:02,500\nFixture audio synthétique.\n\n2\n00:00:02,700 --> 00:00:06,000\nContrôle technique seulement.\n\n3\n00:00:07,000 --> 00:00:10,200\nAucune validation artistique.\n\n4\n00:00:11,000 --> 00:00:14,800\nSignal de test automatisé.\n');
 const file=path.join(dir,'fixture.private.json');await json(file,{...config,media:[image],narration:{...config.narration,audio,srt},exceptions:{illustrations:true,reason:'Fixture synthétique exclusivement réservée aux tests.'},creative:{hook:'TEST AUTOMATISÉ',limitations:['Signal et image synthétiques de régression, sans évaluation créative.']}});
 const dry=await runProduction(file,{dryRun:true,log:()=>{}});assert.equal(dry.hdRequiresExplicitCreativeReview,true);await assert.rejects(()=>stat(dry.directory),{code:'ENOENT'});
 await assert.rejects(()=>runProduction(file,{failOnce:'captions',log:()=>{}}),/étape captions/);
 const voice=path.join(dry.directory,'voice/narration.wav'),voiceSha=await digest(voice);
 const result=await runProduction(file,{log:()=>{}});assert.equal(result.status,'awaiting_review');const runDir=path.dirname(result.preview),stateFile=path.join(runDir,'state.json');
 const state=await readJson(stateFile);assert.equal(state.steps.voice.attempts,1);assert.equal(state.steps.captions.attempts,2);assert.equal(await digest(voice),voiceSha);
 const report=await readJson(path.join(runDir,'preview-verification.json'));assert.equal(report.width,720);assert.equal(report.height,1280);assert.equal(report.frames,450);assert(report.sourceIntegrity.passed);
 await assert.rejects(()=>stat(path.join(runDir,'final.mp4')),{code:'ENOENT'});
 await assert.rejects(()=>renderProject(path.join(runDir,'project.json'),path.join(runDir,'bypass.mp4')),/valider le vrai aperçu/);
 const previewStamp=(await stat(result.preview)).mtimeMs;await runProduction(file,{log:()=>{}});assert.equal((await stat(result.preview)).mtimeMs,previewStamp);
 await assert.rejects(()=>runProduction(file,{approve:'wrong',reviewNote:'Fixture automatisée uniquement.',log:()=>{}}),/ne correspond/);assert.equal((await readJson(stateFile)).status,'awaiting_review');
 const server=createServer(async(req,res)=>{if(!await serveProduction(req,res,new URL(req.url,'http://localhost'))){res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const host=`http://127.0.0.1:${server.address().port}`;
 try{
  const links=await readJson(path.join(runDir,'download.private.json'));const page=await fetch(host+result.downloadPage);assert.equal(page.status,200);assert.match(await page.text(),/La réussite technique ne valide pas/);
  assert.equal((await fetch(host+`/api/production/${result.id}/preview.mp4`)).status,403);
  const response=await fetch(host+links.preview);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(Buffer.from(await response.arrayBuffer()).length,(await stat(result.preview)).size);
  const range=await fetch(host+links.preview,{headers:{range:'bytes=0-99'}});assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,100);
  assert.equal((await fetch(host+links.preview,{headers:{range:'bytes=99999999999-'}})).status,416);
  assert.equal((await fetch(host+links.preview.replace('preview.mp4','final.mp4'))).status,409);
  const approveUrl=host+links.preview.replace('preview.mp4','approve');
  assert.equal((await fetch(approveUrl,{method:'POST',body:JSON.stringify({previewSha:result.previewSha,note:'oui'})})).status,400);
  // Explicit approval is for this synthetic regression fixture only.
  const accepted=await fetch(approveUrl,{method:'POST',body:JSON.stringify({previewSha:result.previewSha,note:'Validation automatisée de la fixture synthétique uniquement.'})});assert.equal(accepted.status,202);
  let completed;for(let i=0;i<600;i++){completed=await readJson(stateFile);if(completed.status==='done'||completed.status==='failed')break;await new Promise(r=>setTimeout(r,250));}
  assert.equal(completed.status,'done',JSON.stringify(completed.steps.render));
  const hd=await readJson(path.join(runDir,'verification.json'));assert.equal(hd.width,1080);assert.equal(hd.height,1920);assert(hd.decoded);assert(hd.sourceIntegrity.passed);
  const finalStamp=(await stat(path.join(runDir,'final.mp4'))).mtimeMs;await runProduction(file,{log:()=>{}});assert.equal((await stat(path.join(runDir,'final.mp4'))).mtimeMs,finalStamp);
  const downloads=await readJson(path.join(runDir,'download.private.json'));for(const name of ['mp4','zip']){const r=await fetch(host+downloads[name]);assert.equal(r.status,200);assert.match(r.headers.get('content-disposition'),/attachment/);const expected=await readFile(path.join(runDir,name==='mp4'?'final.mp4':'sources.zip'));assert.deepEqual(Buffer.from(await r.arrayBuffer()),expected);}
 }finally{await new Promise(r=>server.close(r));}
});
