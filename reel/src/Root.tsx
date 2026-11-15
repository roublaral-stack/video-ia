import {Composition, continueRender, delayRender, staticFile, type CalculateMetadataFunction} from 'remotion';
import {Reel} from './Reel';
import {Generator} from './generator/Generator';
import {exampleProject,projectSchema,type Project} from './generator/project';
const handle=delayRender('Load bundled font');
const font=new FontFace('DemoSans',`url(${staticFile('fonts/DejaVuSans.ttf')})`);
font.load().then(f=>{document.fonts.add(f);continueRender(handle);}).catch(e=>{throw e;});
const metadata:CalculateMetadataFunction<{project:Project}>=({props})=>{
 const project=projectSchema.parse(props.project);
 return {durationInFrames:project.duration*30,props:{project}};
};
export const Root=()=> <>
 <Composition id="PlantesBulles" component={Reel} width={1080} height={1920} fps={30} durationInFrames={450} defaultProps={{brand:'Plantes & Bulles'}}/>
 <Composition id="ReelGenerator" component={Generator} width={1080} height={1920} fps={30} durationInFrames={450} defaultProps={{project:exampleProject}} calculateMetadata={metadata}/>
</>;
