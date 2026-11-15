"""VIDEO IA bridge for the audited public Chatterbox Python API.
Usage: <chatterbox-venv>/bin/python adapters/chatterbox.py request.json response.json
No external checkout is edited. This adapter does not install dependencies/models.
"""
import json,sys
from pathlib import Path
request_path,response_path=map(Path,sys.argv[1:3])
request=json.loads(request_path.read_text())
try:
 import torchaudio as ta
 from chatterbox.mtl_tts import ChatterboxMultilingualTTS
except ImportError as error:
 raise SystemExit('Chatterbox runtime absent in this interpreter: '+str(error))
if not request.get('modelDirectory') or not request.get('referenceAudio'):
 raise SystemExit('Runtime personnalisé non configuré : poids locaux et référence vocale requis ; aucun modèle/voix générique chargé.')
model=ChatterboxMultilingualTTS.from_local(request['modelDirectory'],device=request.get('device','cpu'),t3_model='v3')
segments=[]
for index,text in enumerate(request['parts']):
 kwargs={'language_id':'fr','exaggeration':request.get('exaggeration',.5),'cfg_weight':request.get('cfgWeight',.5)}
 if request.get('referenceAudio'):kwargs['audio_prompt_path']=request['referenceAudio']
 audio=model.generate(text,**kwargs)
 file=Path(request['outputDirectory'])/f'chatterbox-{index}.wav'
 ta.save(str(file),audio,model.sr)
 segments.append({'text':text,'audio':str(file.resolve())})
response_path.write_text(json.dumps({'segments':segments},ensure_ascii=False,indent=2))
