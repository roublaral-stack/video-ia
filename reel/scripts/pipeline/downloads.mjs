import {readFile,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {timingSafeEqual} from 'node:crypto';
import {runsRoot} from './run.mjs';
import {readJson} from './store.mjs';
export async function serveProduction(req,res,url){
 const page=/^\/production\/([a-f0-9]{24})$/.exec(url.pathname);
 const asset=/^\/api\/production\/([a-f0-9]{24})\/(final\.mp4|sources\.zip)$/.exec(url.pathname);
 if(req.method!=='GET'||(!page&&!asset))return false;
 try{
  const id=(page??asset)[1],dir=path.join(runsRoot,id),state=await readJson(path.join(dir,'state.json'));
  if(state.status!=='done'){res.writeHead(409,{'content-type':'text/plain; charset=utf-8'});res.end('Production non terminée. Relancer la commande de génération.');return true;}
  const download=await readJson(path.join(dir,'download.private.json'));
  if(page){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'"});res.end(`<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Production privée · VIDEO IA</title><style>body{font:20px system-ui;max-width:600px;margin:60px auto;padding:20px;background:#143c31;color:#f4f1df}a{display:block;color:#dcdfac;margin:30px 0}</style><h1>Votre Reel est prêt.</h1><p>Fichiers locaux privés, non publiés sur GitHub.</p><a href="${download.mp4}">Télécharger le MP4</a><a href="${download.zip}">Télécharger les sources ZIP privées</a><p>Ces liens appartiennent à cette machine cloud. Pour les récupérer sur iPhone, demander les pièces jointes à Codex ou ouvrir cette page via un accès cloud autorisé.</p></html>`);return true;}
  const token=url.searchParams.get('token')??'';const expected=download.token;
  if(Buffer.byteLength(token)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(token),Buffer.from(expected))){res.writeHead(403);res.end('Accès refusé.');return true;}
  const file=path.join(dir,asset[2]);const info=await stat(file);res.writeHead(200,{'content-type':asset[2].endsWith('.mp4')?'video/mp4':'application/zip','content-length':info.size,'content-disposition':`attachment; filename="plantes-bulles-${id}-${asset[2]}"`,'cache-control':'no-store','referrer-policy':'no-referrer'});createReadStream(file).on('error',()=>res.destroy()).pipe(res);return true;
 }catch{if(!res.headersSent)res.writeHead(404);res.end('Production introuvable.');return true;}
}
