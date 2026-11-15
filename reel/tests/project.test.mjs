import {test} from 'node:test';
import assert from 'node:assert/strict';
import {projectSchema,buildTimeline,exampleProject,titleVisibility,parseSrt,makeCaptions} from '../src/generator/project.ts';
for(const template of ['educatif','vlog','application'])for(const duration of [15,30,60])test(`${template} ${duration}s: exact timeline and cuts`,()=>{
 const project=projectSchema.parse({...exampleProject,template,duration,titles:[]});const shots=buildTimeline(project);
 assert.equal(shots[0].from,0);assert.equal(shots.at(-1).from+shots.at(-1).duration,duration*30);
 assert(shots.every(s=>s.duration>=45));assert(shots.some(s=>s.overlap===12));assert(shots.slice(1).some(s=>s.overlap===0));
 for(let i=1;i<shots.length;i++)assert.equal(shots[i].from,shots[i-1].from+shots[i-1].duration-shots[i].overlap);
});
test('every imported media is used in order',()=>{const media=Array.from({length:5},(_,i)=>({src:`uploads/photo-${i}.jpg`,type:'image'}));const p=projectSchema.parse({...exampleProject,media});assert.deepEqual(buildTimeline(p).slice(0,5).map(s=>s.media.src),media.map(m=>m.src));});
test('titles never coexist across the old 10-second dissolve',()=>{for(let f=290;f<305;f++)assert(!(titleVisibility(f-145,160)>0&&titleVisibility(f-290,160)>0));});
test('generated title guards do not collide',()=>{const shots=buildTimeline(exampleProject);for(let f=0;f<450;f++){assert(shots.filter(s=>f>=s.from&&f<s.from+s.duration&&titleVisibility(f-s.from,s.duration,12)>0).length<=1);}});
test('SRT accepts CRLF and ms, preserves accented text',()=>{assert.deepEqual(parseSrt('1\r\n00:00:01,250 --> 00:00:03,500\r\nUne <b>plante</b> tropicale.\r\n'),[{start:1.25,end:3.5,text:'Une plante tropicale.'}]);assert.throws(()=>parseSrt('broken'));});
test('rejects captions outside timeline, overlapping or inverted',()=>{for(const captions of [[{start:3,end:2,text:'x'}],[{start:0,end:5,text:'x'},{start:4,end:6,text:'y'}],[{start:14,end:16,text:'x'}]])assert.throws(()=>projectSchema.parse({...exampleProject,captions}));assert.throws(()=>projectSchema.parse({...exampleProject,captionOffset:-3}));});
test('rejects invalid duration, remote/path assets and invalid trim',()=>{assert.throws(()=>projectSchema.parse({...exampleProject,duration:20}));for(const src of ['https://evil.test/v.mp4','uploads/../../secrets','/etc/passwd'])assert.throws(()=>projectSchema.parse({...exampleProject,media:[{src,type:'image'}]}));assert.throws(()=>projectSchema.parse({...exampleProject,media:[{src:'uploads/a.mp4',type:'video',durationSeconds:2,trimStart:3}]}));});
test('audio offset and volume are validated',()=>{const audio={src:'uploads/a.wav',durationSeconds:3,trimStart:1,from:2,volume:.3,loop:true};assert(projectSchema.parse({...exampleProject,audio}).audio.loop);assert.throws(()=>projectSchema.parse({...exampleProject,audio:{...audio,volume:2}}));assert.throws(()=>projectSchema.parse({...exampleProject,audio:{...audio,from:16}}));});

test("written captions get editable provisional timing",()=>{const cues=makeCaptions("Une plante tropicale. ".repeat(12),15);assert(cues.length>1);assert(cues.every(c=>c.end>c.start&&c.end<=15&&c.text.length<=60));assert.doesNotThrow(()=>projectSchema.parse({...exampleProject,captions:cues}));assert.throws(()=>makeCaptions("",15));assert.throws(()=>makeCaptions("mot ".repeat(2000),15));});
