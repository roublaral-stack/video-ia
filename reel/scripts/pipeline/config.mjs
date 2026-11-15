import {z} from 'zod';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
export const schema=z.object({
 version:z.literal(1),mode:z.enum(['demo','production']).optional(),subject:z.string().trim().min(1).max(120),template:z.enum(['educatif','vlog','application']),duration:z.union([z.literal(15),z.literal(30),z.literal(60)]),
 visualStyle:z.enum(['nature','typography','cinematic']).default('cinematic'),captionStyle:z.enum(['classic','editorial']).default('classic'),
 exceptions:z.object({illustrations:z.boolean().default(false),demoVoice:z.boolean().default(false),reason:z.string().min(12).optional()}).default({illustrations:false,demoVoice:false}),
 creative:z.object({hook:z.string().max(72).default(''),intention:z.string().max(600).default(''),limitations:z.array(z.string().max(300)).default([]),credits:z.array(z.object({mediaIndex:z.number().int().min(0),author:z.string(),source:z.string(),license:z.string()})).default([]),shots:z.array(z.object({start:z.number().min(0),end:z.number().positive(),mediaIndex:z.number().int().min(0),focusX:z.number().min(0).max(1).default(.5),focusY:z.number().min(0).max(1).default(.5),zoomFrom:z.number().min(1).max(1.08).default(1),zoomTo:z.number().min(1).max(1.08).default(1.035),transition:z.enum(['cut','fade']).default('cut')})).max(30).default([])}).default({}),
 demo:z.boolean().default(false),media:z.array(z.string().min(1)).max(30).default([]),
 narration:z.object({engine:z.enum(['demo','files','chatterbox']),alignment:z.object({mode:z.enum(['srt','acoustic']).default('srt'),model:z.string().optional(),python:z.string().default('python3'),reviewed:z.boolean().default(false)}).default({mode:'srt',python:'python3',reviewed:false}),text:z.string().trim().min(1).max(10000).optional(),voice:z.literal('fr-fr').default('fr-fr'),speed:z.number().int().min(90).max(220).default(145),audio:z.string().optional(),srt:z.string().optional(),python:z.string().default('python3'),device:z.enum(['cpu','cuda','mps']).default('cpu'),referenceAudio:z.string().optional(),modelDirectory:z.string().optional(),origin:z.enum(['provided-recording','chatterbox-export','demo']).default('provided-recording'),exaggeration:z.number().min(0).max(1).default(.5),cfgWeight:z.number().min(0).max(1).default(.5)}),
 brag:z.object({mode:z.enum(['off','files']).default('off'),files:z.array(z.string()).default([])}).default({mode:'off',files:[]}),
}).transform(c=>({...c,mode:c.mode??(c.demo?'demo':'production'),demo:c.mode==='demo'?true:c.demo})).superRefine((c,ctx)=>{
 const prod=c.mode==='production';
 if(prod&&c.demo)ctx.addIssue({code:'custom',path:['mode'],message:'Contradiction : mode production et demo=true.'});
 if((c.exceptions.illustrations||c.exceptions.demoVoice)&&!c.exceptions.reason)ctx.addIssue({code:'custom',path:['exceptions'],message:'Toute exception doit être demandée et motivée explicitement.'});
 if(prod&&c.narration.engine==='demo'&&!c.exceptions.demoVoice)ctx.addIssue({code:'custom',path:['narration'],message:'Voix de démonstration interdite en production. Fournir le WAV réel.'});
 if(prod&&!c.media.length&&!c.brag.files.length&&c.visualStyle!=='typography'&&!c.exceptions.illustrations)ctx.addIssue({code:'custom',path:['media'],message:'Médias réels manquants. Aucune image générique ne sera substituée.'});
 if(prod&&c.narration.engine==='files'&&c.narration.alignment.mode!=='acoustic'&&!c.narration.alignment.reviewed)ctx.addIssue({code:'custom',path:['narration','alignment'],message:'La production exige un alignement acoustique ou un SRT explicitement vérifié sur cette voix.'});
 if(prod&&c.narration.engine==='chatterbox'&&(!c.narration.referenceAudio||!c.narration.modelDirectory||!c.narration.text))ctx.addIssue({code:'custom',path:['narration'],message:'Voix personnalisée indisponible : fournir le script validé, le runtime Python, les poids locaux et la référence vocale.'});

 if(c.narration.alignment.mode==='acoustic'&&(c.narration.engine!=='files'||!c.narration.alignment.model))ctx.addIssue({code:'custom',path:['narration','alignment'],message:'L’alignement acoustique exige un audio importé et un modèle local.'});
 if(c.brag.mode==='off'&&c.brag.files.length)ctx.addIssue({code:'custom',path:['brag'],message:'Retirer les fichiers Brag lorsque le module est désactivé.'});
 if(c.brag.mode!=='off'&&c.template!=='application')ctx.addIssue({code:'custom',path:['brag'],message:'Brag est réservé au modèle application.'});
 if(c.narration.engine==='demo'&&c.mode!=='demo'&&!c.exceptions.demoVoice)ctx.addIssue({code:'custom',path:['demo'],message:'La voix de démonstration exige demo: true.'});
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
 for(const key of ['audio','srt','referenceAudio','modelDirectory'])if(config.narration[key])config.narration[key]=resolve(config.narration[key]);
 if(config.narration.alignment.model)config.narration.alignment.model=resolve(config.narration.alignment.model);
 if(config.narration.alignment.python.includes('/'))config.narration.alignment.python=resolve(config.narration.alignment.python);
 if(config.narration.python.includes('/'))config.narration.python=resolve(config.narration.python);
 return config;
}
export function splitScript(text){
 const sentences=text.replace(/\r/g,'').split(/\n+|(?<=[.!?])\s+/u).map(s=>s.trim()).filter(Boolean);const lines=[];
 for(const sentence of sentences){let line='';for(const word of sentence.split(/\s+/)){if(word.length>100)throw new Error('Mot trop long dans la narration.');if((line+' '+word).trim().length>110){lines.push(line);line=word;}else line=(line+' '+word).trim();}if(line)lines.push(line);}
 if(!lines.length)throw new Error('Script vide.');return lines;
}
export function defaultScript(c){
 if(c.mode==='production')throw new Error('Script éditorial manquant : fournir un texte oral précis ou le SRT du WAV. Aucun remplissage automatique en production.');
 const subject=c.subject.split(/\s+/).slice(0,6).join(' ');
 const bodies={educatif:['Prenons le temps de regarder les détails.','Observons les formes et la lumière.','Un changement se remarque avec un peu de patience.'],vlog:['Voici quelques images de cette journée.','On prend le temps de regarder les détails.','Chaque plan garde un petit moment.'],application:['Voici une présentation illustrée de cette application.','Regardons les écrans que nous avons préparés.','Les images montrent la présentation, étape par étape.']};
 const count=Math.max(3,c.duration/5);return Array.from({length:count},(_,i)=>i===0?`${c.demo?'Démo synthétique. ':''}Regardons ${subject}.`:i===count-1?'Voilà un petit moment avec Plantes et Bulles.':bodies[c.template][(i-1)%3]).join('\n');
}
