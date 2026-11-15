import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,mkdir,stat,rename,unlink} from 'node:fs/promises';
import path from 'node:path';
export const root=path.resolve(import.meta.dirname,'..');
export function command(bin,args){return new Promise((resolve,reject)=>{const p=spawn(bin,args,{cwd:root,stdio:['ignore','pipe','pipe']});let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err=(err+b).slice(-6000));p.on('error',reject);p.on('close',code=>code===0?resolve(out):reject(new Error(`${bin}: ${err||`exit ${code}`}`)));});}
export async function probe(file){return JSON.parse(await command('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file]));}
export async function importMedia(file){
 const ext=path.extname(file).toLowerCase();const allowed=['.jpg','.jpeg','.png','.webp','.mp4','.mov','.m4v','.webm','.mkv','.mp3','.wav','.m4a','.aac','.ogg','.flac'];
 if(!allowed.includes(ext))throw new Error('Format non pris en charge. Utilisez JPEG/PNG/WebP, MP4/MOV/WebM ou MP3/WAV/M4A. Convertir HEIC en JPEG sur iPhone.');
 const info=await stat(file);if(!info.isFile()||info.size>500*1024*1024)throw new Error('Fichier invalide ou supérieur à 500 Mo.');
 const meta=await probe(file);const image=['.jpg','.jpeg','.png','.webp'].includes(ext);const video=meta.streams.find(s=>s.codec_type==='video'&&!s.disposition?.attached_pic);const audio=meta.streams.find(s=>s.codec_type==='audio');
 const type=image?'image':video?'video':audio?'audio':null;
 if(!type||(image&&!video))throw new Error('Aucun média décodable.');
 const durationSeconds=Number(meta.format.duration||video?.duration||audio?.duration||0);
 if(type!=='image'&&(!Number.isFinite(durationSeconds)||durationSeconds<=0||durationSeconds>600))throw new Error('Durée invalide : maximum 10 minutes par fichier.');
 const hash=createHash('sha256').update(await readFile(file)).digest('hex').slice(0,20);const targetExt=type==='image'?'.jpg':type==='video'?'.mp4':'.wav';
 const dir=path.join(root,'public/uploads');await mkdir(dir,{recursive:true});const dest=path.join(dir,hash+targetExt);const temp=path.join(dir,hash+'-'+randomUUID()+targetExt);
 const args=['-v','error','-y','-i',path.resolve(file),'-map_metadata','-1'];
 if(type==='image')args.push('-frames:v','1','-vf','scale=1920:1920:force_original_aspect_ratio=decrease','-q:v','2');
 if(type==='video')args.push('-map','0:v:0','-an','-vf','scale=1080:1920:force_original_aspect_ratio=decrease:force_divisible_by=2','-r','30','-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart');
 if(type==='audio')args.push('-vn','-ar','48000','-ac','2','-c:a','pcm_s16le');
 try{await command('ffmpeg',[...args,temp]);await rename(temp,dest);}catch(e){await unlink(temp).catch(()=>{});throw e;}
 const normalized=await probe(dest);
 return {src:'uploads/'+path.basename(dest),type,...(type!=='image'?{durationSeconds:Number(normalized.format.duration)}:{}),...(type!=='audio'?{trimStart:0,fit:'cover',label:'Média personnel importé'}:{trimStart:0,from:0,volume:.6,loop:false})};
}
