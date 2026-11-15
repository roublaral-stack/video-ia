import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {command,probe,root} from '../scripts/media.mjs';
import path from 'node:path';
test('mobile editor: multi-import, SRT sync, project save, actual MP4 export and download', {timeout:240000}, async()=>{
 const dir=path.join(root,'out/e2e');await mkdir(dir,{recursive:true});
 await command('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=c=0x37684b:s=360x640','-frames:v','1',dir+'/photo.jpg']);
 await command('ffmpeg',['-v','error','-y','-f','lavfi','-i','testsrc2=size=320x180:rate=30','-t','2','-c:v','libx264','-pix_fmt','yuv420p',dir+'/video.mov']);
 await command('ffmpeg',['-v','error','-y','-f','lavfi','-i','sine=frequency=220:duration=3','-c:a','pcm_s16le',dir+'/audio.wav']);
 await writeFile(dir+'/captions.srt','1\n00:00:01,000 --> 00:00:04,000\nSous-titre synchronisé.\n');
 const server=spawn(process.execPath,['scripts/editor.mjs'],{cwd:root,env:{...process.env,PORT:'3220'},stdio:['ignore','pipe','pipe']});let logs='';server.stdout.on('data',b=>logs=(logs+b).slice(-8000));server.stderr.on('data',b=>logs=(logs+b).slice(-8000));
 let browser;
 try{
  let ready=false;for(let i=0;i<60;i++){try{if((await fetch('http://127.0.0.1:3220/')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert(ready,'editor server ready');
  const bad=await fetch('http://127.0.0.1:3220/api/projects',{method:'POST',body:JSON.stringify({subject:''})});assert.equal(bad.status,400);
  const traversal=await fetch('http://127.0.0.1:3220/api/render',{method:'POST',body:JSON.stringify({id:'../../README'})});assert.equal(traversal.status,400);
  const cross=await fetch('http://127.0.0.1:3220/api/projects',{method:'POST',headers:{origin:'https://other.test'},body:'{}'});assert.equal(cross.status,403);
  browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true});const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,acceptDownloads:true});const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:3220/');
  await page.selectOption('#template','vlog');await page.fill('#subject','Mon aquarium — test');await page.fill('#titles','Bienvenue\nUn détail vivant\nÀ bientôt');
  await page.setInputFiles('#media',[dir+'/photo.jpg',dir+'/video.mov']);await page.waitForFunction(()=>document.querySelector('#status').textContent==='Médias importés. Construisez la timeline.',{},{timeout:45000});
  assert.match(await page.locator('#assets').textContent(),/image/);assert.match(await page.locator('#assets').textContent(),/video/);
  await page.setInputFiles('#audio',dir+'/audio.wav');await page.waitForFunction(()=>document.querySelector('#status').textContent==='Audio importé.');await page.check('#audioLoop');await page.fill('#audioFrom','1');await page.fill('#volume','0.25');
  await page.fill('#transcript','Une proposition de sous-titres à synchroniser.');await page.click('#autoCaptions');await page.waitForFunction(()=>document.querySelector('#status').textContent==='Calage proposé : ajustez-le sur votre audio.');assert.match(await page.locator('#captions').inputValue(),/Une proposition/);
  await page.setInputFiles('#srt',dir+'/captions.srt');await page.waitForFunction(()=>document.querySelector('#status').textContent==='SRT importé. Vérifiez le calage.');await page.fill('#offset','0.25');
  const savedResponse=page.waitForResponse(r=>r.url().endsWith('/api/projects')&&r.request().method()==='POST');await page.click('#save');assert(await page.locator('#form').evaluate(el=>el.checkValidity()),'form must accept millisecond offsets');const saved=await(await savedResponse).json();assert(saved.id,JSON.stringify(saved));assert.equal(saved.project.media.length,2);assert.equal(saved.project.audio.loop,true);assert.equal(saved.project.captionOffset,.25);
  await page.waitForFunction(()=>document.querySelector('#export').disabled===false);assert.match(await page.locator('#timeline').textContent(),/fondu/);
  const jsonDownload=page.waitForEvent('download');await page.click('#downloadJson');await(await jsonDownload).saveAs(dir+'/project.json');assert.equal(JSON.parse(await readFile(dir+'/project.json','utf8')).subject,'Mon aquarium — test');
  await page.screenshot({path:dir+'/editor-mobile.png',fullPage:true});
  await page.click('#export');await page.waitForFunction(()=>document.querySelector('#result a')!==null,{},{timeout:180000});
  const download=page.waitForEvent('download');await page.click('#result a');await(await download).saveAs(dir+'/editor-export.mp4');
  const meta=await probe(dir+'/editor-export.mp4');// AAC packets add up to one codec frame of padding to the container.
  assert(Math.abs(Number(meta.format.duration)-15)<.05);const video=meta.streams.find(s=>s.codec_type==='video');assert.equal(Number(video.duration),15);assert.equal(video.width,1080);assert.equal(video.height,1920);assert.equal(Number(video.nb_frames),450);assert(meta.streams.some(s=>s.codec_type==='audio'));
  await command('ffmpeg',['-v','error','-i',dir+'/editor-export.mp4','-f','null','-']);assert.deepEqual(errors,[]);
 }catch(e){throw new Error(e.message+'\n'+logs,{cause:e});}finally{await browser?.close();server.kill('SIGTERM');}
});
