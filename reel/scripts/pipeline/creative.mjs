import {access,stat,readFile} from 'node:fs/promises';
import path from 'node:path';
import {command,probe,root} from '../media.mjs';
export async function preflight(c){
 const files=[...c.media,...(c.brag.mode==='files'?c.brag.files:[])];const media=[];
 for(const [i,file] of files.entries()){
  try{await access(file);}catch{throw new Error(`Média réel manquant [${i}] : ${file}`);}
  const m=await probe(file);const v=m.streams.find(s=>s.codec_type==='video');if(!v)throw new Error(`Le média [${i}] n’est pas une photo ou vidéo.`);
  if(c.mode==='production'&&Math.max(v.width,v.height)<1280)throw new Error(`Média [${i}] trop petit (${v.width}×${v.height}) pour une production HD. Choisir un original de meilleure définition.`);
  media.push({index:i,width:v.width,height:v.height,duration:Number(m.format.duration)||null,source:file});
 }
 if(c.narration.engine==='files'){
  for(const k of ['audio','srt']){try{await access(c.narration[k]);}catch{throw new Error(`Ressource vocale manquante : narration.${k}. Aucun remplacement autorisé.`);}}
  const a=await probe(c.narration.audio);if(!a.streams.some(s=>s.codec_type==='audio'))throw new Error('Le fichier vocal ne contient pas de piste audio.');
  if(c.mode==='production'&&Math.abs(Number(a.format.duration)-c.duration)>1)throw new Error(`La voix dure ${a.format.duration} s pour un Reel de ${c.duration} s. Ajuster le script/enregistrement ; aucun silence ne sera ajouté pour remplir.`);
 }
 if(c.mode==='production'&&c.narration.engine==='chatterbox'){
  for(const k of ['referenceAudio','modelDirectory']){try{await access(c.narration[k]);}catch{throw new Error(`Chatterbox : ${k} inaccessible. Voix personnalisée non disponible.`);}}
  for(const name of ['ve.pt','s3gen.pt','t3_mtl23ls_v3.safetensors','grapheme_mtl_merged_expanded_v1.json']){try{await access(path.join(c.narration.modelDirectory,name));}catch{throw new Error(`Poids Chatterbox manquant : ${name}. Aucun téléchargement ni voix générique de remplacement.`);}}
  try{await command(c.narration.python,['-B','-c','import chatterbox, torch, torchaudio']);}catch{throw new Error('Runtime Chatterbox inaccessible ou incomplet. Fournir son interpréteur réel ; importer un WAV en attendant.');}
 }
 return {media,voice:c.narration.engine==='files'?'WAV réellement importé':c.narration.engine==='demo'?'Voix de démonstration explicite':'Runtime Chatterbox explicitement configuré',warnings:c.creative.limitations};
}
export function createCuts(c,project){
 if(c.creative.shots.length){const shots=c.creative.shots;let end=0;for(const s of shots){if(Math.abs(s.start-end)>.034||s.end<=s.start||s.end>c.duration||s.mediaIndex>=project.media.length)throw new Error('Storyboard invalide : plans contigus, médias existants, durée complète requise.');end=s.end;}if(Math.abs(end-c.duration)>.034)throw new Error('Le storyboard doit couvrir exactement le Reel.');return shots;}
 const starts=[0];for(const cue of project.captions){if(cue.start-starts.at(-1)>=1.6&&c.duration-cue.start>=1.2)starts.push(cue.start);}
 if(starts.length===1){for(let t=2.5;t<c.duration-1.2;t+=2.5)starts.push(t);}
 return starts.map((start,i)=>({start,end:starts[i+1]??c.duration,mediaIndex:i%Math.max(1,project.media.length),focusX:.5,focusY:.5,zoomFrom:1,zoomTo:1.035,transition:i===starts.length-1?'fade':'cut'}));
}
export function reviewBrief(c,project,resources){
 const words=project.captions.map(x=>x.text).join(' ').split(/\s+/).length;
 return {creativeStatus:'awaiting-human-review',technicalPassIsNotCreativeApproval:true,hook:c.creative.hook,intention:c.creative.intention,spokenScriptSource:'Le WAV importé reste inchangé ; aucune réécriture silencieuse de ses paroles.',words,wordsPerMinute:Math.round(words/c.duration*60),shots:project.montage.shots,credits:c.creative.credits,limitations:resources.warnings,checklist:['L’accroche donne-t-elle envie de regarder ?','Les images correspondent-elles réellement aux paroles ?','Les recadrages montrent-ils le bon détail ?','Les cuts restent-ils naturels avec cette voix ?','Les sous-titres sont-ils lisibles sur téléphone ?','Le timbre, les pauses et le niveau vocal sont-ils fidèles ?'],futureScriptGuide:{educatif:'Une observation concrète, son explication exacte, un geste ou un détail à retenir. Pas de promesse absente des images.',vlog:'Un moment réel, le détail observé, une conclusion personnelle. Conserver les respirations naturelles.',application:'Un besoin précis, une démonstration visible, une seule invitation utile. Brag reste facultatif.'}};
}
