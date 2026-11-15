import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {schema,splitScript,defaultScript} from '../scripts/pipeline/config.mjs';
import {identify,runPipeline,runsRoot} from '../scripts/pipeline/run.mjs';
import {readJson,digest,json,intact,lock} from '../scripts/pipeline/store.mjs';
import {root,command} from '../scripts/media.mjs';
import {wav,pcm,toSrt,chatterboxSpeech} from '../scripts/pipeline/speech.mjs';
import {parseSrt} from '../src/generator/project.ts';
const base={version:1,subject:'aquarium de test',template:'educatif',duration:15,demo:true,media:[],narration:{engine:'demo'}};
test('Brag is optional and restricted to application',()=>{assert.equal(schema.parse(base).brag.mode,'off');assert.throws(()=>schema.parse({...base,brag:{mode:'off',files:['app.mp4']}}));assert.throws(()=>schema.parse({...base,brag:{mode:'files',files:['app.mp4']}}));assert.equal(schema.parse({...base,template:'application',brag:{mode:'files',files:['app.mp4']}}).brag.mode,'files');});
test('file narration requires real audio and SRT; demo requires explicit mode',()=>{assert.throws(()=>schema.parse({...base,demo:false}));assert.throws(()=>schema.parse({...base,narration:{engine:'files',audio:'a.wav'}}));assert.throws(()=>schema.parse({...base,narration:{engine:'demo',referenceAudio:'my-voice.wav'}}));});
test('script preparation and SRT retain actual phrase boundaries',()=>{const parts=splitScript(defaultScript(schema.parse(base)));assert(parts.length>=3);assert(parts.every(p=>p.length<=110));const cues=[{start:.5,end:1.446,text:'Démo synthétique.'},{start:3.514,end:5.439,text:'Regardons un aquarium vivant.'}];assert.deepEqual(parseSrt(toSrt(cues)),cues);});
test('WAV roundtrip and manifest detect corrupted artifacts',async()=>{const dir=await mkdtemp('/tmp/video-ia-checkpoint-');const file=path.join(dir,'x.wav');const samples=Buffer.alloc(960);await writeFile(file,wav(samples));assert.deepEqual(pcm(await readFile(file)),samples);const outputs=[{file,sha256:await digest(file)}];assert(await intact(outputs));await writeFile(file,'broken');assert.equal(await intact(outputs),false);});
test('active locks prevent duplicate processes and stale locks can recover',async()=>{const dir=await mkdtemp('/tmp/video-ia-lock-');const release=await lock(dir);await assert.rejects(()=>lock(dir),/déjà en cours/);await release();await json(path.join(dir,'.lock'),{pid:2147483647});const release2=await lock(dir);await release2();});
test('Chatterbox absent runtime has actionable diagnosis, not a fake success',async()=>{const dir=await mkdtemp('/tmp/video-ia-chatterbox-test-');const fake=path.join(dir,'not-python');await writeFile(fake,'');await assert.rejects(()=>chatterboxSpeech(['Bonjour.'],dir,{python:fake,device:'cpu'}),/Chatterbox indisponible/);});
test('private production: dry-run, failure, resume, exact render, idempotency, ZIP recovery and downloads',{timeout:300000},async()=>{
 await import('node:fs/promises').then(f=>f.mkdir(path.join(root,'projects'),{recursive:true}));
 const file=path.join(root,'projects/pipeline-e2e.json');await writeFile(file,JSON.stringify({...base,subject:'test de production synthétique '+randomUUID().slice(0,8),narration:{engine:'demo',text:'Démo synthétique.\nUn aquarium vivant.\nPrenons le temps de regarder.'}}));
 const spec=await identify(file);const dry=await runPipeline(file,{dryRun:true,log:()=>{}});assert.equal(dry.id,spec.id);
 await assert.rejects(()=>stat(spec.directory),{code:'ENOENT'});
 await assert.rejects(()=>runPipeline(file,{failOnce:'captions',log:()=>{}}),/arrêtée à « captions »/);
 const failed=await readJson(path.join(spec.directory,'state.json'));assert.equal(failed.steps.voice.attempts,1);const voiceHash=await digest(path.join(spec.directory,'voice/narration.wav'));
 const result=await runPipeline(file,{log:()=>{}});assert.equal(result.status,'done');const completed=await readJson(path.join(spec.directory,'state.json'));assert.equal(completed.steps.voice.attempts,1);assert.equal(completed.steps.captions.attempts,2);assert.equal(await digest(path.join(spec.directory,'voice/narration.wav')),voiceHash);
 const report=await readJson(result.verification);assert.equal(report.frames,450);assert.equal(report.width,1080);assert.equal(report.height,1920);assert.equal(report.captionMethod,'synthesized-phrase-boundaries');assert(report.audioRms>0);assert(report.decoded);assert(Math.abs(report.sourceAudioOnset-report.renderedAudioOnset)<.1);
 const mp4Hash=await digest(result.mp4);const stamp=(await stat(result.mp4)).mtimeMs;await runPipeline(file,{log:()=>{}});assert.equal((await stat(result.mp4)).mtimeMs,stamp);assert.equal((await readJson(path.join(spec.directory,'state.json'))).steps.render.attempts,1);
 await writeFile(result.zip,'simulate interrupted ZIP');await runPipeline(file,{log:()=>{}});const repaired=await readJson(path.join(spec.directory,'state.json'));assert.equal(repaired.steps.archive.attempts,2);assert.equal(repaired.steps.render.attempts,1);assert.equal(await digest(result.mp4),mp4Hash);
 const zipResult=await command('python3',['-c','import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;assert "project.json" in z.namelist();assert "production/captions.srt" in z.namelist();assert "production/script.txt" in z.namelist();assert not any("reference" in n or "private.json" in n for n in z.namelist());print("ZIP checked")',result.zip]);assert.match(zipResult,/ZIP checked/);
 const restored=path.join(root,'projects',`pipeline-restored-${Date.now()}.json`);await command('python3',['scripts/archive.py','restore',restored,result.zip]);assert.deepEqual(await readJson(restored),await readJson(path.join(spec.directory,'project.json')));
 const server=spawn(process.execPath,['scripts/editor.mjs'],{cwd:root,env:{...process.env,PORT:'3230'},stdio:['ignore','ignore','pipe']});server.stderr.on('data',()=>{});
 try{let ready=false;for(let i=0;i<60;i++){try{if((await fetch('http://127.0.0.1:3230/')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert(ready);const denied=await fetch(`http://127.0.0.1:3230/api/production/${spec.id}/final.mp4`);assert.equal(denied.status,403);const page=await fetch(`http://127.0.0.1:3230/production/${spec.id}`);assert.equal(page.status,200);const links=await readJson(path.join(spec.directory,'download.private.json'));for(const name of ['mp4','zip']){const r=await fetch('http://127.0.0.1:3230'+links[name]);assert.equal(r.status,200);assert.match(r.headers.get('content-disposition'),/attachment/);assert.equal(r.headers.get('cache-control'),'no-store');const dest=path.join(spec.directory,`downloaded-${name}`);await writeFile(dest,Buffer.from(await r.arrayBuffer()));assert.equal(await digest(dest),await digest(name==='mp4'?result.mp4:result.zip));}}
 finally{server.kill('SIGTERM');}
});
test('files adapter imports synthetic Brag exports and voice/SRT without direct services',{timeout:60000},async()=>{
 const {demoSpeech,assembleSpeech}=await import('../scripts/pipeline/speech.mjs');const dir=await mkdtemp('/tmp/video-ia-files-adapter-');
 const speech=await assembleSpeech(await demoSpeech(['Démo synthétique.','Regardons cette application.'],dir,{voice:'fr-fr',speed:145}),dir,15);
 await writeFile(path.join(dir,'voice.srt'),toSrt(speech.captions));
 const video=path.join(dir,'brag-export.mp4');await command('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=c=0x264f36:s=320x568:r=30','-t','1','-c:v','libx264','-pix_fmt','yuv420p',video]);
 const file=path.join(dir,'application.json');await writeFile(file,JSON.stringify({...base,template:'application',narration:{engine:'files',audio:speech.audio,srt:path.join(dir,'voice.srt')},brag:{mode:'files',files:[video]}}));
 await assert.rejects(()=>runPipeline(file,{failOnce:'render',log:()=>{}}),/arrêtée à « render »/);const spec=await identify(file);const project=await readJson(path.join(spec.directory,'project.json'));
 assert.equal(project.template,'application');assert.equal(project.titleAnimation,'snapcn');assert.equal(project.media.length,1);assert.equal(project.media[0].type,'video');assert.equal((await readJson(path.join(spec.directory,'voice/result.json'))).method,'imported-srt-timing-not-forced-alignment');
});
