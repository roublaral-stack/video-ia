"""Pack/restore a VIDEO IA personal project. Archives stay outside Git."""
import json,re,sys,zipfile
from pathlib import Path
root=Path(__file__).resolve().parents[1]
mode,project_name,archive_name=sys.argv[1:4]
project=Path(project_name);archive=Path(archive_name)
if mode=='pack':
 p=json.loads(project.read_text());assets=p.get('media',[])+([p['audio']] if p.get('audio') else [])
 with zipfile.ZipFile(archive,'x',compression=zipfile.ZIP_DEFLATED) as z:
  z.writestr('project.json',json.dumps(p,ensure_ascii=False,indent=2))
  for src in dict.fromkeys(a['src'] for a in assets):
   if not re.fullmatch(r'(uploads|demo)/[a-zA-Z0-9_.-]+',src):raise ValueError('Invalid asset path')
   z.write(root/'public'/src,'public/'+src)
elif mode=='restore':
 if project.exists():raise ValueError('Destination already exists')
 with zipfile.ZipFile(archive) as z:
  if sum(i.file_size for i in z.infolist())>2*1024**3:raise ValueError('Archive too large')
  for i in z.infolist():
   if i.filename!='project.json' and not re.fullmatch(r'public/(uploads|demo)/[a-zA-Z0-9_.-]+|production/[a-zA-Z0-9_.-]+',i.filename):raise ValueError('Unsafe archive path')
  p=json.loads(z.read('project.json'))
  for i in z.infolist():
   if i.filename=='project.json' or i.filename.startswith('production/'):continue
   dest=root/i.filename;dest.parent.mkdir(parents=True,exist_ok=True)
   data=z.read(i)
   if dest.exists() and dest.read_bytes()!=data:raise ValueError('Existing media differs')
   dest.write_bytes(data)
  project.parent.mkdir(parents=True,exist_ok=True);project.write_text(json.dumps(p,ensure_ascii=False,indent=2))
else:raise ValueError('Unknown archive operation')
print(project if mode=='restore' else archive)
