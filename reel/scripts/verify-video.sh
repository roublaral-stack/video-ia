#!/usr/bin/env bash
set -euo pipefail
video="${1:-out/plantes-bulles-remotion.mp4}"
python3 - "$video" "${2:-}" "${3:-1080}" "${4:-1920}" <<'PY'
import json,subprocess,sys
file,expected,width,height=sys.argv[1:]
p=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration,size:stream=codec_name,codec_type,pix_fmt,width,height,r_frame_rate,nb_frames,duration','-of','json',file]))
v=next(s for s in p['streams'] if s['codec_type']=='video')
assert v['codec_name']=='h264',v
assert (v['width'],v['height'])==(int(width),int(height)),v
assert v['r_frame_rate']=='30/1',v
if expected:
 assert abs(float(v['duration'])-float(expected))<1/30,v
 assert int(v['nb_frames'])==round(float(expected)*30),v
 # AAC packets can pad the MP4 container by about 21 milliseconds.
 assert abs(float(p['format']['duration'])-float(expected))<.05,p['format']
print(json.dumps(p,indent=2))
PY
ffmpeg -v error -i "$video" -f null -
