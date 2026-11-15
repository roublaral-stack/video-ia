#!/usr/bin/env bash
set -euo pipefail
video="${1:-out/plantes-bulles-remotion.mp4}"
mkdir -p out/remotion-frames
for second in 0 1 3 5 7 10 12 14; do
  ffmpeg -v error -y -ss "$second" -i "$video" -frames:v 1 "out/remotion-frames/frame-${second}s.jpg"
done
