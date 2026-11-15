import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {command,probe,root} from '../media.mjs';
import {digest,readJson,json} from './store.mjs';
export function wav(pcm,rate=48000){const h=Buffer.alloc(44);h.write('RIFF');h.writeUInt32LE(36+pcm.length,4);h.write('WAVEfmt ',8);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(1,22);h.writeUInt32LE(rate,24);h.writeUInt32LE(rate*2,28);h.writeUInt16LE(2,32);h.writeUInt16LE(16,34);h.write('data',36);h.writeUInt32LE(pcm.length,40);return Buffer.concat([h,pcm]);}
export function pcm(data){
 if(data.toString('ascii',0,4)!=='RIFF')throw new Error('WAV PCM attendu.');let valid=false;
 for(let i=12;i+8<=data.length;){const tag=data.toString('ascii',i,i+4),n=data.readUInt32LE(i+4);if(tag==='fmt ')valid=data.readUInt16LE(i+8)===1&&data.readUInt16LE(i+10)===1&&data.readUInt32LE(i+12)===48000&&data.readUInt16LE(i+22)===16;if(tag==='data'){if(!valid)throw new Error('WAV mono 48 kHz 16 bits attendu.');return data.subarray(i+8,i+8+n);}i+=8+n+(n%2);}throw new Error('WAV sans données.');
}
export async function demoSpeech(parts,dir,narration){
 const {default:create}=await import('@echogarden/espeak-ng-emscripten');const m=await create();const worker=new m.eSpeakNGWorker();worker.set_voice('',narration.voice);worker.rate=narration.speed;const files=[];
 try{for(const [i,text] of parts.entries()){const chunks=[];worker.synthesize(text,samples=>{chunks.push(Buffer.from(samples.buffer,samples.byteOffset,samples.byteLength));return false;});const raw=path.join(dir,`raw-${i}.wav`);await writeFile(raw,wav(Buffer.concat(chunks),worker.samplerate),{mode:0o600});files.push({text,audio:raw});}}finally{m.destroy(worker);}return files;
}
export async function chatterboxSpeech(parts,dir,narration){
 const request=path.join(dir,'chatterbox-request.json'),response=path.join(dir,'chatterbox-response.json');await json(request,{parts,outputDirectory:dir,device:narration.device,language:'fr',referenceAudio:narration.referenceAudio,modelDirectory:narration.modelDirectory,exaggeration:narration.exaggeration,cfgWeight:narration.cfgWeight});
 try{await command(narration.python,[path.join(root,'adapters/chatterbox.py'),request,response]);}catch(e){throw new Error('Chatterbox indisponible. Installer son environnement et ses modèles, ou utiliser engine=files avec audio+SRT. Détail : '+e.message);}
 const result=await readJson(response);if(!Array.isArray(result.segments)||result.segments.length!==parts.length)throw new Error('Réponse Chatterbox invalide.');
 for(let i=0;i<parts.length;i++){const s=result.segments[i];if(s.text!==parts[i]||!path.resolve(s.audio).startsWith(path.resolve(dir)+path.sep))throw new Error('Segment Chatterbox incompatible avec le script.');}return result.segments;
}
export async function assembleSpeech(segments,dir,duration,{natural=false}={}){
 await mkdir(dir,{recursive:true});const chunks=[];
 for(const [i,s] of segments.entries()){const file=path.join(dir,`part-${i}.wav`);await command('ffmpeg',['-v','error','-y','-i',s.audio,'-vn','-ar','48000','-ac','1','-c:a','pcm_s16le',file]);chunks.push({text:s.text,file,data:pcm(await readFile(file))});}
 const sampleRate=48000,lead=natural?.12:.5,endPadding=natural?.25:1;const seconds=chunks.reduce((a,b)=>a+b.data.length/(sampleRate*2),0);
 if(seconds+lead+endPadding+(natural?.16*Math.max(0,chunks.length-1):0)>duration)throw new Error(`Narration trop longue (${seconds.toFixed(2)} s de parole pour ${duration} s). Réduire le texte ou ajuster la vitesse, sans couper la voix.`);
 if(natural&&Math.abs(duration-(seconds+lead+endPadding+.16*(chunks.length-1)))>.5)throw new Error('Narration incompatible avec la durée : réviser le script ou la durée. Aucun remplissage artificiel par des silences.');
 const gap=natural?.16:chunks.length>1?(duration-lead-endPadding-seconds)/(chunks.length-1):0;const buffers=[Buffer.alloc(Math.round(lead*sampleRate)*2)];let cursor=lead;const captions=[];
 for(const [i,c] of chunks.entries()){const length=c.data.length/(sampleRate*2);captions.push({start:Math.round(cursor*1000)/1000,end:Math.round((cursor+length)*1000)/1000,text:c.text});buffers.push(c.data);cursor+=length;if(i<chunks.length-1){const samples=Math.floor(gap*sampleRate);buffers.push(Buffer.alloc(samples*2));cursor+=samples/sampleRate;}}
 const joined=Buffer.concat(buffers),target=duration*sampleRate*2;buffers.push(Buffer.alloc(natural?Math.round(endPadding*sampleRate)*2:Math.max(0,target-joined.length)));const file=path.join(dir,'narration.wav');await writeFile(file,wav(Buffer.concat(buffers)),{mode:0o600});
 await json(path.join(dir,'alignment.json'),{method:'synthesized-phrase-boundaries',granularity:'phrase',sampleRate,speechSeconds:seconds,captions,parts:chunks.map(c=>c.file)});return {audio:file,captions,method:'synthesized-phrase-boundaries'};
}
export async function importedSpeech(config,dir,parseSrt){
 if(config.narration.engine!=='files')throw new Error('Import protégé : moteur files exclusivement, aucun remplacement vocal.');
 const source=config.narration.audio,file=path.join(dir,'narration.wav');const inputSha256=await digest(source);
 // Technical conversion only. No loudness filter, trim, tempo, pitch, delay or fade.
 await command('ffmpeg',['-v','error','-y','-i',source,'-vn','-ar','48000','-ac','1','-c:a','pcm_s16le',file]);
 const length=Number((await probe(file)).format.duration);let captions=parseSrt(await readFile(config.narration.srt,'utf8')),method='imported-srt-timing-not-forced-alignment';
 if(config.narration.alignment?.mode==='acoustic'){
  const report=path.join(dir,'acoustic-alignment.json');
  await command(config.narration.alignment.python,[path.join(root,'scripts/align-import.py'),source,config.narration.srt,config.narration.alignment.model,report]);
  const aligned=await readJson(report);if(aligned.inputSha256!==inputSha256)throw new Error('L’alignement ne correspond pas au WAV fourni.');captions=aligned.captions;method=aligned.method;
 }
 if(length>config.duration+.001||!captions.length||captions.some(c=>c.start<0||c.end>length||c.end<=c.start))throw new Error('Audio/SRT hors durée ou vide ; fournir un SRT aligné sur cet audio.');
 await json(path.join(dir,'alignment.json'),{method,captions,inputSha256,audioOrigin:'files',preserveSource:true,transforms:['resample-48000','mono-pcm16'],noVoiceSubstitution:true});
 return {audio:file,captions,method,engine:'files',preserveSource:true,originalFile:source,inputSha256};
}
export function toSrt(captions){const stamp=s=>{const n=Math.round(s*1000);return `${String(Math.floor(n/3600000)).padStart(2,'0')}:${String(Math.floor(n/60000)%60).padStart(2,'0')}:${String(Math.floor(n/1000)%60).padStart(2,'0')},${String(n%1000).padStart(3,'0')}`;};return captions.map((c,i)=>`${i+1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`).join('\n');}
