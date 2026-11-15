"""Original synthetic media only; no personal media or remote assets."""
import sys
from pathlib import Path
from PIL import Image,ImageDraw
out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
im=Image.new('RGB',(540,960),'#113c37');d=ImageDraw.Draw(im)
for i in range(8):
 x=i*80-20
 d.line((x,960,x+25,490),fill='#95b18a',width=4)
 for j in range(4):
  y=850-j*90
  d.ellipse((x-65,y-85,x+5,y+5),fill=['#3d7953','#59926a'][j%2]);d.ellipse((x+2,y-110,x+75,y-20),fill='#537c4f')
for x,y in [(150,420),(400,340)]:
 d.ellipse((x,y,x+75,y+30),fill='#c8c69b');d.polygon([(x,y+15),(x-20,y),(x-20,y+30)],fill='#c8c69b')
im.save(out/'photo.jpg')
