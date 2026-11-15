import {mkdir,readFile,writeFile,rename,stat,open,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
export async function digest(file){const h=createHash('sha256');for await(const b of createReadStream(file))h.update(b);return h.digest('hex');}
export async function json(file,value){await mkdir(path.dirname(file),{recursive:true,mode:0o700});const temp=file+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(value,null,2)+'\n',{mode:0o600});await rename(temp,file);}
export async function readJson(file){return JSON.parse(await readFile(file,'utf8'));}
export async function fingerprints(files){return Promise.all([...new Set(files)].map(async file=>({file:path.resolve(file),sha256:await digest(file)})));}
export async function intact(outputs){try{for(const o of outputs??[]){if(!(await stat(o.file)).isFile()||await digest(o.file)!==o.sha256)return false;}return outputs?.length>0;}catch{return false;}}
export async function lock(dir){
 await mkdir(dir,{recursive:true,mode:0o700});const file=path.join(dir,'.lock');
 for(let attempt=0;attempt<2;attempt++){
  try{const fd=await open(file,'wx',0o600);await fd.writeFile(JSON.stringify({pid:process.pid}));await fd.close();return async()=>{await unlink(file).catch(()=>{});};}
  catch(e){if(e.code!=='EEXIST')throw e;let pid;try{pid=(await readJson(file)).pid;}catch{throw new Error('Verrou incomplet : vérifier les processus puis supprimer .lock.');}
   try{process.kill(pid,0);throw new Error(`Une production est déjà en cours (PID ${pid}).`);}catch(err){if(err.code!=='ESRCH')throw err;}await unlink(file);
  }
 }
 throw new Error('Impossible de verrouiller la production.');
}
