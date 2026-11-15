import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {loadConfig,schema} from './config.mjs';
import {identify} from './run.mjs';
import {digest,json} from './store.mjs';
import {root} from '../media.mjs';

/** A private derived version. The silent project's files and approval are preserved. */
export async function attachAudio(configFile,audioFile,{origin='provided-recording',dryRun=false}={}){
 const source=await loadConfig(configFile);
 if(source.mode!=='production'||!source.script?.validated)throw new Error('--audio exige une configuration Script First de production avec script validé.');
 const audio=path.resolve(audioFile);if(!['.wav','.mp3'].includes(path.extname(audio).toLowerCase()))throw new Error('Importer un WAV ou MP3 local exporté depuis ElevenLabs ou votre outil vocal.');
 const base=await identify(configFile),audioSha=await digest(audio);
 const config=schema.parse({...source,music:undefined,lineage:{scriptRunId:source.lineage?.scriptRunId??base.id,reason:'audio-import-requires-new-review'},narration:{...source.narration,engine:'files',audio,srt:undefined,origin,durationPolicy:'audio',alignment:{...source.narration.alignment,mode:'acoustic',model:source.narration.alignment.model??path.join(root,'.alignment/fr'),python:source.narration.alignment.python==='python3'?path.join(root,'.venv/bin/python'):source.narration.alignment.python}}});
 const stem=path.basename(configFile).replace(/(?:\.private|\.local)?\.json$/,'');
 const destination=path.join(path.dirname(path.resolve(configFile)),`${stem}.audio-${audioSha.slice(0,10)}-${base.id.slice(0,8)}.private.json`);
 if(!dryRun){
  const bytes=JSON.stringify(config,null,2)+'\n';
  try{const existing=await readFile(destination,'utf8');if(existing!==bytes)throw new Error('La configuration audio dérivée a été modifiée. La reprendre directement ; aucun écrasement automatique.');}
  catch(e){if(e.code!=='ENOENT')throw e;await json(destination,config);}
 }
 return {configFile:destination,config,scriptRunId:config.lineage.scriptRunId,previewMusicRemoved:Boolean(source.music),newCreativeApprovalRequired:true};
}
