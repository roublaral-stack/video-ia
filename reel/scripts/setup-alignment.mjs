/** Install an offline acoustic aligner. No audio is sent over the network. */
import {mkdtemp,mkdir,readFile,writeFile,cp,access,stat} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {root,command} from './media.mjs';
const pin=JSON.parse(await readFile(path.join(root,'scripts/alignment-model.lock.json'),'utf8'));
const destination=path.join(root,'.alignment/fr');
async function validated(){try{for(const [file,hash] of Object.entries(pin.sha256)){const bytes=await readFile(path.join(destination,file));if(createHash('sha256').update(bytes).digest('hex')!==hash)return false;}return true;}catch{return false;}}
try{
 await mkdir(path.join(root,'.alignment'),{recursive:true,mode:0o700});
 if(!await validated()){
  const temp=await mkdtemp('/tmp/video-ia-acoustic-model-');await command('git',['init',temp]);await command('git',['-C',temp,'remote','add','origin',pin.repository]);await command('git',['-C',temp,'fetch','--depth','1','origin',pin.commit]);await command('git',['-C',temp,'checkout','--detach','FETCH_HEAD']);
  await mkdir(destination,{recursive:true,mode:0o700});await cp(path.join(temp,'acoustic_model'),path.join(destination,'acoustic_model'),{recursive:true});await writeFile(path.join(destination,'dictionary.dict'),gunzipSync(await readFile(path.join(temp,'base_dictionary.txt.gz'))));await cp(path.join(temp,'LICENSE'),path.join(destination,'LICENSE'));
  if(!await validated())throw new Error('Empreinte du modèle différente du verrou ; alignement non installé.');
 }
 const custom=path.join(destination,'custom.dict');try{await access(custom);}catch{await writeFile(custom,"# French CMU phone inventory. Extend only with checked pronunciations.\nalocasia aa ll oo kk aa zz yy aa\nj'aime jj ai mm\nj'ai jj ai\nc'est ss ai\n");}
 await writeFile(path.join(destination,'provenance.json'),JSON.stringify({repository:pin.repository,commit:pin.commit,model:pin.model,license:'BSD-style Alpha Cephei 2015'},null,2)+'\n');
 const python=path.join(root,'.venv/bin/python');try{await access(python);}catch{await command('python3',['-m','venv',path.join(root,'.venv')]);}
 await new Promise((resolve,reject)=>{const p=spawn(python,['-m','pip','install','--cache-dir','/workspace/.pip-cache','-r','requirements-alignment.txt'],{cwd:root,env:{...process.env,CC:'/usr/bin/gcc',CXX:'/usr/bin/g++',CMAKE_BUILD_PARALLEL_LEVEL:'2'},stdio:'inherit'});p.on('error',reject);p.on('close',code=>code===0?resolve():reject(Error('Installation de l’aligneur échouée.')));});
 console.log('Alignement acoustique local prêt. Modèle et dictionnaire vérifiés. Aucun moteur vocal installé ou appelé.');
}catch(e){console.error(e.message);process.exitCode=1;}
