"""Offline editorial fallback. Original Pillow artwork; FFmpeg H.264 export.
This renderer mirrors the storyboard, not SnapCN's exact browser animation.
Run from reel/: python3 scripts/render-fallback.py
"""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import math, subprocess
W,H,FPS=1080,1920,30
OUT=Path('out');OUT.mkdir(exist_ok=True)
FONT='public/fonts/DejaVuSans.ttf'
def font(size): return ImageFont.truetype(FONT,size)
def bezier(p,t):
 s=1-t
 return (s**3*p[0][0]+3*s*s*t*p[1][0]+3*s*t*t*p[2][0]+t**3*p[3][0],s**3*p[0][1]+3*s*s*t*p[1][1]+3*s*t*t*p[2][1]+t**3*p[3][1])
def curve(p):return [bezier(p,t/24) for t in range(25)]
def plant(d,x,y,scale,lean):
 def pt(a,b):return (x+(a+lean*(-b)/650)*scale,y+b*scale)
 d.line([pt(0,20),pt(-12,-350),pt(0,-720)],fill='#789878',width=4)
 for j in range(5):
  h=-120-j*119
  for side in [-1,1]:
   a=[pt(0,h),pt(side*210,h-20),pt(side*180,h-190),pt(side*75,h-159)]
   b=[a[-1],pt(side*10,h-120),pt(side*5,h-55),a[0]]
   d.polygon(curve(a)+curve(b),fill=['#32664d','#487b58','#648e65'][j%3])
   d.line([a[0],pt(side*124,h-119)],fill='#90ac7c',width=2)
def background(tropical):
 im=Image.new('RGB',(W,H));d=ImageDraw.Draw(im)
 top=(28,65,49) if tropical else (17,57,61)
 for y in range(H):
  k=y/H;d.line((0,y,W,y),fill=tuple(round(top[c]*(1-k)+(7,25,27)[c]*k) for c in range(3)))
 for i in range(5):d.polygon([(i*280-210,0),(i*280-130,0),(i*230+420,H),(i*230+210,H)],fill=(22,61,53))
 d.ellipse((-300,1630,1500,2140),fill='#344839')
 for i in range(13):plant(d,i*98-40,1840+(i%3)*40,.68+(i%4)*.16,(-1 if i%2 else 1)*40)
 return im
BASE=[background(False),background(True),background(False)]
BEATS=[(['Un monde','vivant'],'Une pause au rythme de l’eau.'),(['Le calme','pousse'],'Des feuilles, de la lumière, de la vie.'),(['Plantes','& Bulles'],'Un petit morceau de nature, chez soi.')]
def center(d,txt,y,size,color='#f4f1df'):
 d.text((W/2,y),txt,font=font(size),fill=color,anchor='mt')
def scene(index,f):
 im=BASE[index].copy();d=ImageDraw.Draw(im)
 if index!=1:
  for i in range(5):
   x=((f*1.8+i*243)%1510)-180;y=990+(i%3)*145+math.sin(f/40+i)*16
   col='#cbbf90' if i%2 else '#a1c3b4'
   d.ellipse((x-65,y-24,x+55,y+24),fill=col);d.polygon([(x-52,y),(x-100,y-32),(x-100,y+32)],fill=col)
   d.line((x-45,y,x+18,y),fill='#5b9897',width=7);d.ellipse((x+31,y-7,x+39,y+1),fill='#173d3c')
 for i in range(22):
  x=55+i*47+math.sin(f/50+i)*15;y=1870-((f*3+i*111)%1820);r=4+i%4*3
  d.ellipse((x-r,y-r,x+r,y+r),outline='#577d72',width=2)
 # Deliberate quiet space and readable safe-area typography.
 d.text((100,125),'Plantes & Bulles',font=font(30),fill='#e3e8d1')
 d.text((900,125),f'0{index+1}',font=font(30),fill='#bad29b')
 titles,sub=BEATS[index]
 for j,txt in enumerate(titles):
  p=min(1,max(0,(f-j*7)/25));ease=1-(1-p)**3
  layer=Image.new('RGBA',(W,H));ld=ImageDraw.Draw(layer)
  ld.text((W/2,330+j*116+round((1-ease)*60)),txt,font=font(100),fill=(244,241,223,round(255*p)),anchor='mt')
  im=Image.alpha_composite(im.convert('RGBA'),layer).convert('RGB')
 d=ImageDraw.Draw(im)
 if f>=24:
  p=min(1,(f-24)/18);layer=Image.new('RGBA',(W,H));ld=ImageDraw.Draw(layer)
  # Wrap supporting copy for mobile readability.
  lines=[sub] if index==0 else (['Des feuilles, de la lumière,','de la vie.'] if index==1 else ['Un petit morceau de nature,','chez soi.'])
  for j,line in enumerate(lines):ld.text((540,638+j*58+round((1-p)*20)),line,font=font(43),fill=(220,230,206,round(p*255)),anchor='mt')
  im=Image.alpha_composite(im.convert('RGBA'),layer).convert('RGB');d=ImageDraw.Draw(im)
 d.line((100,1554,980,1554),fill='#80947a',width=1)
 d.text((100,1580),'Cultivons un peu de nature.' if index==2 else 'Aquariums · Plantes tropicales',font=font(34),fill='#e0e8c9')
 d.text((100,1720),'Démo · Illustrations originales de substitution',font=font(25),fill='#c3d1c2')
 d.line((100,1805,100+880*min(1,(index*145+f)/449),1805),fill='#a7c38c',width=4)
 return im
cmd=['ffmpeg','-y','-loglevel','error','-f','rawvideo','-pixel_format','rgb24','-video_size',f'{W}x{H}','-framerate',str(FPS),'-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart',str(OUT/'plantes-bulles-demo.mp4')]
p=subprocess.Popen(cmd,stdin=subprocess.PIPE)
try:
 for f in range(450):
  index=min(2,f//145);local=f-index*145
  im=scene(index,local)
  if index>0 and local<15:im=Image.blend(scene(index-1,145+local),im,local/15)
  if f in (90,225,380):im.save(OUT/f'preview-{f}.jpg')
  p.stdin.write(im.tobytes())
  if f%90==0:print(f'Rendered {f}/450',flush=True)
finally:p.stdin.close()
if p.wait()!=0:raise SystemExit('FFmpeg failed')
print('Created out/plantes-bulles-demo.mp4',flush=True)
