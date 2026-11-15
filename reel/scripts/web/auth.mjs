import {randomBytes,createHash,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {readFile,unlink} from 'node:fs/promises';
import path from 'node:path';
import {json,readJson} from '../pipeline/store.mjs';
import {HttpError} from './http.mjs';

const scrypt=promisify(scryptCallback),sha=s=>createHash('sha256').update(s).digest('hex');
export async function passwordHash(password){
 if(typeof password!=='string'||password.length<20||password.length>256)throw new Error('Mot de passe : 20 à 256 caractères. Utiliser un gestionnaire de mots de passe.');
 const salt=randomBytes(16).toString('hex'),hash=await scrypt(password,salt,64);
 return `scrypt-v1:${salt}:${hash.toString('hex')}`;
}
export class Auth {
 constructor(directory,{secure=false,ttlMs=8*3600_000}={}){this.directory=directory;this.secure=secure;this.ttlMs=ttlMs;this.attempts=new Map();}
 async credential(){const value=(await readFile(path.join(this.directory,'password.hash'),'utf8')).trim();if(!/^scrypt-v1:[a-f0-9]{32}:[a-f0-9]{128}$/.test(value))throw Error('Authentification non configurée : npm run web:setup.');return value;}
 cookie(token,maxAge=this.ttlMs/1000){return `video_ia_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(maxAge)}${this.secure?'; Secure':''}`;}
 token(req){return /(?:^|;\s*)video_ia_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie??'')?.[1];}
 async login(password,ip){
  const now=Date.now(),previous=this.attempts.get(ip),attempt=previous&&now-previous.since<15*60_000?previous:{since:now,count:0};
  if(attempt.count>=5)throw new HttpError(429,'Trop de tentatives. Réessayer dans 15 minutes.');attempt.count++;this.attempts.set(ip,attempt);
  const credential=await this.credential();const [,salt,expected]=credential.split(':');
  const valid=typeof password==='string'&&password.length<=256&&timingSafeEqual(await scrypt(password,salt,64),Buffer.from(expected,'hex'));
  if(!valid)throw new HttpError(401,'Connexion refusée.');this.attempts.delete(ip);
  const token=randomBytes(32).toString('hex'),session={csrf:randomBytes(32).toString('hex'),expires:now+this.ttlMs,credential:sha(credential)};
  await json(path.join(this.directory,'sessions',sha(token)+'.json'),session);return {token,session};
 }
 async require(req){
  const token=this.token(req);if(!token)throw new HttpError(401,'Connexion nécessaire.');
  let session;try{session=await readJson(path.join(this.directory,'sessions',sha(token)+'.json'));}catch{throw new HttpError(401,'Session expirée.');}
  if(session.expires<Date.now()||session.credential!==sha(await this.credential()))throw new HttpError(401,'Session expirée.');
  if(!['GET','HEAD'].includes(req.method)&&req.headers['x-csrf-token']!==session.csrf)throw new HttpError(403,'Requête non autorisée. Actualiser la session.');return session;
 }
 async logout(req){const token=this.token(req);if(token)await unlink(path.join(this.directory,'sessions',sha(token)+'.json')).catch(()=>{});}
}
