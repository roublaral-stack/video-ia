import React from 'react';
import {interpolate,useCurrentFrame,useVideoConfig} from 'remotion';
import type {Project} from './project';
/** Short cue groups use the global audio clock. No word-by-word guesswork. */
export const ModernCaptions=({project,editorial=false,cinematic=false}:{project:Project;editorial?:boolean;cinematic?:boolean})=>{
 const frame=useCurrentFrame();const {fps}=useVideoConfig();const time=frame/fps-project.captionOffset;
 const cue=project.captions.find(c=>time>=c.start&&time<c.end);if(!cue)return null;
 const firstFrame=Math.ceil((cue.start+project.captionOffset)*fps);
 return <div data-testid="modern-caption" style={{position:'absolute',left:100,right:100,...(editorial?{top:1130}:{bottom:350}),fontFamily:'DemoSans',fontSize:editorial?72:cinematic?56:62,fontWeight:cinematic?500:600,lineHeight:1.24,color:'#f3f1e5',textAlign:editorial?'left':'center',textWrap:'balance',overflowWrap:'break-word',...(editorial?{}:{background:cinematic?'rgba(5,19,12,.72)':'rgba(9,27,22,.88)',padding:cinematic?'14px 22px':'20px 28px',borderRadius:12}),opacity:interpolate(frame,[firstFrame,firstFrame+2],[.5,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'}),translate:interpolate(frame,[firstFrame,firstFrame+3],['0px 7px','0px 0px'],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}}>{cue.text}</div>;
};
