import {z} from 'zod';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
export const schema=z.object({
 version:z.literal(1),subject:z.string().trim().min(1).max(120),template:z.enum(['educatif','vlog','application']),duration:z.union([z.literal(15),z.literal(30),z.literal(60)]),
 demo:z.boolean().default(false),media:z.array(z.string().min(1)).max(30).default([]),
 narration:z.object({engine:z.enum(['demo','files','chatterbox']),text:z.string().trim().min(1).max(10000).optional(),voice:z.literal('fr-fr').default('fr-fr'),speed:z.number().int().min(90).max(220).default(145),audio:z.string().optional(),srt:z.string().optional(),python:z.string().default('python3'),device:z.enum(['cpu','cuda','mps']).default('cpu'),referenceAudio:z.string().optional(),exaggeration:z.number().min(0).max(1).default(.5),cfgWeight:z.number().min(0).max(1).default(.5)}),
 brag:z.object({mode:z.enum(['off','files']).default('off'),files:z.array(z.string()).default([])}).default({mode:'off',files:[]}),
}).superRefine((c,ctx)=>{
 if(c.brag.mode==='off'&&c.brag.files.length)ctx.addIssue({code:'custom',path:['brag'],message:'Retirer les fichiers Brag lorsque le module est désactivé.'});
 if(c.brag.mode!=='off'&&c.template!=='application')ctx.addIssue({code:'custom',path:['brag'],message:'Brag est réservé au modèle application.'});
 if(c.narration.engine==='demo'&&!c.demo)ctx.addIssue({code:'custom',path:['demo'],message:'La voix de démonstration exige demo: true.'});
 if(c.narration.engine==='files'&&(!c.narration.audio||!c.narration.srt))ctx.addIssue({code:'custom',path:['narration'],message:'Importer audio ET SRT ; aucun faux alignement ne sera inventé.'});
 if(c.brag.mode==='files'&&!c.brag.files.length)ctx.addIssue({code:'custom',path:['brag'],message:'Indiquez les exports Brag à importer.'});
 if(c.demo&&c.narration.referenceAudio)ctx.addIssue({code:'custom',path:['narration','referenceAudio'],message:'Aucun échantillon personnel dans un test de démonstration.'});
 if(c.media.length+c.brag.files.length>Math.floor(c.duration/2))ctx.addIssue({code:'custom',path:['media'],message:'Au moins 2 secondes par média.'});
});
export const sha=data=>createHash('sha256').update(data).digest('hex');
export async function loadConfig(file){
 const config=schema.parse(JSON.parse(await readFile(file,'utf8')));const base=path.dirname(path.resolve(file));
 const resolve=p=>{if(/^https?:\/\//i.test(p))throw new Error('Importez des fichiers locaux, pas des URL.');return path.resolve(base,p);};
 config.media=config.media.map(resolve);config.brag.files=config.brag.files.map(resolve);
 for(const key of ['audio','srt','referenceAudio'])if(config.narration[key])config.narration[key]=resolve(config.narration[key]);
 if(config.narration.python.includes('/'))config.narration.python=resolve(config.narration.python);
 return config;
}
export function splitScript(text){
 const sentences=text.replace(/\r/g,'').split(/\n+|(?<=[.!?])\s+/u).map(s=>s.trim()).filter(Boolean);const lines=[];
 for(const sentence of sentences){let line='';for(const word of sentence.split(/\s+/)){if(word.length>100)throw new Error('Mot trop long dans la narration.');if((line+' '+word).trim().length>110){lines.push(line);line=word;}else line=(line+' '+word).trim();}if(line)lines.push(line);}
 if(!lines.length)throw new Error('Script vide.');return lines;
}
export function defaultScript(c){
 const subject=c.subject.split(/\s+/).slice(0,6).join(' ');
 const bodies={educatif:['Prenons le temps de regarder les détails.','Observons les formes et la lumière.','Un changement se remarque avec un peu de patience.'],vlog:['Voici quelques images de cette journée.','On prend le temps de regarder les détails.','Chaque plan garde un petit moment.'],application:['Voici une présentation illustrée de cette application.','Regardons les écrans que nous avons préparés.','Les images montrent la présentation, étape par étape.']};
 const count=Math.max(3,c.duration/5);return Array.from({length:count},(_,i)=>i===0?`${c.demo?'Démo synthétique. ':''}Regardons ${subject}.`:i===count-1?'Voilà un petit moment avec Plantes et Bulles.':bodies[c.template][(i-1)%3]).join('\n');
}
