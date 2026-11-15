import path from 'node:path';
import {digest,json,readJson,intact} from './store.mjs';
export async function approvePreview(dir,previewSha,note,{reviewer='user'}={}){
 if(!note?.trim()||note.trim().length<12)throw new Error('Ajouter une note de validation créative explicite (au moins 12 caractères).');
 const actual=await digest(path.join(dir,'preview.mp4'));if(previewSha!==actual)throw new Error('Cet accord ne correspond pas à l’aperçu actuel. Revoir le nouveau rendu.');
 const technical=await readJson(path.join(dir,'preview-verification.json'));if(!technical.passed)throw new Error('L’aperçu n’a pas passé les contrôles techniques.');
 const review=await readJson(path.join(dir,'creative-review.json'));const projectSha=await digest(path.join(dir,'project.json'));
 if(review.previewSha!==actual||review.projectSha!==projectSha||!await intact(review.assets))throw new Error('Les sources ont changé depuis l’aperçu. Générer et revoir un nouvel aperçu.');
 const approval={version:1,previewSha:actual,projectSha,assets:review.assets,note:note.trim(),reviewer,approvedAt:new Date().toISOString(),scope:'explicit-creative-review-before-hd'};
 await json(path.join(dir,'approval.private.json'),approval);return approval;
}
export async function assertApproval(projectFile,approvalFile){
 if(!approvalFile)throw new Error('Export HD bloqué : valider le vrai aperçu avant de poursuivre.');
 const a=await readJson(approvalFile);const dir=path.dirname(projectFile);
 if(!a.note||a.projectSha!==await digest(projectFile)||a.previewSha!==await digest(path.join(dir,'preview.mp4'))||!await intact(a.assets))throw new Error('Validation périmée : projet, médias ou aperçu modifiés.');
 return a;
}
