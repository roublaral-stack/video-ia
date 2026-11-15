import path from 'node:path';
import {digest,json,readJson,intact} from './store.mjs';
const assetsIntact=async assets=>Array.isArray(assets)&&(assets.length===0||await intact(assets));
export async function approvePreview(dir,previewSha,note,{reviewer='user'}={}){
 if(!note?.trim()||note.trim().length<12)throw new Error('Ajouter une note de validation créative explicite (au moins 12 caractères).');
 const actual=await digest(path.join(dir,'preview.mp4'));if(previewSha!==actual)throw new Error('Cet accord ne correspond pas à l’aperçu actuel. Revoir le nouveau rendu.');
 const technical=await readJson(path.join(dir,'preview-verification.json'));if(!technical.passed)throw new Error('L’aperçu n’a pas passé les contrôles techniques.');
 const review=await readJson(path.join(dir,'creative-review.json'));const projectSha=await digest(path.join(dir,'project.json'));
 if(review.previewSha!==actual||review.projectSha!==projectSha||!await assetsIntact(review.assets))throw new Error('Les sources ont changé depuis l’aperçu. Générer et revoir un nouvel aperçu.');
 const project=await readJson(path.join(dir,'project.json'));
 const approval={version:1,previewSha:actual,projectSha,assets:review.assets,note:note.trim(),reviewer,approvedAt:new Date().toISOString(),scope:project.captionTiming==='provisional'?'montage-only-provisional':'explicit-creative-review-before-hd'};
 await json(path.join(dir,'approval.private.json'),approval);return approval;
}
export async function assertApproval(projectFile,approvalFile,{allowProvisional=false}={}){
 if(!approvalFile)throw new Error('Export HD bloqué : valider le vrai aperçu avant de poursuivre.');
 const a=await readJson(approvalFile);const dir=path.dirname(projectFile);
 if(!a.note||a.projectSha!==await digest(projectFile)||a.previewSha!==await digest(path.join(dir,'preview.mp4'))||!await assetsIntact(a.assets))throw new Error('Validation périmée : projet, médias ou aperçu modifiés.');
 const project=await readJson(projectFile),provisional=project.captionTiming==='provisional';
 if(a.scope!==(provisional?'montage-only-provisional':'explicit-creative-review-before-hd'))throw new Error('Validation périmée : portée de l’accord incompatible avec cette version.');
 if(provisional&&!allowProvisional)throw new Error('HD de finalisation bloquée : accord sur le montage sans voix uniquement. Importer la voix et valider son nouvel aperçu.');
 return a;
}
