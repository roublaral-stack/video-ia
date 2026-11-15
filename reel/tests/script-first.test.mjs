import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,readdir,stat} from 'node:fs/promises';
import {createServer} from 'node:http';
import path from 'node:path';
import {schema,loadConfig} from '../scripts/pipeline/config.mjs';
import {groupScript,provisionalCaptions,validateGroups,alignGroups,lexicalWords} from '../scripts/pipeline/script-captions.mjs';
import {runProduction} from '../scripts/production.mjs';
import {attachAudio} from '../scripts/pipeline/attach-audio.mjs';
import {assertApproval} from '../scripts/pipeline/review.mjs';
import {serveProduction} from '../scripts/pipeline/downloads.mjs';
import {readJson,json} from '../scripts/pipeline/store.mjs';
import {command,probe} from '../scripts/media.mjs';
import {projectSchema,buildTimeline} from '../src/generator/project.ts';

const text='Regardez cette feuille. Sa lumière change au fil de la journée. Prenons le temps de regarder les détails.';
const base={version:1,mode:'production',subject:'Étude du montage sans voix',template:'vlog',duration:15,media:['photo.jpg'],script:{text,validated:true}};

test('a validated script needs neither voice, SRT nor synthesis configuration',()=>{
 const c=schema.parse(base);assert.equal(c.narration.engine,'none');assert.equal(c.narration.audio,undefined);assert.equal(c.narration.srt,undefined);assert.equal(c.narration.alignment.model,undefined);
 for(const script of [undefined,{text,validated:false}])assert.throws(()=>schema.parse({...base,script}));
 for(const engine of ['demo','chatterbox'])assert.throws(()=>schema.parse({...base,narration:{engine},exceptions:{demoVoice:true,reason:'An explicit compatibility setting must not enable synthesis in Script First.'}}),/ne synthétise aucune voix/);
 assert.throws(()=>schema.parse({...base,narration:{engine:'none',audio:'voice.wav'}}),/aucun fichier vocal/);
 const voiced=schema.parse({...base,narration:{engine:'files',audio:'voice.mp3',durationPolicy:'audio',origin:'elevenlabs-export'}});assert.equal(voiced.narration.alignment.mode,'acoustic');assert.equal(voiced.narration.srt,undefined);
});
test('short groups preserve every word, including punctuation, without a one-word tail',()=>{
 for(let n=2;n<55;n++){
  const script=Array.from({length:n},(_,i)=>`mot${String.fromCharCode(97+i%26)}`).join(' '),groups=groupScript(script);
  assert(groups.every(g=>g.split(' ').length>=2&&g.split(' ').length<=5));assert.equal(groups.join(' '),script);
  const cues=provisionalCaptions(groups,60);assert(cues.every((c,i)=>c.end>c.start&&c.end<=60&&(!i||c.start>=cues[i-1].end)));
 }
 const groups=groupScript(text);assert.equal(groups.join(' '),text);
 assert.throws(()=>validateGroups(text,['Un autre texte.']),/exactement/);
 assert.throws(()=>groupScript('Seul.'));
 assert.throws(()=>provisionalCaptions(groupScript('un détail visible '.repeat(50)),15),/trop dense/);
 const manual=['Regardez cette feuille.','Sa lumière change','au fil de la journée.','Prenons le temps','de regarder les détails.'];assert.deepEqual(groupScript(text,{groups:manual}),manual);
});
test('imported speech replaces provisional estimates with measured word boundaries',()=>{
 const script='Regardez cette feuille. Prenons le temps.';const groups=groupScript(script);
 const words=lexicalWords(script).map((text,i)=>({text,start:[.2,.6,.9,3.5,3.9,4.3][i],end:[.5,.8,1.4,3.8,4.2,4.8][i]}));
 const result=alignGroups(script,groups,words,5);assert.deepEqual(result.captions.map(c=>[c.start,c.end]),[[.2,1.4],[3.5,4.8]]);assert.deepEqual(result.phraseBoundaries,[2.45]);
 assert.notDeepEqual(result.captions,provisionalCaptions(groups,15));
 assert.throws(()=>alignGroups('Autres paroles.',groups,words,5),/ne correspondent/);
 assert.throws(()=>alignGroups(script,groups,[...words.slice(0,-1),{...words.at(-1),end:9}],5),/invalide/);
});
test('automatic regrouping uses actual speech durations to avoid rushed short captions',()=>{
 const script='Voici, c’est le moment de regarder ces feuilles dans la lumière.';
 const bounds=[[.1,.35],[.35,.55],[.55,.7],[.7,.95],[.95,1.1],[1.1,1.55],[1.55,1.7],[1.7,2.15],[2.15,2.5],[2.5,2.65],[2.65,3.15]];
 const words=lexicalWords(script).map((text,i)=>({text,start:bounds[i][0],end:bounds[i][1]}));const groups=groupScript(script,{},words);
 const result=alignGroups(script,groups,words,15);assert.equal(groups.join(' '),script);assert(result.captions.every(c=>c.end-c.start>=.75));
 const chosen=['Voici, c’est le','moment de regarder ces','feuilles dans la lumière.'];assert.deepEqual(groupScript(script,{groups:chosen},words),chosen);
});
test('audio-fitted durations preserve exact frame counts without weakening fixed durations',()=>{
 const p=projectSchema.parse({subject:'Test',template:'educatif',duration:493/30,durationPolicy:'audio',requestedDuration:15});const timeline=buildTimeline(p);assert.equal(timeline.at(-1).from+timeline.at(-1).duration,493);
 assert.throws(()=>projectSchema.parse({...p,durationPolicy:'fixed'}));
 assert.throws(()=>projectSchema.parse({...p,duration:16.41}));
});

test('silent preparation, editable provisional SRT/ZIP, montage-only approval and music preview',{timeout:300000},async()=>{
 const dir=await mkdtemp('/tmp/video-ia-script-first-');const image=path.join(dir,'fixture.jpg');
 await command('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=c=0x274d3b:s=1440x2560','-frames:v','1',image]);
 const file=path.join(dir,'silent.private.json');await json(file,{...base,media:[image],exceptions:{illustrations:true,reason:'Image synthétique de régression technique uniquement.'}});
 const dry=await runProduction(file,{dryRun:true,log:()=>{}});assert.equal(dry.resources.voice,'Aucune voix — script seul');await assert.rejects(()=>stat(dry.directory),{code:'ENOENT'});
 await assert.rejects(()=>runProduction(file,{failOnce:'captions',log:()=>{}}),/étape captions/);
 const result=await runProduction(file,{log:()=>{}}),runDir=path.dirname(result.preview);assert.equal(result.status,'awaiting_review');assert.equal(result.stage,'script-first');assert.match(result.srt,/provisional\.srt$/);
 const report=await readJson(path.join(runDir,'preview-verification.json'));assert.equal(report.audioCodec,null);assert.equal(report.voicePresent,false);assert.equal(report.subtitlesSynchronized,false);assert.equal(report.frames,450);
 assert.deepEqual((await probe(result.preview)).streams.map(s=>s.codec_type),['video']);
 assert.deepEqual(await readdir(path.join(runDir,'voice')),['result.json']);
 await assert.rejects(()=>stat(path.join(runDir,'final.mp4')),{code:'ENOENT'});await assert.rejects(()=>stat(path.join(runDir,'approval.private.json')),{code:'ENOENT'});
 const stamp=(await stat(result.preview)).mtimeMs;await runProduction(file,{log:()=>{}});assert.equal((await stat(result.preview)).mtimeMs,stamp);
 await command('python3',['-c','import zipfile,json,sys;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;p=json.loads(z.read("project.json"));assert "audio" not in p;assert p["captionTiming"]=="provisional";assert "production/captions.timing.json" in z.namelist()',result.zip]);
 const server=createServer(async(req,res)=>{if(!await serveProduction(req,res,new URL(req.url,'http://localhost'))){res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const host=`http://127.0.0.1:${server.address().port}`;
 try{
  const html=await(await fetch(host+result.downloadPage)).text();assert.match(html,/SOUS-TITRES PROVISOIRES/);assert.match(html,/Valider ce montage sans voix/);assert.doesNotMatch(html,/<button>Valider cet aperçu et exporter en HD/);
  const links=await readJson(path.join(runDir,'download.private.json'));for(const key of ['srt','draftZip'])assert.equal((await fetch(host+links[key])).status,200);
 }finally{await new Promise(r=>server.close(r));}
 // This approval is limited to a synthetic fixture and can never launch HD.
 const accepted=await runProduction(file,{approve:result.previewSha,reviewNote:'Fixture sans voix : validation du montage uniquement.',reviewer:'automated-regression-fixture',log:()=>{}});assert.equal(accepted.status,'awaiting_audio');
 await assert.rejects(()=>assertApproval(path.join(runDir,'project.json'),path.join(runDir,'approval.private.json')),/montage sans voix uniquement/);
 await assert.rejects(()=>stat(path.join(runDir,'final.mp4')),{code:'ENOENT'});
 const audio=path.join(dir,'signal.mp3');await command('ffmpeg',['-v','error','-y','-f','lavfi','-i','sine=frequency=220:duration=16.4','-c:a','libmp3lame',audio]);
 const original=await readFile(file,'utf8');const attachment=await attachAudio(file,audio,{dryRun:true});await assert.rejects(()=>stat(attachment.configFile),{code:'ENOENT'});assert.equal(await readFile(file,'utf8'),original);assert.equal(attachment.config.narration.engine,'files');assert.equal(attachment.newCreativeApprovalRequired,true);
 const dryVoice=await runProduction(file,{audioFile:audio,dryRun:true,log:()=>{}});assert(dryVoice.resources.effectiveDuration>16.4&&dryVoice.resources.effectiveDuration<16.5);await assert.rejects(()=>stat(attachment.configFile),{code:'ENOENT'});
 // Music is an explicit non-verbal signal in this test, never synthesized speech.
 const musical=path.join(dir,'music.private.json');await json(musical,{...await readJson(file),music:{audio,volume:.1}});const musicResult=await runProduction(musical,{log:()=>{}});const musicReport=await readJson(path.join(path.dirname(musicResult.preview),'preview-verification.json'));assert.equal(musicReport.audioMode,'music-preview');assert.equal(musicReport.voicePresent,false);assert.equal(musicReport.subtitlesSynchronized,false);assert(musicReport.audioRms>0);
 const attachedMusic=await attachAudio(musical,audio);assert.equal(attachedMusic.previewMusicRemoved,true);assert.equal(attachedMusic.config.music,undefined);assert.equal((await loadConfig(attachedMusic.configFile)).narration.origin,'provided-recording');
 assert.equal(await readFile(file,'utf8'),original);
});
