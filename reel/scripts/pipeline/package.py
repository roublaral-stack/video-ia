"""Append non-secret production sources to an existing private project archive."""
import json,sys,zipfile
from pathlib import Path
archive,folder=Path(sys.argv[1]),Path(sys.argv[2])
with zipfile.ZipFile(archive,'a',compression=zipfile.ZIP_DEFLATED) as z:
 for name in ['script.txt','plan.json','storyboard.json','captions.srt','verification.json']:
  z.write(folder/name,'production/'+name)
 c=json.loads((folder/'config.private.json').read_text())
 # No reference samples, executable arguments, machine paths or environment values.
 clean={k:c[k] for k in ['version','subject','template','duration','demo']}
 clean['narration']={k:c['narration'][k] for k in ['engine','voice','speed','exaggeration','cfgWeight']}
 z.writestr('production/settings.json',json.dumps(clean,ensure_ascii=False,indent=2))
 assert z.testzip() is None
