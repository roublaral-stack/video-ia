import React from 'react';
import {AbsoluteFill,Img,OffthreadVideo,Sequence,interpolate,staticFile,useCurrentFrame,useVideoConfig} from 'remotion';
import {ModernCaptions} from './ModernCaptions';
import {Aquarium} from '../Reel';
import {buildTimeline,type Project,type FilmShot} from './project';
const ImageShot=({project,shot,frames,fadeFrames}:{project:Project;shot:FilmShot;frames:number;fadeFrames:number})=>{
 const f=useCurrentFrame();const media=project.media[shot.mediaIndex];
 if(!media){if(!project.allowIllustrations)throw new Error('Média réel manquant : aucune substitution générique en production.');return <Aquarium/>;}
 const style:React.CSSProperties={width:'100%',height:'100%',objectFit:'cover',objectPosition:`${shot.focusX*100}% ${shot.focusY*100}%`,scale:interpolate(f,[0,Math.max(1,frames-1)],[shot.zoomFrom,shot.zoomTo],{extrapolateRight:'clamp'})};
 return <AbsoluteFill style={{background:'#0d1c17',overflow:'hidden',opacity:fadeFrames?interpolate(f,[0,fadeFrames],[0,1],{extrapolateRight:'clamp'}):1}}>
  {media.type==='image'?<Img src={staticFile(media.src)} style={style}/>:<OffthreadVideo muted src={staticFile(media.src)} startFrom={Math.round(media.trimStart*30)} style={style}/>}
 </AbsoluteFill>;
};
export const Cinematic=({project}:{project:Project})=>{
 const f=useCurrentFrame();const {fps,durationInFrames}=useVideoConfig();
 const shots=project.montage?.shots??buildTimeline(project,fps).map((s,i)=>({start:s.from/fps,end:(s.from+s.duration)/fps,mediaIndex:i%Math.max(1,project.media.length),focusX:.5,focusY:.5,zoomFrom:1,zoomTo:1.035,transition:'cut' as const}));
 const hook=project.montage?.hook??project.subject;const endCard=f>=durationInFrames-1.3*fps;
 return <AbsoluteFill data-testid="cinematic-reel" style={{background:'#0c1c16',color:'#fff9ec',fontFamily:'DemoSans'}}>
  {shots.map((s,i)=>{const from=Math.round(s.start*fps);const frames=Math.round(s.end*fps)-from;const tail=shots[i+1]?.transition==='fade'?8:0;return <Sequence key={i} name={`Plan photographique ${i+1}`} from={from} durationInFrames={frames+tail}><ImageShot project={project} shot={s} frames={frames} fadeFrames={s.transition==='fade'&&i>0?8:0}/></Sequence>;})}
  <AbsoluteFill style={{background:'linear-gradient(180deg,rgba(4,17,12,.45),transparent 38%,transparent 60%,rgba(4,17,12,.55))'}}/>
  <div style={{position:'absolute',left:88,top:105,fontSize:29,fontWeight:500,opacity:endCard?0:1}}>Plantes <span style={{color:'#e1e4cd'}}>& Bulles</span></div>
  {f<2.4*fps&&<div data-testid="film-hook" style={{position:'absolute',left:86,right:100,top:315,fontFamily:'EditorialSerif',fontSize:88,lineHeight:1.06,whiteSpace:'pre-line',opacity:interpolate(f,[0,8,2.15*fps,2.4*fps],[0,1,1,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'}),translate:interpolate(f,[0,12],['0px 12px','0px 0px'],{extrapolateRight:'clamp'})}}>{hook}</div>}
  <ModernCaptions project={project} cinematic/>
  {project.productionMode==='demo'&&<div style={{position:'absolute',left:88,bottom:100,fontSize:23,background:'rgba(4,17,12,.8)',padding:'8px 12px'}}>DÉMONSTRATION · médias de test</div>}
  {endCard&&<div style={{position:'absolute',left:88,bottom:175,fontFamily:'EditorialSerif',fontSize:46,opacity:interpolate(f,[durationInFrames-1.3*fps,durationInFrames-fps],[0,1],{extrapolateRight:'clamp'})}}>Plantes & Bulles</div>}
 </AbsoluteFill>;
};
