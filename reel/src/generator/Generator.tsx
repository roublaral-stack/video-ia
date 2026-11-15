import React from 'react';
import {AbsoluteFill, Img, Loop, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Cinematic} from './Cinematic';
import {Editorial} from './Editorial';
import {ModernCaptions} from './ModernCaptions';
import {Audio} from '@remotion/media';
import {TransitionSeries,linearTiming} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {TextReveal} from '../components/snap-cn/text-reveal';
import {Aquarium} from '../Reel';
import {buildTimeline,templates,titleVisibility,type Project,type Shot} from './project';

const ShotView=({shot,project}:{shot:Shot;project:Project})=>{
 const frame=useCurrentFrame();const {fps}=useVideoConfig();const m=shot.media;const visible=titleVisibility(frame,shot.duration,12);
 return <AbsoluteFill style={{backgroundColor:'#102d29',fontFamily:'DemoSans',color:'#f4f1df',overflow:'hidden'}}>
  {m?.type==='image'?<Img src={staticFile(m.src)} style={{width:'100%',height:'100%',objectFit:m.fit,scale:interpolate(frame,[0,shot.duration],[1,1.05])}}/>:m?.type==='video'?<Loop durationInFrames={Math.max(1,Math.floor(((m.durationSeconds??1)-m.trimStart)*fps))}><OffthreadVideo muted src={staticFile(m.src)} startFrom={Math.round(m.trimStart*fps)} style={{width:'100%',height:'100%',objectFit:m.fit}}/></Loop>:<Aquarium tropical={shot.index%2===1}/>}
  <AbsoluteFill style={{background:'linear-gradient(180deg,rgba(4,22,22,.85),rgba(4,22,22,.05) 60%,rgba(4,22,22,.8))'}}/>
  <div style={{position:'absolute',left:90,top:130,fontSize:30}}>Plantes & Bulles · {templates[project.template].name}</div>
  <div data-testid="generator-title" style={{position:'absolute',left:90,right:90,top:310,fontSize:shot.title.length>40?64:84,lineHeight:1.15,overflowWrap:'anywhere',opacity:visible,translate:`0px ${interpolate(visible,[0,1],[28,0])}px`}}>{project.titleAnimation==='snapcn'?<div style={{position:'relative',height:200}}><TextReveal text={shot.title} fontSize={Math.min(76,1400/shot.title.length)} initialScale={1.04} color="#f4f1df" letterSpacing="0"/></div>:shot.title}</div>
  {project.template==='application'&&<div style={{position:'absolute',left:90,top:790,border:'1px solid #b7c6a3',borderRadius:24,padding:'18px 30px',fontSize:30,opacity:visible}}>Présentation · {m?'Capture personnelle':'Maquette illustrative'}</div>}
  <div style={{position:'absolute',left:90,right:90,bottom:185,fontSize:24}}>{m?(m.label||'Média personnel importé'):'Démo · Illustrations originales de substitution'}</div>
 </AbsoluteFill>;
};
const Captions=({project}:{project:Project})=>{
 const f=useCurrentFrame();const {fps}=useVideoConfig();const time=f/fps-project.captionOffset;
 if(project.captionStyle==='editorial')return <ModernCaptions project={project}/>;
 const cue=project.captions.find(c=>time>=c.start&&time<c.end);
 return cue?<div data-testid="caption" style={{position:'absolute',left:90,right:90,bottom:320,textAlign:'center',fontSize:46,lineHeight:1.25,color:'#fffcec',fontFamily:'DemoSans',background:'rgba(5,24,22,.85)',borderRadius:18,padding:'20px 28px',overflowWrap:'anywhere'}}>{cue.text}</div>:null;
};
const Soundtrack=({project}:{project:Project})=>{
 const {fps,durationInFrames}=useVideoConfig();const a=project.audio;if(!a)return null;
 if(a.preserveSource)return <Sequence name="Voix originale protégée" from={0} durationInFrames={durationInFrames}><Audio src={staticFile(a.src)} volume={1} durationInFrames={durationInFrames}/></Sequence>;
 const length=Math.max(1,Math.floor((a.durationSeconds-a.trimStart)*fps));
 const sound=<Audio src={staticFile(a.src)} trimBefore={Math.round(a.trimStart*fps)} durationInFrames={length} volume={f=>a.volume*Math.min(1,f/12,Math.max(0,(durationInFrames-Math.round(a.from*fps)-f)/18))}/>;
 return <Sequence name="Piste audio" from={Math.round(a.from*fps)} durationInFrames={durationInFrames-Math.round(a.from*fps)}>{a.loop?<Loop durationInFrames={length}>{sound}</Loop>:sound}</Sequence>;
};
export const Generator=({project}:{project:Project})=>{
 const {fps}=useVideoConfig();const shots=buildTimeline(project,fps);
 if(project.productionMode==='production'&&!project.media.length&&project.visualStyle!=='typography'&&!project.allowIllustrations)throw new Error('Médias réels manquants, production bloquée.');
 if(project.visualStyle==='cinematic')return <AbsoluteFill><Cinematic project={project}/><Soundtrack project={project}/></AbsoluteFill>;
 if(project.visualStyle==='typography')return <AbsoluteFill><Editorial project={project}/><Soundtrack project={project}/></AbsoluteFill>;
 return <AbsoluteFill>
  <TransitionSeries>{shots.flatMap(shot=>[
   ...(shot.overlap?[<TransitionSeries.Transition key={`t${shot.index}`} presentation={fade()} timing={linearTiming({durationInFrames:shot.overlap})}/>]:[]),
   <TransitionSeries.Sequence key={shot.index} name={`Plan ${shot.index+1}`} durationInFrames={shot.duration}><ShotView shot={shot} project={project}/></TransitionSeries.Sequence>,
  ])}</TransitionSeries>
  <Captions project={project}/><Soundtrack project={project}/>
 </AbsoluteFill>;
};
