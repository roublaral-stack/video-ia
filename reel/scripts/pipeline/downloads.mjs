import {readFile,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {timingSafeEqual} from 'node:crypto';
import {runsRoot} from './run.mjs';
import {readJson} from './store.mjs';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function serveProduction(req,res,url){
 const page=/^\/production\/([a-f0-9]{24})$/.exec(url.pathname);
 const asset=/^\/api\/production\/([a-f0-9]{24})\/(preview\.mp4|final\.mp4|sources\.zip|preview-sources\.zip|captions\.(?:provisional\.|aligned\.|reviewed\.)?srt|preview-frames\/frame-\d+\.jpg)$/.exec(url.pathname);
 const approve=/^\/api\/production\/([a-f0-9]{24})\/approve$/.exec(url.pathname);
 if(!((req.method==='GET'&&(page||asset))||(req.method==='POST'&&approve)))return false;
 try{
  const id=(page??asset??approve)[1],dir=path.join(runsRoot,id),state=await readJson(path.join(dir,'state.json'));const download=await readJson(path.join(dir,'download.private.json'));
  const token=url.searchParams.get('token')??'',expected=download.token;
  if(!page&&(Buffer.byteLength(token)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(token),Buffer.from(expected)))){res.writeHead(403);res.end('Accès refusé.');return true;}
  if(approve){
   let size=0,body='';for await(const b of req){size+=b.length;if(size>10000)throw Error('Avis trop long');body+=b;}
   const input=JSON.parse(body);const {approvePreview}=await import('./review.mjs');await approvePreview(dir,input.previewSha,input.note);
   const {runProduction}=await import('../production.mjs');runProduction(state.configPath,{log:()=>{}}).catch(()=>{});
   res.writeHead(202,{'content-type':'application/json'});res.end(JSON.stringify({status:state.stage==='script-first'?'montage_review_requested':'export_requested'}));return true;
  }
  if(page){
   const pending=state.status!=='done';let review;
   try{review=await readJson(path.join(dir,'creative-review.json'));}catch{}
   const video=download.preview??download.mp4;
   const provisional=review?.captionTiming==='provisional';
   const notice=provisional?'SOUS-TITRES PROVISOIRES — script seul, sans voix. L’accord valide uniquement le montage ; l’import audio exigera un nouvel aperçu et un nouvel accord avant la HD.':'Sous-titres à vérifier sur la voix réelle avant l’export HD.';
   const images=(review?.frames??[]).map(f=>`<img loading="lazy" alt="Image extraite de l’aperçu" src="/api/production/${id}/${escape(f)}?token=${expected}">`).join('');
   const approval=state.status==='awaiting_review'?`<form id="review"><label><input type="checkbox" required> ${provisional?'J’ai regardé le montage sans voix et compris le caractère provisoire des sous-titres.':'J’ai regardé l’aperçu et écouté sa piste.'}</label><p>Qu’est-ce qui fonctionne ? Quelles limites acceptez-vous ?</p><textarea id="note" required minlength="12" placeholder="Mon avis après visionnage…"></textarea><button>${provisional?'Valider ce montage sans voix':'Valider cet aperçu et exporter en HD'}</button></form><script>document.getElementById('review').onsubmit=async e=>{e.preventDefault();const r=await fetch('/api/production/${id}/approve?token=${expected}',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({previewSha:'${review?.previewSha??''}',note:document.getElementById('note').value})});document.getElementById('status').textContent=r.ok?'${provisional?'Validation du montage demandée ; aucune HD lancée.':'Export HD demandé.'} Actualiser cette page dans quelques instants.':'Validation refusée : vérifier le rendu et la note.';};</script>`:'';
   res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','content-security-policy':"default-src 'self'; img-src 'self'; media-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'"});
   res.end(`<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Revue créative · Plantes & Bulles</title><style>body{font:17px system-ui;max-width:850px;margin:40px auto;padding:20px;background:#102720;color:#f3f1e5}video{display:block;max-width:100%;width:360px;margin:auto}a{color:#d6dfbb;display:inline-block;margin:16px 18px 16px 0}.frames{display:flex;gap:8px;overflow:auto}.frames img{width:140px;height:249px;object-fit:cover}textarea{width:95%;min-height:100px;font:inherit;padding:12px}button{padding:14px;font:inherit;margin-top:15px;background:#d6dfbb;color:#143a26;border:0;border-radius:8px}li,p{line-height:1.6}</style><h1>${pending?'Aperçu à évaluer':'Reel validé et exporté'}</h1><p>${pending?'La réussite technique ne valide pas la création. L’export HD attend votre accord.':'L’export HD correspond à l’aperçu approuvé.'} Fichiers privés locaux.</p><p>${escape(notice)}</p><video controls playsinline preload="metadata" src="${video}"></video><a href="${video}">Télécharger l’aperçu</a>${!pending&&download.mp4?`<a href="${download.mp4}">Télécharger le MP4 HD</a><a href="${download.zip}">Sources privées ZIP</a>`:''}${download.srt?`<a href="${download.srt}">SRT ${provisional?"provisoire":"aligné / vérifié"}</a>`:""}${download.draftZip?`<a href="${download.draftZip}">ZIP privé rééditable de l’aperçu</a>`:""}<h2>Images du vrai rendu</h2><div class="frames">${images}</div><h2>Intention</h2><p>${escape(review?.intention??'')}</p><h2>Limites à évaluer</h2><ul>${(review?.limitations??[]).map(x=>`<li>${escape(x)}</li>`).join('')}</ul><ul>${(review?.checklist??[]).map(x=>`<li>${escape(x)}</li>`).join('')}</ul>${approval}<p id="status">État : ${escape(state.status)}</p><p>Cette page appartient à la machine cloud. Sur iPhone, demander les fichiers privés à Codex ou utiliser un accès cloud autorisé ; localhost n’est pas une adresse Internet.</p></html>`);return true;
  }
  const file=asset[2];
  if((file==='final.mp4'||file==='sources.zip')&&state.status!=='done'){res.writeHead(409);res.end('HD bloqué avant validation créative.');return true;}
  const location=path.join(dir,file);const info=await stat(location);const mime=file.endsWith('.mp4')?'video/mp4':file.endsWith('.jpg')?'image/jpeg':file.endsWith('.srt')?'application/x-subrip; charset=utf-8':'application/zip';
  const headers={'content-type':mime,'content-length':info.size,'content-disposition':`${file.endsWith('.jpg')?'inline':'attachment'}; filename="plantes-bulles-${path.basename(file)}"`,'cache-control':'no-store','referrer-policy':'no-referrer','accept-ranges':'bytes'};
  if(req.headers.range){
   const range=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);let start,end;
   if(range){start=range[1]?Number(range[1]):Math.max(0,info.size-Number(range[2]));end=range[1]&&range[2]?Math.min(Number(range[2]),info.size-1):info.size-1;}
   if(!range||(!range[1]&&!range[2])||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||start>=info.size){res.writeHead(416,{'content-range':`bytes */${info.size}`});res.end();return true;}
   res.writeHead(206,{...headers,'content-range':`bytes ${start}-${end}/${info.size}`,'content-length':end-start+1});createReadStream(location,{start,end}).on('error',()=>res.destroy()).pipe(res);return true;
  }
  res.writeHead(200,headers);createReadStream(location).on('error',()=>res.destroy()).pipe(res);return true;
 }catch(e){if(!res.headersSent)res.writeHead(400,{'content-type':'text/plain; charset=utf-8'});res.end(e.message);return true;}
}
