import React from 'react';
import {interpolate,useCurrentFrame,useVideoConfig} from 'remotion';
import type {Project} from './project';
/** Short cue groups use the global audio clock. No word-by-word guesswork. */
export const ModernCaptions=({project,editorial=false,cinematic=false}:{project:Project;editorial?:boolean;cinematic?:boolean})=>{
 const frame=useCurrentFrame();const {fps}=useVideoConfig();const time=frame/fps-project.captionOffset;
 const cue=project.captions.find(c=>time>=c.start&&time<c.end);if(!cue)return null;
 const firstFrame=Math.ceil((cue.start+project.captionOffset)*fps);
 const a=project.captionAnimation,length=Math.max(1,Math.ceil((cue.end+project.captionOffset)*fps)-firstFrame),fadeIn=Math.min(a.fadeInFrames,Math.floor(length/2)),fadeOut=Math.min(a.fadeOutFrames,Math.floor(length/2));
 const opacity=a.mode==='none'?1:Math.min(fadeIn?interpolate(frame,[firstFrame,firstFrame+fadeIn],[.5,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'}):1,fadeOut?interpolate(frame,[firstFrame+length-fadeOut,firstFrame+length],[1,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'}):1);
 const rise=a.mode==='subtle'&&a.riseFrames?interpolate(frame,[firstFrame,firstFrame+Math.min(a.riseFrames,length)],[a.risePx,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'}):0;
 return <div data-testid="modern-caption" style={{position:'absolute',left:100,right:100,...(editorial?{top:1130}:{bottom:350}),fontFamily:'DemoSans',fontSize:editorial?72:cinematic?56:62,fontWeight:cinematic?500:600,lineHeight:1.24,color:'#f3f1e5',textAlign:editorial?'left':'center',textWrap:'balance',overflowWrap:'break-word',...(editorial?{}:{background:cinematic?'rgba(5,19,12,.72)':'rgba(9,27,22,.88)',padding:cinematic?'14px 22px':'20px 28px',borderRadius:12}),opacity,translate:`0px ${rise}px`}}>{cue.text}</div>;
};
