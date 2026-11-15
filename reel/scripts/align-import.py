"""Local French forced word alignment. The input voice is read, never synthesized.
Usage: python align-import.py audio.wav source.srt model-folder output.json
model-folder: acoustic_model/, dictionary.dict and optional custom.dict.
"""
import sys,json,re,wave,subprocess,tempfile,hashlib
from pathlib import Path
import numpy as np
from pocketsphinx import Decoder

def tokens(text):return re.findall(r"[^\W\d_]+(?:['’][^\W\d_]+)*",text.lower().replace('’',"'"))
def parse_srt(text):
 cues=[]
 def stamp(s):
  h,m,rest=s.split(':');sec,ms=re.split('[,.]',rest);return (int(h)*3600000+int(m)*60000+int(sec)*1000+int(ms))/1000
 for block in re.split(r'\r?\n\s*\r?\n',text.strip().lstrip('\ufeff')):
  lines=block.splitlines()
  if lines and lines[0].isdigit():lines.pop(0)
  if not lines:continue
  start,end=lines.pop(0).split(' --> ');cues.append({'start':stamp(start),'end':stamp(end),'text':' '.join(lines)})
 return cues

def make_groups(cues,words,data,rate=16000,max_words=5,max_chars=34):
 out=[];cursor=0
 for cue in cues:
  surface=cue['text'].split();text_tokens=[t for part in surface for t in tokens(part)]
  # One displayed token must correspond to one dictionary word. Reject guesses.
  if len(text_tokens)!=len(surface):raise ValueError('Ponctuation ou tokenisation non prise en charge ; vérifier le transcript.')
  selected=words[cursor:cursor+len(surface)]
  if [w['text'] for w in selected]!=text_tokens:raise ValueError('L’alignement diffère du texte fourni.')
  items=[{**word,'surface':spelling} for word,spelling in zip(selected,surface)]
  # Dynamic grouping balances short lines against reading speed. It respects
  # clear acoustic pauses instead of giving every word an equal time slot.
  n=len(items);best=[(float('inf'),[]) for _ in range(n+1)];best[0]=(0,[])
  for end in range(1,n+1):
   for start in range(max(0,end-max_words),end):
    chunk=items[start:end];text=' '.join(x['surface'] for x in chunk)
    if len(text)>max_chars or any(chunk[k]['start']-chunk[k-1]['end']>.22 for k in range(1,len(chunk))):continue
    duration=chunk[-1]['end']-chunk[0]['start'];cps=len(text)/max(duration,.01)
    cost=1+.2*(len(chunk)-3.5)**2+max(0,.65-duration)*30+max(0,cps-27)*.15
    if re.search(r'[,;:.!?]$',chunk[-1]['surface']):cost-=.6
    if best[start][0]+cost<best[end][0]:best[end]=(best[start][0]+cost,best[start][1]+[chunk])
  if not best[n][1]:raise ValueError('Impossible de former des groupes lisibles sans couper les mots.')
  for chunk in best[n][1]:
   start,end=chunk[0]['start'],chunk[-1]['end'];lo=max(0,int(start*rate));hi=min(len(data),int(end*rate))
   frame=160;activity=[]
   for i in range(lo,hi,frame):
    signal=data[i:min(i+frame,hi)]
    if len(signal) and np.sqrt(np.mean(signal.astype(np.float64)**2))>.006:activity.append(i)
   if not activity:raise ValueError('Groupe sous-titré sans signal vocal détectable.')
   if activity[0]/rate-start>.08:start=max(start,activity[0]/rate-.025)
   if end-(activity[-1]+frame)/rate>.12:end=min(end,(activity[-1]+frame)/rate+.045)
   out.append({'start':round(start,3),'end':round(end,3),'text':' '.join(x['surface'] for x in chunk)})
  cursor+=len(surface)
 if cursor!=len(words):raise ValueError('Mots non affectés à un sous-titre.')
 if any(c['end']<=c['start'] for c in out):raise ValueError('Durée de groupe invalide.')
 if tokens(' '.join(c['text'] for c in out))!=tokens(' '.join(c['text'] for c in cues)):raise ValueError('Le texte a changé.')
 return out

def align(audio,srt,model):
 cues=parse_srt(srt.read_text());transcript=' '.join(c['text'] for c in cues);expected=tokens(transcript)
 decoder=Decoder(hmm=str(model/'acoustic_model'),dict=str(model/'dictionary.dict'),lm=None,samprate=16000,loglevel='ERROR',bestpath=False,beam=1e-80,wbeam=1e-60)
 if (model/'custom.dict').exists():
  for line in (model/'custom.dict').read_text().splitlines():
   if not line.strip() or line.startswith('#'):continue
   word,phones=line.split(maxsplit=1);decoder.add_word(word,phones,update=True)
 missing=sorted(set(w for w in expected if not decoder.lookup_word(w)))
 if missing:raise ValueError('Mots absents du dictionnaire : '+', '.join(missing)+'. Ajouter des prononciations françaises vérifiées dans custom.dict.')
 with tempfile.TemporaryDirectory(prefix='video-ia-align-') as temp:
  analysis=Path(temp)/'analysis.wav';subprocess.run(['ffmpeg','-v','error','-y','-i',str(audio),'-ar','16000','-ac','1','-c:a','pcm_s16le',str(analysis)],check=True)
  with wave.open(str(analysis)) as f:raw=f.readframes(f.getnframes())
 data=np.frombuffer(raw,dtype='<i2').astype(np.float64)/32768
 decoder.set_align_text(' '.join(expected));decoder.start_utt();decoder.process_raw(raw,full_utt=True);decoder.end_utt()
 words=[{'text':re.sub(r'\(\d+\)$','',s.word),'start':s.start_frame/100,'end':(s.end_frame+1)/100} for s in decoder.seg() if not s.word.startswith('<')]
 if [w['text'] for w in words]!=expected:raise ValueError('Le modèle n’a pas aligné tous les mots dans l’ordre.')
 # The original cue boundaries act as broad validation anchors, not equal timing slots.
 offset=0
 for cue in cues:
  n=len(tokens(cue['text']));part=words[offset:offset+n];offset+=n
  if part[0]['start']<cue['start']-.5 or part[-1]['end']>cue['end']+.5:raise ValueError('Désaccord important avec le SRT source ; contrôle manuel nécessaire.')
 return {'method':'pocketsphinx-fr-forced-word-alignment','language':'fr','granularity':'short-word-groups','audioModified':False,'inputSha256':hashlib.sha256(audio.read_bytes()).hexdigest(),'sourceSrtSha256':hashlib.sha256(srt.read_bytes()).hexdigest(),'dictionarySha256':hashlib.sha256((model/'dictionary.dict').read_bytes()).hexdigest(),'modelSource':json.loads((model/'provenance.json').read_text()) if (model/'provenance.json').exists() else {'path':str(model)},'wordCount':len(words),'words':words,'captions':make_groups(cues,words,data),'limitations':'Acoustic forced alignment of supplied French transcript; no independent ASR or perceptual listening claimed.'}
if __name__=='__main__':
 try:
  audio,srt,model,out=map(Path,sys.argv[1:5]);result=align(audio,srt,model);out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(f"Alignement local : {result['wordCount']} mots, {len(result['captions'])} groupes.")
 except Exception as e:raise SystemExit('Alignement refusé : '+str(e))
