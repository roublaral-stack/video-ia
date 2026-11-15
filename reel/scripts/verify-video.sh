#!/usr/bin/env bash
set -euo pipefail
video="${1:-out/plantes-bulles-remotion.mp4}"
ffprobe -v error -show_entries format=duration,size:stream=codec_name,pix_fmt,width,height,r_frame_rate,nb_frames -of json "$video"
ffmpeg -v error -i "$video" -f null -
