import {readFile} from 'node:fs/promises';

export const scriptWords=text=>text.trim().split(/\s+/u).filter(Boolean);
export const lexicalWords=text=>text.toLocaleLowerCase('fr').replaceAll('’',"'").match(/[\p{L}]+(?:'[\p{L}]+)*/gu)??[];
const canonical=text=>scriptWords(text).join(' ');

export function validateGroups(text,groups,{minWords=2,maxWords=5,maxChars=52}={}){
 if(!groups.length||groups.some(g=>scriptWords(g).length<minWords||scriptWords(g).length>maxWords||g.length>maxChars))throw new Error(`Découpage invalide : ${minWords} à ${maxWords} mots par groupe, ${maxChars} caractères maximum.`);
 if(canonical(groups.join(' '))!==canonical(text))throw new Error('Le découpage doit conserver exactement les mots, leur ordre et la ponctuation du script validé.');
 return groups;
}

export function groupScript(text,settings={},timedWords){
 const {minWords=2,maxWords=5,maxChars=52,groups=[]}=settings;
 if(groups.length)return validateGroups(text,groups,settings);
 const words=scriptWords(text),n=words.length,best=Array.from({length:n+1},()=>({cost:Infinity,groups:[]}));best[0]={cost:0,groups:[]};
 let cursor=0;const boundaries=timedWords?words.map(word=>{const count=lexicalWords(word).length,selected=timedWords.slice(cursor,cursor+count);cursor+=count;return {start:selected[0]?.start,end:selected.at(-1)?.end};}):null;
 for(let end=1;end<=n;end++)for(let start=Math.max(0,end-maxWords);start<=end-minWords;start++){
  const chunk=words.slice(start,end),line=chunk.join(' ');if(line.length>maxChars||!Number.isFinite(best[start].cost))continue;
  const duration=boundaries?boundaries[end-1].end-boundaries[start].start:null;
  const rushed=duration===null?0:Math.max(0,.75-duration)*20+Math.max(0,line.length/Math.max(duration,.01)-27)*.15;
  const dangling=/^(de|du|des|le|la|les|un|une|ce|cette|ces|à|au|aux|et|avec|pour|dans|sur)$/iu.test(chunk.at(-1))?1.1:0;
  const cost=best[start].cost+1+.3*(chunk.length-3.5)**2+dangling+rushed-(/[.,;:!?][»”"']?$/.test(chunk.at(-1))?.8:0)+chunk.slice(0,-1).filter(w=>/[.!?][»”"']?$/.test(w)).length;
  if(cost<best[end].cost)best[end]={cost,groups:[...best[start].groups,line]};
 }
 if(!best[n].groups.length)throw new Error('Impossible de découper ce script en groupes de 2 à 5 mots. Vérifier sa longueur et les réglages de découpage.');
 return validateGroups(text,best[n].groups,settings);
}

export async function configuredGroups(c,parseSrt,{words}={}){
 if(c.subtitles?.srt){const cues=parseSrt(await readFile(c.subtitles.srt,'utf8'));return validateGroups(c.script.text,cues.map(x=>x.text),c.subtitles);}
 return groupScript(c.script.text,c.subtitles,words);
}

export function provisionalCaptions(groups,duration){
 const lead=.15,tail=.15,gap=.06,budget=duration-lead-tail-gap*(groups.length-1);
 if(budget<groups.length*.6)throw new Error('Script trop dense pour cet aperçu : augmenter la durée ou raccourcir le script, sans supprimer des mots.');
 const weights=groups.map(g=>scriptWords(g).length+.07*g.length),total=weights.reduce((a,b)=>a+b,0);let cursor=lead;
 return groups.map((text,i)=>{const start=cursor;cursor+=budget*weights[i]/total;const cue={start:Math.round(start*1000)/1000,end:Math.round(cursor*1000)/1000,text};cursor+=gap;return cue;});
}

export function alignGroups(text,groups,words,duration){
 const expected=lexicalWords(text);if(JSON.stringify(expected)!==JSON.stringify(words.map(w=>w.text)))throw new Error('Les mots alignés ne correspondent pas au script. Vérifier le transcript et l’enregistrement.');
 let offset=0;const captions=groups.map(text=>{
  const count=lexicalWords(text).length;if(!count)throw new Error('Groupe sans mots prononçables pour l’aligneur. Écrire les nombres en toutes lettres.');
  const selected=words.slice(offset,offset+count);offset+=count;
  const start=selected[0]?.start,end=selected.at(-1)?.end;
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end>duration+.001)throw new Error('Horodatage acoustique invalide. Aucun timing provisoire ne sera utilisé à sa place.');
  return {text,start:Math.round(start*1000)/1000,end:Math.round(end*1000)/1000};
 });
 if(offset!==words.length)throw new Error('Mots alignés non affectés aux sous-titres.');
 offset=0;const phraseBoundaries=[];
 for(const surface of scriptWords(text)){
  offset+=lexicalWords(surface).length;
  if(/[,;.!?][»”"']?$/.test(surface)&&offset>0&&offset<words.length){
   const before=words[offset-1],after=words[offset];
   if(after.start>=before.end)phraseBoundaries.push(Math.round((before.end+after.start)*500)/1000);
  }
 }
 return {captions,phraseBoundaries};
}
