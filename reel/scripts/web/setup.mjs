import {mkdir,writeFile,access} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import {root} from '../media.mjs';
import {passwordHash} from './auth.mjs';

process.umask(0o077);
const directory=path.resolve(process.env.VIDEO_WEB_DATA_DIR??path.join(root,'private/web-data'));
const auth=path.join(directory,'auth');await mkdir(auth,{recursive:true,mode:0o700});
try{await access(path.join(auth,'password.hash'));throw Error('Authentification déjà configurée. Aucun écrasement automatique.');}catch(e){if(e.code!=='ENOENT')throw e;}
const password=randomBytes(24).toString('base64url');
await writeFile(path.join(auth,'password.hash'),await passwordHash(password)+'\n',{mode:0o600,flag:'wx'});
await writeFile(path.join(auth,'initial-password.txt'),password+'\n',{mode:0o600,flag:'wx'});
console.log(`Accès personnel créé. Mot de passe dans ${path.join(auth,'initial-password.txt')} (fichier privé à conserver dans votre gestionnaire, jamais dans Git).`);
