"""Make stable transparent pixel atlases from locally generated light-effect masters."""
import json, math, hashlib, shutil
import numpy as np
from PIL import Image,ImageEnhance,ImageDraw,ImageOps
from run import ROOT,HERE,OUT

dest=ROOT/'outputs/Punkman-VFX';dest.mkdir(exist_ok=True)
assets=ROOT/'web-game-prototype/dist/assets';size=192
names=['bolt','charged-bolt','slash','charge','impact','ultimate','dash']
def source(name):
    h=json.loads((HERE/('vfx-'+name+'-v1-history.json')).read_text())
    item=h['outputs']['24']['images'][0]
    return OUT/'raw'/item['subfolder']/item['filename']
def transparent(im):
    rgb=np.array(im.convert('RGB'),dtype=np.float32)
    value=rgb.max(axis=2)
    a=np.clip((value-7)/248,0,1)
    color=np.clip(rgb/np.maximum(a[:,:,None],.001),0,255).astype('uint8')
    color[a==0]=0
    rgba=np.dstack([color,(a*255).astype('uint8')])
    return Image.fromarray(rgba)

preview=Image.new('RGB',(8*192,len(names)*220),'#171524');draw=ImageDraw.Draw(preview)
validation={}
for row,name in enumerate(names):
    im=Image.open(source(name)).convert('RGB')
    if name in ['slash','ultimate']:im=ImageOps.mirror(im) # inspected masters open right; game needs open left
    mask=Image.fromarray((np.array(im).max(axis=2)>22).astype('uint8')*255)
    box=mask.getbbox();im=im.crop((max(0,box[0]-16),max(0,box[1]-16),min(im.width,box[2]+16),min(im.height,box[3]+16)))
    im.thumbnail((164,164),Image.Resampling.BOX)
    cell=Image.new('RGB',(size,size));cell.paste(im,((size-im.width)//2,(size-im.height)//2))
    master=transparent(cell);master.save(dest/(name+'-master.png'))
    frames=[]
    for i in range(8):
        phase=i/8;frame=master.copy()
        if name=='charge':frame=frame.rotate(-i*45,resample=Image.Resampling.NEAREST)
        if name in ['slash','impact']:
            scale=([.65,.82,.96,1,1.04,1.06,1.08,1.08] if name=='slash' else [.35,.60,.82,1,1.04,1.06,1.08,1.1])[i]
            scaled=frame.resize((round(size*scale),round(size*scale)),Image.Resampling.NEAREST)
            frame=Image.new('RGBA',(size,size));frame.alpha_composite(scaled,((size-scaled.width)//2,(size-scaled.height)//2))
            a=np.array(frame.getchannel('A'),dtype=float)
            if name=='slash':
                cutoff=int(size*min(1,.2+i*.21));a[cutoff:]=0
                a*=[.55,.85,1,1,.9,.7,.45,.18][i]
            else:a*=[.65,.9,1,1,.7,.45,.22,.05][i]
            frame.putalpha(Image.fromarray(a.clip(0,255).astype('uint8')))
        elif name in ['bolt','charged-bolt','ultimate','dash']:
            a=np.array(frame.getchannel('A'),dtype=float)
            yy,xx=np.indices(a.shape);pulse=.88+.12*np.sin(phase*math.tau+yy*.1+xx*.04)
            if name=='dash':pulse*=np.clip((xx-12)/38,0,1)
            frame.putalpha(Image.fromarray((a*pulse).clip(0,255).astype('uint8')))
        frames.append(frame)
    atlas=Image.new('RGBA',(size*8,size))
    for i,frame in enumerate(frames):
        atlas.alpha_composite(frame,(i*size,0));preview.paste(frame,(i*size,row*220+26),frame)
    draw.text((10,row*220+8),name.upper()+' / 8 FRAMES',fill='#ffc1e4')
    atlas.save(dest/('fx-'+name+'.png'));shutil.copyfile(dest/('fx-'+name+'.png'),assets/('fx-'+name+'.png'))
    metadata={'frames':8,'frameWidth':size,'frameHeight':size,'anchor':[96,96],'fps':18,'loop':name not in ['slash','impact']}
    (dest/('fx-'+name+'.json')).write_text(json.dumps(metadata,indent=2))
    shutil.copyfile(HERE/('vfx-'+name+'-v1-api.json'),dest/(name+'-workflow-api.json'))
    hashes=[hashlib.sha256(f.tobytes()).hexdigest() for f in frames]
    validation[name]={'size':list(atlas.size),'unique_frames':len(set(hashes)),'transparent_corners':all(atlas.getpixel(p)[3]==0 for p in [(0,0),(1535,0),(0,191),(1535,191)])}
    assert validation[name]['unique_frames']==8 and validation[name]['transparent_corners']
cutin=Image.open(source('cutin')).convert('RGB').resize((512,256),Image.Resampling.NEAREST)
cutin.save(dest/'punkman-ultimate-cutin.png');shutil.copyfile(dest/'punkman-ultimate-cutin.png',assets/'punkman-ultimate-cutin.png')
shutil.copyfile(HERE/'vfx-cutin-v1-api.json',dest/'cutin-workflow-api.json')
preview.save(dest/'vfx-contact-sheet.png');preview.resize((1024,round(preview.height*1024/preview.width)),Image.Resampling.NEAREST).save(assets/'punkman-vfx-preview.png')
(dest/'validation.json').write_text(json.dumps(validation,indent=2))
(dest/'README.txt').write_text('Punkman VFX / local ComfyUI FLUX Klein 4B\n'
 'Seven generated light-effect masters (including dash wake) plus a reference-guided hero cut-in.\n'
 'Masters were trimmed, black-keyed with soft alpha and assembled into deterministic 8-frame pixel atlases.\n'
 '192x192 cells, 8 horizontal frames, 18 fps default. Slash/impact are one-shot; others loop.\n'
 'PNG and JSON are reusable. API workflows contain exact prompts and seeds. No paid inference API.\n'
 'Input reference for cut-in: punkman-walk-start.png from the earlier character package.\n',encoding='utf-8')
shutil.make_archive(str(dest),'zip',dest)
print(json.dumps(validation,indent=2))
