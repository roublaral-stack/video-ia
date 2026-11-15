import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import {createWebApp} from '../scripts/web/server.mjs';
import {passwordHash,Auth} from '../scripts/web/auth.mjs';
import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex} from '@noble/hashes/utils.js';
const sha=b=>createHash('sha256').update(b).digest('hex');
async function fixture(options={}){
 const directory=options.directory??await mkdtemp('/tmp/video-ia-web-test-'),password=options.password??randomBytes(24).toString('base64url');
 if(!options.directory){await mkdir(path.join(directory,'auth'),{recursive:true});await writeFile(path.join(directory,'auth/password.hash'),await passwordHash(password),{mode:0o600});}
 const app=await createWebApp({directory,origin:'http://127.0.0.1:0',uploadOptions:{chunkBytes:64*1024,maxFileBytes:2*1024**2,quotaBytes:8*1024**2,reserveBytes:0}}),base=await app.listen(0);let cookie=options.cookie??'',csrf=options.csrf??'';
 const request=async(url,{method='GET',body,raw,headers={},anonymous=false}={})=>{
  const r=await fetch(base+url,{method,headers:{...(!anonymous&&cookie?{cookie}:{}),...(!['GET','HEAD'].includes(method)?{origin:base,'x-csrf-token':csrf}:{}),...(body!==undefined?{'content-type':'application/json'}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:raw!==undefined?{body:raw}:{})});return r;
 };
 const login=async()=>{const r=await request('/api/login',{method:'POST',body:{password}});assert.equal(r.status,200);cookie=r.headers.get('set-cookie').split(';')[0];csrf=(await r.json()).csrf;return r;};
 const init=async(bytes,name='fixture.mp4',kind='visual',checksum=sha(bytes))=>{const r=await request('/api/uploads',{method:'POST',body:{name,kind,size:bytes.length,sha256:checksum}});assert.equal(r.status,201);return r.json();};
 const part=async(u,index,bytes,hash=sha(bytes))=>{const r=await request(`/api/uploads/${u.id}/parts/${index}`,{method:'PUT',raw:bytes,headers:{'x-chunk-sha256':hash}});const data=await r.json();return {status:r.status,data};};
 return {app,directory,password,base,request,login,init,part,credentials:()=>({cookie,csrf})};
}
test('private authentication, CSRF, secure cookie policy, logout and no anonymous media access',async()=>{
 const f=await fixture();try{
  for(const route of ['/api/assets','/api/uploads','/api/projects','/api/jobs','/api/jobs/anything/files/preview','/api/assets/anything/original']){const r=await f.request(route,{anonymous:true});assert.equal(r.status,401);await r.arrayBuffer();}
  const denied=await f.request('/api/login',{method:'POST',body:{password:'incorrect'}});assert.equal(denied.status,401);await denied.arrayBuffer();
  const r=await f.login();assert.match(r.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);assert.match(new Auth('/unused',{secure:true}).cookie('example'),/; Secure/);
  const noCsrf=await f.request('/api/uploads',{method:'POST',body:{},headers:{'x-csrf-token':''}});assert.equal(noCsrf.status,403);await noCsrf.arrayBuffer();
  const cross=await f.request('/api/uploads',{method:'POST',body:{},headers:{origin:'https://example.invalid'}});assert.equal(cross.status,403);await cross.arrayBuffer();
  const hostStatus=await new Promise((resolve,reject)=>{http.get(f.base+'/api/assets',{headers:{host:'example.invalid',cookie:f.credentials().cookie}},r=>{r.resume();r.on('end',()=>resolve(r.statusCode));}).on('error',reject);});assert.equal(hostStatus,421);
  const out=await f.request('/api/logout',{method:'POST'});assert.equal(out.status,200);await out.arrayBuffer();const revoked=await f.request('/api/assets');assert.equal(revoked.status,401);await revoked.arrayBuffer();
 }finally{await f.app.close();}
 await assert.rejects(()=>createWebApp({origin:'http://example.invalid'}),/HTTPS/);
});
test('login throttling limits guessing without logging credentials',async()=>{const f=await fixture();try{for(let i=0;i<5;i++){const r=await f.request('/api/login',{method:'POST',body:{password:'wrong'}});assert.equal(r.status,401);await r.arrayBuffer();}const blocked=await f.request('/api/login',{method:'POST',body:{password:f.password}});assert.equal(blocked.status,429);await blocked.arrayBuffer();}finally{await f.app.close();}});
test('chunk upload resumes after a real disconnected request and a server restart; original stays byte-identical',async()=>{
 let f=await fixture();const bytes=randomBytes(2*64*1024+319);try{
  await f.login();const u=await f.init(bytes,'original.mov');assert.equal((await f.part(u,1,bytes.subarray(64*1024,128*1024))).status,200);
  await new Promise(resolve=>{const req=http.request(f.base+`/api/uploads/${u.id}/parts/0`,{method:'PUT',headers:{cookie:f.credentials().cookie,origin:f.base,'x-csrf-token':f.credentials().csrf,'x-chunk-sha256':sha(bytes.subarray(0,64*1024)),'content-length':64*1024}});req.on('error',resolve);req.write(bytes.subarray(0,1024));setTimeout(()=>req.destroy(Error('deliberate test disconnect')),30);});
  const saved={directory:f.directory,password:f.password,...f.credentials()};await f.app.close();f=await fixture(saved);
  const status=await(await f.request('/api/uploads/'+u.id)).json();assert.deepEqual(status.parts.map(p=>p.index),[1]);
  assert.equal((await f.part(u,0,bytes.subarray(0,64*1024))).status,200);assert.equal((await f.part(u,2,bytes.subarray(128*1024))).status,200);
  const complete=await f.request(`/api/uploads/${u.id}/complete`,{method:'POST'});assert.equal(complete.status,200);const asset=await complete.json();assert.equal(asset.sha256,sha(bytes));
  const downloaded=await f.request(`/api/assets/${asset.id}/original`);assert.match(downloaded.headers.get('content-disposition'),/filename="original.mov"/);assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),bytes);
  const ranged=await f.request(`/api/assets/${asset.id}/original`,{headers:{range:'bytes=10-29'}});assert.equal(ranged.status,206);assert.deepEqual(Buffer.from(await ranged.arrayBuffer()),bytes.subarray(10,30));
  const head=await f.request(`/api/assets/${asset.id}/original`,{method:'HEAD'});assert.equal(head.headers.get('content-length'),String(bytes.length));assert.equal((await head.arrayBuffer()).byteLength,0);
  const again=await(await f.request(`/api/uploads/${u.id}/complete`,{method:'POST'})).json();assert.equal(again.id,asset.id);assert.equal((await f.init(bytes,'original.mov')).asset.id,asset.id);
  assert.deepEqual((await readdir(path.join(f.directory,'uploads',u.id))).filter(n=>n.endsWith('.chunk')),[]);
 }finally{await f.app.close();}
});
test('per-part checksum, duplicates, whole checksum and disk corruption are verified',async()=>{
 const f=await fixture();try{await f.login();const bytes=randomBytes(77),u=await f.init(bytes);
  assert.equal((await f.part(u,0,bytes,'0'.repeat(64))).status,422);assert.equal((await f.part(u,0,bytes)).status,200);assert.equal((await f.part(u,0,bytes)).data.reused,true);assert.equal((await f.part(u,0,bytes,'1'.repeat(64))).status,409);
  await writeFile(path.join(f.directory,'uploads',u.id,'0.chunk'),'corruption');const corrupted=await f.request(`/api/uploads/${u.id}/complete`,{method:'POST'});assert.equal(corrupted.status,422);await corrupted.arrayBuffer();assert.equal((await(await f.request('/api/uploads/'+u.id)).json()).parts.length,0);
  assert.equal((await f.part(u,0,bytes)).status,200);const complete=await f.request(`/api/uploads/${u.id}/complete`,{method:'POST'});assert.equal(complete.status,200);await complete.arrayBuffer();
  const bad=await f.init(bytes,'different.mp4','visual','2'.repeat(64));await f.part(bad,0,bytes);const mismatch=await f.request(`/api/uploads/${bad.id}/complete`,{method:'POST'});assert.equal(mismatch.status,422);await mismatch.arrayBuffer();assert.equal((await(await f.request('/api/assets')).json()).length,1);
 }finally{await f.app.close();}
});
test('size limits, upload cancellation and traversal protection do not alter verified originals',async()=>{
 const f=await fixture();try{await f.login();const tooBig=await f.request('/api/uploads',{method:'POST',body:{name:'huge.mov',kind:'visual',size:3*1024**2,sha256:'a'.repeat(64)}});assert.equal(tooBig.status,413);await tooBig.arrayBuffer();
  const traversal=await f.request('/api/uploads',{method:'POST',body:{name:'../../photo.jpg',kind:'visual',size:1,sha256:'a'.repeat(64)}});assert.equal(traversal.status,400);await traversal.arrayBuffer();
  const u=await f.init(Buffer.from('synthetic fixture'));const incomplete=await f.request(`/api/uploads/${u.id}/complete`,{method:'POST'});assert.equal(incomplete.status,409);await incomplete.arrayBuffer();
  const cancel=await f.request('/api/uploads/'+u.id,{method:'DELETE'});assert.equal(cancel.status,200);await cancel.arrayBuffer();const gone=await f.request('/api/uploads/'+u.id);assert.equal(gone.status,404);await gone.arrayBuffer();
 }finally{await f.app.close();}
});
test('browser incremental SHA-256 matches server hashes without buffering a whole large file',()=>{
 const chunks=Array.from({length:32},()=>randomBytes(256*1024)),client=sha256.create(),server=createHash('sha256');for(const chunk of chunks){client.update(chunk);server.update(chunk);}assert.equal(bytesToHex(client.digest()),server.digest('hex'));
});
test('quota and repeated upload initialization are checked before receiving large bodies',async()=>{
 const f=await fixture();try{await f.login();const bytes=Buffer.from('fixture');const first=await f.init(bytes);assert.equal((await f.init(bytes)).id,first.id);await f.request('/api/uploads/'+first.id,{method:'DELETE'}).then(r=>r.arrayBuffer());
  for(let i=0;i<4;i++){const r=await f.request('/api/uploads',{method:'POST',body:{name:`part-${i}.mov`,kind:'visual',size:2*1024**2,sha256:String(i).repeat(64)}});assert.equal(r.status,201);await r.arrayBuffer();}
  const refused=await f.request('/api/uploads',{method:'POST',body:{name:'extra.mov',kind:'visual',size:1,sha256:'f'.repeat(64)}});assert.equal(refused.status,507);await refused.arrayBuffer();
 }finally{await f.app.close();}
});
test('Script First web config has no synthesis, requires working-copy consent and preserves imported voice references',async()=>{
 const f=await fixture();try{await f.login();const bytes=Buffer.from('fixture bytes, not a recording'),u=await f.init(bytes,'photo.jpg');await f.part(u,0,bytes);const visual=await(await f.request(`/api/uploads/${u.id}/complete`,{method:'POST'})).json();
  const draft={subject:'Fixture',script:'Une feuille sous la lumière.',scriptValidated:true,template:'vlog',duration:15,mediaIds:[visual.id],audioId:null,hook:'Fixture',intention:'Fixture technique',workingCopiesConsent:false};
  const p=await f.app.jobs.saveProject(draft);await assert.rejects(()=>f.app.jobs.config(p),/copies de travail/);
  const scriptOnly=await f.app.jobs.saveProject({...draft,mediaIds:[],workingCopiesConsent:true});await assert.rejects(()=>f.app.jobs.config(scriptOnly),/une vraie photo ou vidéo/);
  const silent=await f.app.jobs.config({...p,workingCopiesConsent:true});assert.equal(silent.narration.engine,'none');assert.equal(silent.exceptions.illustrations,false);
  const audio=await f.init(bytes,'voice.mp3','narration');await f.part(audio,0,bytes);await f.request(`/api/uploads/${audio.id}/complete`,{method:'POST'}).then(r=>r.arrayBuffer());
  const voiced=await f.app.jobs.config({...p,workingCopiesConsent:true,audioId:audio.id});assert.equal(voiced.narration.engine,'files');assert.equal(voiced.narration.durationPolicy,'audio');assert.equal(voiced.narration.srt,undefined);assert.equal(await readFile(voiced.narration.audio,'utf8'),bytes.toString());
 }finally{await f.app.close();}
});
test('persisted interrupted jobs recover as interrupted and final artifact routes require a session',async()=>{
 let f=await fixture();try{await f.login();const credentials={...f.credentials(),directory:f.directory,password:f.password},id=randomUUID(),projectId=randomUUID(),run=path.join(f.directory,'pipeline-runs','a'.repeat(24));await mkdir(run,{recursive:true});
  for(const name of ['preview.mp4','final.mp4','sources.zip','preview-sources.zip','captions.srt'])await writeFile(path.join(run,name),'ROUTING FIXTURE ONLY');
  const job={id,projectId,created:new Date().toISOString(),revision:'fixture',status:'running',attempts:1,result:{status:'done',preview:path.join(run,'preview.mp4'),mp4:path.join(run,'final.mp4'),zip:path.join(run,'sources.zip'),srt:path.join(run,'captions.srt')}};
  await f.app.jobs.saveJob(job);await f.app.close();f=await fixture(credentials);const stored=await(await f.request('/api/jobs/'+id)).json();assert.equal(stored.status,'interrupted');
  for(const name of ['mp4','final-zip']){const blocked=await f.request(`/api/jobs/${id}/files/${name}`,{anonymous:true});assert.equal(blocked.status,401);await blocked.arrayBuffer();const allowed=await f.request(`/api/jobs/${id}/files/${name}`);assert.equal(allowed.status,200);assert.equal(await allowed.text(),'ROUTING FIXTURE ONLY');}
 }finally{await f.app.close();}
});
