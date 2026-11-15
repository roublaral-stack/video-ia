import {access,stat,readFile} from 'node:fs/promises';
import path from 'node:path';
import {command,probe,root} from '../media.mjs';
export async function preflight(c){
 const files=[...c.media,...(c.brag.mode==='files'?c.brag.files:[])];const media=[],warnings=[...c.creative.limitations];let effectiveDuration=c.duration,audioDuration=null;
 for(const [i,file] of files.entries()){
  try{await access(file);}catch{throw new Error(`Média réel manquant [${i}] : ${file}`);}
  const m=await probe(file);const v=m.streams.find(s=>s.codec_type==='video');if(!v)throw new Error(`Le média [${i}] n’est pas une photo ou vidéo.`);
  if(c.mode==='production'&&Math.max(v.width,v.height)<1280)throw new Error(`Média [${i}] trop petit (${v.width}×${v.height}) pour une production HD. Choisir un original de meilleure définition.`);
  media.push({index:i,width:v.width,height:v.height,duration:Number(m.format.duration)||null,source:file});
 }
 if(c.narration.engine==='files'){
  for(const k of ['audio',...(c.narration.srt?['srt']:[])]){try{await access(c.narration[k]);}catch{throw new Error(`Ressource vocale manquante : narration.${k}. Aucun remplacement autorisé.`);}}
  const a=await probe(c.narration.audio);if(!a.streams.some(s=>s.codec_type==='audio'))throw new Error('Le fichier vocal ne contient pas de piste audio.');
  audioDuration=Number(a.format.duration);
  if(c.narration.durationPolicy==='audio'){
   if(!Number.isFinite(audioDuration)||audioDuration<5||audioDuration>600)throw new Error('Audio importé : durée attendue entre 5 secondes et 10 minutes. Aucun remplissage ni découpage automatique.');
   effectiveDuration=Math.ceil(audioDuration*30-.000001)/30;
   warnings.push(`Durée adaptée à l’audio : ${c.duration} s demandées → ${effectiveDuration.toFixed(3)} s. La voix reste entière ; les coupes sont à revoir.`);
  }else if(c.mode==='production'&&Math.abs(audioDuration-c.duration)>1)throw new Error(`La voix dure ${a.format.duration} s pour un Reel de ${c.duration} s. Ajuster le script/enregistrement ; aucun silence ne sera ajouté pour remplir.`);
  if(c.narration.alignment.mode==='acoustic'){
   try{await access(path.join(c.narration.alignment.model,'dictionary.dict'));await access(path.join(c.narration.alignment.model,'acoustic_model'));await command(c.narration.alignment.python,['-B','-c','import pocketsphinx, numpy']);}
   catch{throw new Error('Alignement acoustique local indisponible. Exécuter npm run setup:alignment ou renseigner narration.alignment.model/python. Aucun timing provisoire ne remplacera l’alignement vocal.');}
  }
 }
 if(c.narration.engine==='none')warnings.push('Sous-titres PROVISOIRES calculés depuis le script. Aucune voix, aucune synchronisation vocale ; validation du montage uniquement.');
 if(c.music){try{await access(c.music.audio);}catch{throw new Error('Musique d’aperçu manquante. Retirer music pour un aperçu silencieux.');}const m=await probe(c.music.audio);if(!m.streams.some(s=>s.codec_type==='audio'))throw new Error('La musique d’aperçu ne contient pas de piste audio.');}
 if(c.mode==='production'&&c.narration.engine==='chatterbox'){
  for(const k of ['referenceAudio','modelDirectory']){try{await access(c.narration[k]);}catch{throw new Error(`Chatterbox : ${k} inaccessible. Voix personnalisée non disponible.`);}}
  for(const name of ['ve.pt','s3gen.pt','t3_mtl23ls_v3.safetensors','grapheme_mtl_merged_expanded_v1.json']){try{await access(path.join(c.narration.modelDirectory,name));}catch{throw new Error(`Poids Chatterbox manquant : ${name}. Aucun téléchargement ni voix générique de remplacement.`);}}
  try{await command(c.narration.python,['-B','-c','import chatterbox, torch, torchaudio']);}catch{throw new Error('Runtime Chatterbox inaccessible ou incomplet. Fournir son interpréteur réel ; importer un WAV en attendant.');}
 }
 return {media,effectiveDuration,audioDuration,voice:c.narration.engine==='none'?'Aucune voix — script seul':c.narration.engine==='files'?'Audio réellement importé':c.narration.engine==='demo'?'Voix de démonstration explicite':'Runtime Chatterbox explicitement configuré',warnings};
}
export function createCuts(c,project){
 const retimed=Boolean(c.script&&c.narration.engine==='files'&&c.narration.durationPolicy==='audio'&&c.narration.retimeShots);
 if(c.creative.shots.length&&!retimed){const shots=c.creative.shots;let end=0;for(const s of shots){if(Math.abs(s.start-end)>.034||s.end<=s.start||s.end>c.duration||s.mediaIndex>=project.media.length)throw new Error('Storyboard invalide : plans contigus, médias existants, durée complète requise.');end=s.end;}if(Math.abs(end-c.duration)>.034)throw new Error('Le storyboard doit couvrir exactement le Reel.');return shots;}
 const starts=[0],candidates=retimed?project.phraseBoundaries:project.captions.map(cue=>cue.start);
 for(const at of candidates??[]){if(starts.length<30&&at-starts.at(-1)>=1.6&&c.duration-at>=1.2)starts.push(at);}
 if(starts.length===1&&!retimed){for(let t=2.5;t<c.duration-1.2&&starts.length<30;t+=2.5)starts.push(t);}
 return starts.map((start,i)=>{const custom=retimed?c.creative.shots[i%c.creative.shots.length]:undefined;return {start,end:starts[i+1]??c.duration,mediaIndex:custom?.mediaIndex??i%Math.max(1,project.media.length),focusX:custom?.focusX??.5,focusY:custom?.focusY??.5,zoomFrom:custom?.zoomFrom??1,zoomTo:custom?.zoomTo??1.035,transition:custom?.transition??(i===starts.length-1?'fade':'cut')};});
}
export function reviewBrief(c,project,resources){
 const words=project.captions.map(x=>x.text).join(' ').split(/\s+/).length;
 return {creativeStatus:'awaiting-human-review',technicalPassIsNotCreativeApproval:true,stage:project.captionTiming==='provisional'?'script-first':'voiced',captionTiming:project.captionTiming,requestedDuration:c.requestedDuration??c.duration,duration:c.duration,requiresNewReviewAfterAudioImport:true,hook:c.creative.hook,intention:c.creative.intention,spokenScriptSource:c.narration.engine==='none'?'Script validé ; aucune voix générée.':c.narration.engine==='files'?'Audio importé intact ; timings recalés sur le signal réel.':'Parcours de narration historique explicitement configuré.',words,wordsPerMinute:Math.round(words/c.duration*60),shots:project.montage.shots,credits:c.creative.credits,limitations:resources.warnings,checklist:['L’accroche donne-t-elle envie de regarder ?','Les images correspondent-elles réellement au script ?','Les recadrages montrent-ils le bon détail ?','Le rythme du montage est-il satisfaisant ?','Les sous-titres sont-ils lisibles sur téléphone ?',...(c.narration.engine==='none'?['Les timings restent provisoires jusqu’à l’import de la voix.']:['Le timbre, les pauses et le niveau vocal sont-ils fidèles ?'])],futureScriptGuide:{educatif:'Une observation concrète, son explication exacte, un geste ou un détail à retenir. Pas de promesse absente des images.',vlog:'Un moment réel, le détail observé, une conclusion personnelle. Conserver les respirations naturelles.',application:'Un besoin précis, une démonstration visible, une seule invitation utile. Brag reste facultatif.'}};
}
