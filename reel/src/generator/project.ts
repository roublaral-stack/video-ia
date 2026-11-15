import {z} from 'zod';
const localSource=z.string().regex(/^(uploads|demo)\/[a-zA-Z0-9_.-]+$/, 'Utilisez un fichier importé, pas une URL externe.');
export const projectSchema=z.object({
  version:z.literal(1).default(1),
  subject:z.string().trim().min(1).max(120),
  template:z.enum(['educatif','vlog','application']),
  duration:z.union([z.literal(15),z.literal(30),z.literal(60)]),
  titleAnimation:z.enum(['simple','snapcn']).default('simple'),
  visualStyle:z.enum(['nature','typography','cinematic']).default('nature'),
  productionMode:z.enum(['legacy','demo','production']).default('legacy'),
  allowIllustrations:z.boolean().default(false),requiresCreativeApproval:z.boolean().default(false),
  montage:z.object({hook:z.string().max(72),shots:z.array(z.object({start:z.number().min(0),end:z.number().positive(),mediaIndex:z.number().int().min(0),focusX:z.number().min(0).max(1),focusY:z.number().min(0).max(1),zoomFrom:z.number().min(1).max(1.08),zoomTo:z.number().min(1).max(1.08),transition:z.enum(['cut','fade'])})).max(30)}).optional(),
  captionStyle:z.enum(['classic','editorial']).default('classic'),
  titles:z.array(z.string().trim().min(1).max(90)).max(30).default([]),
  media:z.array(z.object({src:localSource,type:z.enum(['image','video']),durationSeconds:z.number().positive().max(86400).optional(),trimStart:z.number().min(0).default(0),fit:z.enum(['cover','contain']).default('cover'),label:z.string().max(100).default('')})).max(30).default([]),
  captions:z.array(z.object({start:z.number().min(0),end:z.number().positive(),text:z.string().trim().min(1).max(160)})).max(500).default([]),
  captionOffset:z.number().min(-60).max(60).default(0),
  audio:z.object({src:localSource,durationSeconds:z.number().positive(),trimStart:z.number().min(0).default(0),from:z.number().min(0).default(0),volume:z.number().min(0).max(1).default(.6),loop:z.boolean().default(false),preserveSource:z.boolean().default(false)}).optional(),
}).superRefine((p,ctx)=>{
  if(p.media.length>Math.floor(p.duration/2))ctx.addIssue({code:'custom',path:['media'],message:'Prévoir au moins 2 secondes par média ; choisissez une durée plus longue.'});
  for(const [i,m] of p.media.entries())if(m.type==='video'&&(!m.durationSeconds||m.trimStart>=m.durationSeconds))ctx.addIssue({code:'custom',path:['media',i],message:'Durée vidéo ou point de départ invalide.'});
  let last=0;
  for(const [i,c] of p.captions.entries()){
    if(c.end<=c.start||c.start<last||c.start+p.captionOffset<0||c.end+p.captionOffset>p.duration)ctx.addIssue({code:'custom',path:['captions',i],message:'Sous-titres ordonnés, sans chevauchement, dans la durée du Reel.'});
    last=c.end;
  }
  if(p.audio?.preserveSource&&(p.audio.trimStart!==0||p.audio.from!==0||p.audio.volume!==1||p.audio.loop))ctx.addIssue({code:'custom',path:['audio'],message:'Voix protégée : aucun gain, décalage, boucle ou découpe autorisé.'});
  if(p.audio&&(p.audio.trimStart>=p.audio.durationSeconds||p.audio.from>=p.duration))ctx.addIssue({code:'custom',path:['audio'],message:'Point de départ audio hors durée.'});
});
export type Project=z.infer<typeof projectSchema>;
export const templates={
 educatif:{name:'Éducatif',beats:['La question','Observer','Comprendre','À retenir'],cta:'Cultivons un peu de nature.'},
 vlog:{name:'Vlog',beats:['Aujourd’hui','Dans les coulisses','Le petit détail','À bientôt'],cta:'On se retrouve au prochain épisode.'},
 application:{name:'Présentation de l’application',beats:['Une idée','Le besoin','En pratique','À découvrir'],cta:'Découvrez Plantes & Bulles.'},
};
export const exampleProject:Project=projectSchema.parse({version:1,subject:'Un aquarium vivant',template:'educatif',duration:15,titles:['Un monde vivant','Le calme pousse','Plantes & Bulles'],captions:[{start:1,end:4,text:'Une pause au rythme de l’eau.'},{start:6,end:9,text:'Des feuilles, de la lumière, de la vie.'},{start:11,end:14,text:'Un petit morceau de nature, chez soi.'}]});
export type Shot={index:number;from:number;duration:number;overlap:number;title:string;media?:Project['media'][number]};
export function buildTimeline(project:Project,fps=30):Shot[]{
 const p=projectSchema.parse(project);const count=Math.max(3,Math.ceil(p.duration/5),p.media.length,p.titles.length);
 if(count>p.duration*fps/45)throw new Error('Trop de titres pour cette durée.');
 const overlaps=Array.from({length:count},(_,i)=>i>0&&i%2===1?12:0);
 const budget=p.duration*fps+overlaps.reduce<number>((a,b)=>a+b,0);const base=Math.floor(budget/count);let from=0;
 return Array.from({length:count},(_,i)=>{const duration=base+(i<budget%count?1:0);from-=overlaps[i];const shot={index:i,from,duration,overlap:overlaps[i],title:p.titles[i]??(i===0?p.subject:templates[p.template].beats[Math.min(i,3)]),media:p.media.length?p.media[i%p.media.length]:undefined};from+=duration;return shot;});
}
// Outgoing titles finish before the incoming title appears during a dissolve.
export function titleVisibility(frame:number,duration:number,guard=15){return Math.max(0,Math.min(1,(frame-guard)/10,(duration-guard-frame)/10));}
export function parseSrt(text:string){
 const stamp=(s:string)=>{const m=/^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$/.exec(s);if(!m||+m[2]>59||+m[3]>59)throw new Error('Horodatage SRT invalide');return (+m[1]*3600000 + +m[2]*60000 + +m[3]*1000 + +m[4])/1000;};
 return text.replace(/^\uFEFF/,'').trim().split(/\r?\n\s*\r?\n/).filter(Boolean).map(block=>{const lines=block.split(/\r?\n/);if(/^\d+$/.test(lines[0]))lines.shift();const parts=lines.shift()?.split(/\s+-->\s+/);if(!parts||parts.length!==2)throw new Error('Bloc SRT invalide');return {start:stamp(parts[0]),end:stamp(parts[1]),text:lines.join(' ').replace(/<[^>]*>/g,'')};});
}
// Provisional timing from written copy; the user must align it with actual speech.
export function makeCaptions(text:string,duration:15|30|60){
 const words=text.trim().split(/\s+/).filter(Boolean);if(!words.length)throw new Error('Ajoutez le texte des sous-titres.');
 const lines:string[]=[];let line='';for(const word of words){if(word.length>60)throw new Error('Un mot est trop long.');if((line+' '+word).trim().length>60){lines.push(line);line=word;}else line=(line+' '+word).trim();}if(line)lines.push(line);
 if(lines.length>duration)throw new Error('Texte trop long : prévoyez au moins une seconde par sous-titre.');
 const slot=duration/lines.length;return lines.map((text,i)=>({start:Math.round((i*slot+.15)*1000)/1000,end:Math.round(((i+1)*slot-.15)*1000)/1000,text}));
}

export type FilmShot=NonNullable<Project['montage']>['shots'][number];
