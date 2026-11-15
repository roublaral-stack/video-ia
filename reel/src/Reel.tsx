import React from 'react';
import {AbsoluteFill, Interactive, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {TransitionSeries, linearTiming} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {TextReveal} from './components/snap-cn/text-reveal';

export const Aquarium = ({tropical = false}: {tropical?: boolean}) => {
  const frame = useCurrentFrame();
  return <svg viewBox="0 0 1080 1920" width="1080" height="1920" style={{position:'absolute',inset:0}}>
    <defs><linearGradient id="water" x2="0" y2="1"><stop stopColor={tropical?'#234e38':'#143e40'}/><stop offset="1" stopColor="#071f24"/></linearGradient><linearGradient id="leaf"><stop stopColor="#82b993"/><stop offset="1" stopColor="#245d43"/></linearGradient></defs>
    <rect width="1080" height="1920" fill="url(#water)"/>
    {[0,1,2,3,4].map(i=><path key={i} d={`M ${i*280-200} 0 L ${i*280+120} 0 L ${i*220+600} 1920 L ${i*220+440} 1920 Z`} fill="#b7d8a4" opacity=".035" transform={`translate(${Math.sin(frame/100)*30},0)`}/>)}
    <ellipse cx="540" cy="1900" rx="800" ry="230" fill="#34483a"/>
    {Array.from({length:13},(_,i)=><g key={i} transform={`translate(${i*96-40},${1840+(i%3)*35}) rotate(${(i%2?1:-1)*(10+Math.sin(frame/52+i)*3)}) scale(${.7+(i%4)*.16})`}>
      <path d="M0 20 Q-30 -340 5 -700" fill="none" stroke="#88a77a" strokeWidth="5"/>
      {[0,1,2,3,4].map(j=><g key={j} transform={`translate(0,${-120-j*120})`}><path d="M0 0 C-200 -12 -185 -170 -75 -160 C-5 -130 15 -50 0 0Z" fill="url(#leaf)"/><path d="M0 0 C200 -12 185 -170 75 -160 C5 -130 -15 -50 0 0Z" fill="url(#leaf)"/><path d="M-145 -115 L0 0 L145 -115" fill="none" stroke="#adc29a" strokeWidth="2" opacity=".5"/></g>)}
    </g>)}
    {!tropical && [0,1,2,3,4].map(i=><g key={i} transform={`translate(${((frame*1.25+i*236)%1500)-220},${930+(i%3)*145+Math.sin(frame/40+i)*15}) scale(${i%2?-.9:.9},.9)`}><path d="M-70 0 Q-10 -50 55 0 Q-10 50 -70 0 L-115 36 L-115 -36 Z" fill={i%2?'#d9c38d':'#a7c3b5'}/><circle cx="35" cy="-3" r="5" fill="#102b2e"/><path d="M-45 -3 L18 -3" stroke="#5e9290" strokeWidth="9"/></g>)}
    {Array.from({length:22},(_,i)=><circle key={i} cx={60+i*47+Math.sin(frame/50+i)*18} cy={1880-((frame*2.8+i*113)%1850)} r={4+(i%4)*3} stroke="#b6dacb" strokeWidth="2" fill="none" opacity=".28"/>)}
  </svg>;
};

const Scene = ({title, subtitle, number, tropical=false, closing=false}: {title:string;subtitle:string;number:string;tropical?:boolean;closing?:boolean}) => {
 const frame=useCurrentFrame(); const {fps}=useVideoConfig();
 return <AbsoluteFill style={{fontFamily:'DemoSans',color:'#f4f1df',overflow:'hidden'}}>
  <Aquarium tropical={tropical}/>
  <AbsoluteFill style={{background:'linear-gradient(180deg,rgba(5,24,24,.68),transparent 66%)'}}/>
  <Interactive.Div name="Marque" style={{position:'absolute',left:88,top:125,fontSize:30}}>Plantes & Bulles <span style={{color:'#bad29b'}}> / {number}</span></Interactive.Div>
  <Interactive.Div name="Titre" style={{position:'absolute',left:80,right:80,top:310,height:230}}><TextReveal text={title} fontSize={closing?68:76} initialScale={1.12} color="#f4f1df" letterSpacing="0" fontWeight={600}/></Interactive.Div>
  <Interactive.Div name="Sous-titre" style={{position:'absolute',top:600,left:100,right:100,textAlign:'center',fontSize:43,lineHeight:1.45,opacity:interpolate(frame,[.7*fps,1.4*fps],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'}),translate:interpolate(frame,[.7*fps,1.4*fps],['0px 24px','0px 0px'],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}}>{subtitle}</Interactive.Div>
  <Interactive.Div name="Invitation" style={{position:'absolute',left:100,bottom:300,fontSize:34,borderTop:'1px solid #a5b695',paddingTop:24,color:'#e0e8c9'}}>{closing?'Cultivons un peu de nature.':'Aquariums · Plantes tropicales'}</Interactive.Div>
  <div style={{position:'absolute',left:100,bottom:185,fontSize:25,color:'#c3d1c2'}}>Démo · Illustrations originales de substitution</div>
 </AbsoluteFill>;
};
export const Reel = ({brand}: {brand:string}) => <AbsoluteFill>
 <TransitionSeries>
  <TransitionSeries.Sequence name="Immersion" durationInFrames={160}><Scene title="Un monde vivant" subtitle="Une pause au rythme de l’eau." number="01"/></TransitionSeries.Sequence>
  <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames:15})}/>
  <TransitionSeries.Sequence name="Tropiques" durationInFrames={160}><Scene title="Le calme pousse" subtitle="Des feuilles, de la lumière, de la vie." number="02" tropical/></TransitionSeries.Sequence>
  <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames:15})}/>
  <TransitionSeries.Sequence name="Signature" durationInFrames={160}><Scene title={brand} subtitle="Un petit morceau de nature, chez soi." number="03" closing/></TransitionSeries.Sequence>
 </TransitionSeries>
</AbsoluteFill>;
