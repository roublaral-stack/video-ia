import React from 'react';
import {AbsoluteFill,Easing,interpolate,useCurrentFrame,useVideoConfig} from 'remotion';
import type {Project} from './project';
import {ModernCaptions} from './ModernCaptions';
/** A typographic waiting format: no animal, plant or stock illustration. */
export const Editorial=({project}:{project:Project})=>{
 const frame=useCurrentFrame();const {durationInFrames}=useVideoConfig();
 return <AbsoluteFill data-testid="editorial-reel" style={{background:'#102720',color:'#f3f1e5',fontFamily:'DemoSans'}}>
  <div style={{position:'absolute',left:100,top:145,fontSize:32}}>Plantes <span style={{color:'#adbea4'}}>& Bulles</span></div>
  <div style={{position:'absolute',right:100,top:155,fontSize:22,color:'#adbea4'}}>Journal de nature</div>
  <div style={{position:'absolute',left:100,right:100,top:355,fontSize:26,color:'#adbea4',opacity:interpolate(frame,[0,15],[0,1],{extrapolateRight:'clamp'})}}>Une passion, simplement.</div>
  <div style={{position:'absolute',left:90,right:90,top:435,fontFamily:'EditorialSerif',fontSize:project.subject.length<35?118:86,lineHeight:1.12,whiteSpace:'pre-line',opacity:interpolate(frame,[0,20],[0,1],{extrapolateRight:'clamp'}),translate:interpolate(frame,[0,24],['0px 20px','0px 0px'],{extrapolateRight:'clamp',easing:Easing.out(Easing.cubic)})}}>{project.subject}</div>
  <div style={{position:'absolute',left:100,top:995,width:84,height:2,background:'#adbea4'}}/>
  <div style={{position:'absolute',left:100,top:1035,fontSize:24,color:'#adbea4'}}>{project.productionMode==='demo'?'Voix de démonstration':project.audio?.preserveSource?'Voix importée':'Narration'}</div>
  <ModernCaptions project={project} editorial/>
  <div style={{position:'absolute',left:100,bottom:180,fontSize:23,color:'#adbea4'}}>Plantes · Aquariums · Nature</div>
  <div style={{position:'absolute',left:100,right:100,bottom:130,height:1,background:'#395044'}}><div style={{width:`${100*Math.min(1,frame/(durationInFrames-1))}%`,height:1,background:'#adbea4'}}/></div>
 </AbsoluteFill>;
};
