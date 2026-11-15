import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,open,stat,readFile,rm,readdir} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {command,probe,root} from '../scripts/media.mjs';
import {digest,readJson} from '../scripts/pipeline/store.mjs';
import {passwordHash} from '../scripts/web/auth.mjs';
import {createWebApp} from '../scripts/web/server.mjs';

test('mobile web: multiple originals over 500 MiB, audio upload, consent, real Script First preview and private MP4/ZIP',{timeout:300000},async()=>{
 const directory=await mkdtemp('/tmp/video-ia-web-browser-'),fixtures=path.join(directory,'fixtures');await mkdir(fixtures);await mkdir(path.join(directory,'auth'));
 await mkdir(path.join(root,'private/web-test-artifacts'),{recursive:true,mode:0o700});
 const password=randomBytes(24).toString('base64url');await writeFile(path.join(directory,'auth/password.hash'),await passwordHash(password),{mode:0o600});
 const image=path.join(fixtures,'fixture-photo.jpg'),video=path.join(fixtures,'fixture-video.mov'),audio=path.join(fixtures,'fixture-nonverbal.wav');
 await command('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=c=0x274d3b:s=1440x2560','-frames:v','1',image]);
 await command('ffmpeg',['-v','error','-y','-f','lavfi','-i','testsrc2=size=720x1280:rate=30','-t','15','-c:v','libx264','-preset','veryfast','-crf','30','-pix_fmt','yuv420p',video]);
 await command('ffmpeg',['-v','error','-y','-f','lavfi','-i','sine=frequency=220:duration=15','-c:a','pcm_s16le',audio]);
 // Standard QuickTime "free" padding creates a valid sparse >500 MiB test
 // original without needing a personal recording or a long generated movie.
 const originalSize=(await stat(video)).size,target=501*1024**2,padding=Buffer.alloc(8);padding.writeUInt32BE(target-originalSize);padding.write('free',4);const fd=await open(video,'r+');await fd.write(padding,0,8,originalSize);await fd.truncate(target);await fd.close();
 assert.equal(Number((await probe(video)).format.duration),15);const originalSha=await digest(video);
 const app=await createWebApp({directory,origin:'http://127.0.0.1:0',uploadOptions:{reserveBytes:0}}),host=await app.listen(0);let browser,passed=false;
 try{
  browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true});const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,acceptDownloads:true});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(host);assert.equal((await fetch(host+'/api/assets')).status,401);
  await page.fill('#password',password);await page.click('#login-form button');await page.waitForSelector('#workspace:not([hidden])');
  let held,release;const intercepted=new Promise(r=>release=r),firstParts=[];page.on('request',r=>{if(r.method()==='PUT'&&r.url().endsWith('/parts/0'))firstParts.push(r.url());});
  const pattern='**/api/uploads/*/parts/1';await page.route(pattern,route=>{held=route;release();});
  await page.setInputFiles('#visuals',[image,video]);await Promise.race([intercepted,new Promise((_,reject)=>setTimeout(()=>reject(Error('No multipart request intercepted')),90000))]);
  await page.locator('.upload-item').nth(1).getByRole('button',{name:'Pause',exact:true}).click();await held.abort().catch(()=>{});await page.unroute(pattern);
  const uploads=await readdir(path.join(directory,'uploads'));let partial;for(const id of uploads){const u=await app.uploads.metadata(id);if(u.name==='fixture-video.mov')partial=u;}assert.deepEqual(Object.keys(partial.parts),['0']);
  await page.reload();await page.waitForSelector('#workspace:not([hidden])');await page.setInputFiles('#visuals',video);await page.waitForFunction(()=>document.querySelectorAll('#assets .asset').length===2,{},{timeout:90000});
  assert.equal(firstParts.filter(url=>url.includes(partial.id)).length,1,'the accepted first video chunk must not be uploaded again after page reload');
  for(const input of await page.locator('#assets input[name=visual]').all())await input.check();
  await page.setInputFiles('#voice',audio);await page.waitForFunction(()=>document.querySelectorAll('#assets .asset').length===3,{},{timeout:15000});
  const assets=await app.uploads.listAssets(),v=assets.find(a=>a.name==='fixture-video.mov'),a=assets.find(a=>a.kind==='narration');assert.equal(v.size,target);assert.equal(v.sha256,originalSha);assert.equal(a.sha256,await digest(audio));
  // The test signal exercises audio import only; it is never presented as speech.
  await page.locator('#assets input[name=audio]').first().check();
  await page.fill('#subject','Fixture du workflow privé');await page.fill('#script','Regardez cette feuille. Sa lumière change au fil de la journée. Prenons le temps de regarder les détails.');await page.fill('#hook','Montage de test');await page.fill('#intention','Fixture technique : photo de couleur et mire vidéo, sans valeur créative.');await page.check('#script-validated');
  await page.click('#preview');await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('Autoriser les copies'));assert.equal((await app.jobs.projects()).length,1);
  await page.check('#working-consent');const response=page.waitForResponse(r=>r.url().endsWith('/preview')&&r.request().method()==='POST');await page.click('#preview');const queued=await(await response).json();assert(queued.id,JSON.stringify(queued));
  await page.waitForFunction(()=>document.querySelector('#preview-video').hidden===false||document.querySelector('#job-error').hidden===false,{},{timeout:180000});assert.equal(await page.locator('#job-error').isVisible(),false,await page.locator('#job-error').textContent());
  const job=await app.jobs.get(queued.id);assert.equal(job.status,'awaiting_review');assert.equal(job.result.captionTiming,'provisional');
  const report=await readJson(path.join(path.dirname(job.result.preview),'preview-verification.json'));assert.equal(report.width,720);assert.equal(report.height,1280);assert.equal(report.voicePresent,false);assert.equal(report.decoded,true);
  for(const [label,out] of [['MP4 aperçu','preview.mp4'],['ZIP privé rééditable','project.zip']]){const event=page.waitForEvent('download');await page.getByRole('link',{name:label,exact:true}).click();await(await event).saveAs(path.join(fixtures,out));}
  assert.equal(await digest(path.join(fixtures,'preview.mp4')),await digest(job.result.preview));await command('python3',['-c','import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;assert "project.json" in z.namelist()',path.join(fixtures,'project.zip')]);
  for(const name of ['preview','zip']){const r=await fetch(host+`/api/jobs/${job.id}/files/${name}`);assert.equal(r.status,401);await r.arrayBuffer();}
  assert.equal(await digest((await app.uploads.asset(v.id)).file),originalSha);assert.equal(await digest(video),originalSha);
  await page.screenshot({path:path.join(root,'private/web-test-artifacts/mobile-tested.png'),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.check('#review-confirmed');await page.fill('#review-note','Fixture synthétique uniquement : accord de montage sans voix.');await page.click('#approve');await page.waitForFunction(()=>document.querySelector('#job-title').textContent.includes('voix attendue'),{},{timeout:30000});
  const approved=await app.jobs.get(job.id);assert.equal(approved.status,'awaiting_audio');assert.equal(approved.result.scope,'montage-only-provisional');assert.equal((await readJson(path.join(path.dirname(job.result.preview),'state.json'))).steps.render,undefined);
  assert.deepEqual(errors,[]);passed=true;
 }finally{await browser?.close();await app.close();if(passed)await rm(directory,{recursive:true,force:true});}
});
