// Signals below are regression-test tones, never substitutes for imported speech.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,access} from 'node:fs/promises';
import path from 'node:path';
import {projectSchema} from '../../src/generator/project.ts';
import {schema} from '../../scripts/pipeline/config.mjs';
import {importedSpeech,pcm} from '../../scripts/pipeline/speech.mjs';
import {importMedia,command,probe,root} from '../../scripts/media.mjs';
import {digest} from '../../scripts/pipeline/store.mjs';
import {parseSrt} from '../../src/generator/project.ts';
const python=path.join(root,'.venv/bin/python');
const project={subject:'Le plaisir d’observer',template:'educatif',duration:15,visualStyle:'typography',captionStyle:'editorial',audio:{src:'uploads/original.wav',durationSeconds:15,volume:1,preserveSource:true}};
test('protected source refuses every gain, trim, delay and loop',()=>{
 assert.equal(projectSchema.parse(project).visualStyle,'typography');
 for(const patch of [{volume:.6},{trimStart:.1},{from:1},{loop:true}])assert.throws(()=>projectSchema.parse({...project,audio:{...project.audio,...patch}}));
});
test('acoustic import cannot select a synthesis engine',()=>{
 const c={version:1,subject:'Une feuille',template:'educatif',duration:15,demo:true,narration:{engine:'demo',alignment:{mode:'acoustic',model:'model'}}};assert.throws(()=>schema.parse(c));
 assert.throws(()=>schema.parse({...c,narration:{engine:'files',audio:'x.wav',srt:'x.srt',alignment:{mode:'acoustic'}}}));
});
test('file import, native channel preservation and codec fidelity are measured',{timeout:30000},async()=>{
 const dir=await mkdtemp('/tmp/video-ia-preserved-audio-');const input=path.join(dir,'input.wav');const srt=path.join(dir,'input.srt');
 await command('ffmpeg',['-v','error','-y','-f','lavfi','-i','aevalsrc=if(between(t\\,0.1\\,0.5)\\,0.2*sin(2*PI*440*t)\\,if(between(t\\,0.8\\,1.7)\\,0.15*sin(2*PI*660*t)\\,0)):s=24000:d=2','-c:a','pcm_s16le',input]);
 await writeFile(srt,'1\n00:00:00,100 --> 00:00:00,500\nUne feuille.\n\n2\n00:00:00,800 --> 00:00:01,700\nUn autre détail.\n');
 const originalHash=await digest(input);const c={duration:15,narration:{engine:'files',audio:input,srt,alignment:{mode:'srt'}}};
 const imported=await importedSpeech(c,dir,parseSrt);assert.equal(imported.engine,'files');assert.equal(imported.preserveSource,true);assert.equal(imported.inputSha256,originalHash);assert.equal(await digest(input),originalHash);
 await assert.rejects(()=>importedSpeech({...c,narration:{...c.narration,engine:'demo'}},dir,parseSrt),/files exclusivement/);
 await assert.rejects(()=>importedSpeech({...c,narration:{...c.narration,audio:path.join(dir,'missing.wav')}},dir,parseSrt),/ENOENT/);
 const media=await importMedia(input,{preserveAudio:true});assert.equal(media.preserveSource,true);assert.equal(media.volume,1);assert.match(media.src,/-original\.wav$/);const meta=await probe(path.join(root,'public',media.src));assert.equal(meta.streams[0].channels,1);
 const aac=path.join(dir,'encoded.m4a'),decoded=path.join(dir,'decoded.wav');await command('ffmpeg',['-v','error','-y','-i',path.join(root,'public',media.src),'-c:a','aac','-b:a','256k',aac]);await command('ffmpeg',['-v','error','-y','-i',aac,'-ar','48000','-ac','1','-c:a','pcm_s16le',decoded]);
 const report=path.join(dir,'report.json');await command(python,['scripts/verify-original-audio.py',input,imported.audio,decoded,report]);const r=JSON.parse(await readFile(report,'utf8'));assert.equal(r.technicalPcmExact,true);assert.equal(r.voiceSubstitution,false);assert(r.correlation>.995);assert(Math.abs(r.gainDb)<.2);
 // A previous mixer regression reduced speech by 3 dB. This must fail.
 const quieter=path.join(dir,'quieter.wav');await command('ffmpeg',['-v','error','-y','-i',decoded,'-af','volume=0.707','-c:a','pcm_s16le',quieter]);await assert.rejects(()=>command(python,['scripts/verify-original-audio.py',input,imported.audio,quieter,report]),/Fidélité insuffisante/);
 const cut=path.join(dir,'cut.wav');await command('ffmpeg',['-v','error','-y','-i',decoded,'-t','1','-c:a','pcm_s16le',cut]);await assert.rejects(()=>command(python,['scripts/verify-original-audio.py',input,imported.audio,cut,report]),/plus courte/);
});
test('grouping retains transcript, stays short and avoids isolated rushed final words',async()=>{
 const code=`import importlib.util,numpy as np\ns=importlib.util.spec_from_file_location('align','scripts/align-import.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\nc=[{'start':0,'end':4,'text':'Voici une feuille, puis une autre.'}]\nwords=[{'text':w,'start':i*.5,'end':i*.5+.48} for i,w in enumerate(['voici','une','feuille','puis','une','autre'])]\ng=m.make_groups(c,words,np.full(4*16000,.1))\nassert ' '.join(x['text'] for x in g)==c[0]['text']\nassert all(len(x['text'].split())<=5 and x['end']>x['start'] for x in g)\nprint('grouping checked')`;
 assert.match(await command(python,['-c',code]),/grouping checked/);
});
