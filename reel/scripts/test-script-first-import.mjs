/** Opt-in integration check using a private, already-produced recording. No TTS. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {stat} from 'node:fs/promises';
import {runProduction} from './production.mjs';
import {digest,json,readJson} from './pipeline/store.mjs';

const [configFile,audioFile]=process.argv.slice(2);
if(!configFile||!audioFile)throw new Error('Usage : npm run test:script-first:import -- config.private.json voix.wav|mp3. Les deux fichiers doivent rester privés.');
process.umask(0o077);
const inputSha=await digest(path.resolve(audioFile));
const silent=await runProduction(path.resolve(configFile));
assert.equal(silent.stage,'script-first');assert.equal(silent.captionTiming,'provisional');
const preparation=await readJson(path.join(path.dirname(silent.preview),'preview-verification.json'));
assert.equal(preparation.voicePresent,false);assert.equal(preparation.subtitlesSynchronized,false);
const voiced=await runProduction(path.resolve(configFile),{audioFile:path.resolve(audioFile),origin:'provided-recording'});
assert.equal(voiced.stage,'voiced');assert.equal(voiced.status,'awaiting_review');assert.equal(voiced.captionTiming,'aligned');assert.notEqual(voiced.id,silent.id);
const voicedDir=path.dirname(voiced.preview),verification=await readJson(path.join(voicedDir,'preview-verification.json'));
assert.equal(verification.voicePresent,true);assert.equal(verification.subtitlesSynchronized,true);assert(verification.sourceIntegrity.passed);assert.equal(verification.sourceIntegrity.originalSha256,inputSha);
await assert.rejects(()=>stat(path.join(voicedDir,'approval.private.json')),{code:'ENOENT'});
await assert.rejects(()=>stat(path.join(voicedDir,'final.mp4')),{code:'ENOENT'});
// An old silent preview's hash must never authorize this voiced version.
await assert.rejects(()=>runProduction(voiced.audioConfig,{approve:silent.previewSha,reviewNote:'Invalidation test: old preview must be rejected.',log:()=>{}}),/ne correspond/);
const stamp=(await stat(voiced.preview)).mtimeMs;await runProduction(voiced.audioConfig,{log:()=>{}});assert.equal((await stat(voiced.preview)).mtimeMs,stamp);
assert.equal(await digest(path.resolve(audioFile)),inputSha);
const project=await readJson(path.join(voicedDir,'project.json'));
const report={passed:true,noSpeechSynthesis:true,silent:{id:silent.id,duration:preparation.duration,voicePresent:false,captionTiming:'provisional'},voiced:{id:voiced.id,requestedDuration:project.requestedDuration,duration:verification.duration,captionTiming:'aligned',captionCount:verification.captionCount,sourceIntegrity:verification.sourceIntegrity},oldApprovalRejected:true,personalHdExported:false,needsHumanReview:true};
await json(path.join(path.dirname(path.resolve(configFile)),'script-first-import-report.private.json'),report);
console.log(JSON.stringify({passed:true,silentPreview:silent.preview,voicedPreview:voiced.preview,voicedConfig:voiced.audioConfig,report:path.join(path.dirname(path.resolve(configFile)),'script-first-import-report.private.json'),needsHumanReview:true},null,2));
