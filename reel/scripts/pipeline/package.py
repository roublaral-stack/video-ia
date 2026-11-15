"""Append non-secret production sources to an existing private project archive."""
import json,sys,zipfile
from pathlib import Path
archive,folder=Path(sys.argv[1]),Path(sys.argv[2])
preview=len(sys.argv)>3 and sys.argv[3]=='preview'
with zipfile.ZipFile(archive,'a',compression=zipfile.ZIP_DEFLATED) as z:
 for name in ['script.txt','plan.json','storyboard.json','captions.srt','preview-verification.json' if preview else 'verification.json']:
  z.write(folder/name,'production/'+name)
 for name in ['captions.timing.json','creative-brief.json']:
  if (folder/name).exists():z.write(folder/name,'production/'+name)
 if (folder/'captions.timing.json').exists():
  name=json.loads((folder/'captions.timing.json').read_text()).get('srt')
  if name in ['captions.provisional.srt','captions.aligned.srt','captions.reviewed.srt']:z.write(folder/name,'production/'+name)
 c=json.loads((folder/'config.private.json').read_text())
 # No reference samples, executable arguments, machine paths or environment values.
 clean={k:c[k] for k in ['version','subject','template','duration','demo']}
 clean['narration']={k:c['narration'][k] for k in ['engine','voice','speed','exaggeration','cfgWeight']}
 clean['narration']['durationPolicy']=c['narration'].get('durationPolicy','fixed')
 if c.get('script'):clean['script']=c['script']
 clean['subtitles']={k:v for k,v in c.get('subtitles',{}).items() if k!='srt'}
 clean['stage']='script-first' if c['narration']['engine']=='none' else 'voiced'
 clean['requestedDuration']=c.get('requestedDuration',c['duration'])
 z.writestr('production/settings.json',json.dumps(clean,ensure_ascii=False,indent=2))
 assert z.testzip() is None
