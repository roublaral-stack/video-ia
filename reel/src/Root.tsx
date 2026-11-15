import {Composition, continueRender, delayRender, staticFile} from 'remotion';
import {Reel} from './Reel';
const handle = delayRender('Load bundled font');
const font = new FontFace('DemoSans', `url(${staticFile('fonts/DejaVuSans.ttf')})`);
font.load().then(f=>{document.fonts.add(f);continueRender(handle);}).catch(e=>{throw e;});
export const Root = () => <Composition id="PlantesBulles" component={Reel} width={1080} height={1920} fps={30} durationInFrames={450} defaultProps={{brand:'Plantes & Bulles'}}/>;
