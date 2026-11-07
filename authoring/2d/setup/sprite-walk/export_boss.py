"""Export real locally generated poses on a shared pixel grid and palette."""
import json,math,hashlib,shutil
import numpy as np
from PIL import Image,ImageDraw
from run import HERE,ROOT,OUT,INPUT

actions=['idle','walk','charge','breath','claw','hurt','death']
pack=ROOT/'outputs/Synth-Drake-Boss';pack.mkdir(exist_ok=True)
assets=ROOT/'web-game-prototype/dist/assets'
sources={}
for action in actions:
    history=json.loads((HERE/('boss-'+action+'-v1-cutouts-history.json')).read_text())
    sources[action]=[Image.open(OUT/'raw'/f['subfolder']/f['filename']).convert('RGBA') for f in history['outputs']['103']['images']]
boxes=[im.getchannel('A').point(lambda a:255 if a>=128 else 0).getbbox() for frames in sources.values() for im in frames]
# Constant source scale and horizontal center retain neck thrusts and leg motion.
scale=min(236/max(b[2]-b[0] for b in boxes),164/max(b[3]-b[1] for b in boxes))
frames={}
palette_image=Image.new('RGB',(2048,192*len(actions)),'#111223')
for row,(action,originals) in enumerate(sources.items()):
    frames[action]=[]
    for col,im in enumerate(originals):
        box=im.getchannel('A').point(lambda a:255 if a>=128 else 0).getbbox()
        resized=im.resize((round(im.width*scale),round(im.height*scale)),Image.Resampling.BOX)
        resized.putalpha(resized.getchannel('A').point(lambda a:255 if a>=128 else 0))
        cell=Image.new('RGBA',(256,192))
        cell.alpha_composite(resized,(128-round(im.width*scale/2),180-round(box[3]*scale)))
        frames[action].append(cell);palette_image.paste(cell,(col*256,row*192),cell)
palette=palette_image.quantize(colors=92,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE)
# Reserve four warm colors so tiny orange eyes survive the shared palette.
palette_data=palette.getpalette()[:276]+[255,193,61,255,132,14,201,80,3,255,234,155]
palette.putpalette(palette_data+palette_data[-3:]*(256-96))
preview=Image.new('RGB',(2048,218*len(actions)),'#171728');draw=ImageDraw.Draw(preview);validation={}
for row,(action,cells) in enumerate(frames.items()):
    atlas=Image.new('RGBA',(2048,192));gif=[];hashes=[]
    for col,cell in enumerate(cells):
        im=cell.convert('RGB').quantize(palette=palette,dither=Image.Dither.NONE).convert('RGBA');im.putalpha(cell.getchannel('A'))
        arr=np.array(im);arr[arr[:,:,3]==0,:3]=0;im=Image.fromarray(arr)
        atlas.alpha_composite(im,(col*256,0));preview.paste(im,(col*256,row*218+26),im)
        bg=Image.new('RGB',(256,192),'#171728');bg.paste(im,(0,0),im);gif.append(bg.resize((512,384),Image.Resampling.NEAREST))
        hashes.append(hashlib.sha256(im.tobytes()).hexdigest())
    stem='boss-'+action+'-left';atlas.save(pack/(stem+'.png'));shutil.copyfile(pack/(stem+'.png'),assets/(stem+'.png'))
    gif[0].save(pack/(action+'-preview.gif'),save_all=True,append_images=gif[1:],duration=110,loop=0,disposal=2)
    metadata={'frames':8,'frameWidth':256,'frameHeight':192,'anchor':[128,180],'facing':'left','fps':9,'loop':action in ['idle','walk'],'sourceIndices':json.loads((HERE/('boss-'+action+'-v1-selection.json')).read_text())}
    (pack/(stem+'.json')).write_text(json.dumps(metadata,indent=2));shutil.copyfile(HERE/('boss-'+action+'-v1-api.json'),pack/(action+'-workflow-api.json'))
    validation[action]={'uniqueFrames':len(set(hashes)),'size':list(atlas.size),'binaryAlpha':set(np.unique(np.array(atlas)[:,:,3]))<={0,255}}
    assert validation[action]['uniqueFrames']==8 and validation[action]['binaryAlpha']
    draw.text((10,row*218+8),action.upper()+' / 8 REAL GENERATED POSES',fill='#ff94d4')
preview.save(pack/'boss-contact-sheet.png');preview.resize((1024,763),Image.Resampling.NEAREST).save(assets/'boss-preview.png')

fx_preview=Image.new('RGB',(1536,220*3),'#171728');fd=ImageDraw.Draw(fx_preview)
for row,name in enumerate(['breath','claw','charge']):
    stem='fx-boss-'+name+'-v1';h=json.loads((HERE/(stem+'-history.json')).read_text());f=h['outputs']['24']['images'][0]
    im=Image.open(OUT/'raw'/f['subfolder']/f['filename']).convert('RGB')
    mask=Image.fromarray((np.array(im).max(axis=2)>22).astype('uint8')*255);box=mask.getbbox();im=im.crop(box);im.thumbnail((168,168),Image.Resampling.BOX)
    cell=Image.new('RGB',(192,192));cell.paste(im,((192-im.width)//2,(192-im.height)//2))
    rgb=np.array(cell,dtype=float);alpha=np.clip((rgb.max(axis=2)-7)/248,0,1);rgb=np.clip(rgb/np.maximum(alpha[:,:,None],.001),0,255);rgb[alpha==0]=0
    master=Image.fromarray(np.dstack([rgb,alpha*255]).astype('uint8'));master.save(pack/('fx-boss-'+name+'-master.png'))
    atlas=Image.new('RGBA',(1536,192))
    for i in range(8):
        im=master.copy()
        if name=='charge':im=im.rotate(-i*45,resample=Image.Resampling.NEAREST)
        a=np.array(im.getchannel('A'),dtype=float);yy,xx=np.indices(a.shape)
        if name=='claw':a*= [.3,.7,1,1,.85,.6,.3,.08][i];a[int(192*min(1,.25+i*.2)):]=0
        else:a*=.88+.12*np.sin(i/8*math.tau+xx*.07+yy*.06)
        im.putalpha(Image.fromarray(a.clip(0,255).astype('uint8')));atlas.alpha_composite(im,(i*192,0));fx_preview.paste(im,(i*192,row*220+26),im)
    file='fx-boss-'+name+'.png';atlas.save(pack/file);shutil.copyfile(pack/file,assets/file)
    (pack/('fx-boss-'+name+'.json')).write_text(json.dumps({'frames':8,'frameWidth':192,'frameHeight':192,'anchor':[96,96],'fps':18,'loop':name!='claw'},indent=2))
    shutil.copyfile(HERE/(stem+'-api.json'),pack/('fx-'+name+'-workflow-api.json'));fd.text((10,row*220+8),name.upper(),fill='#ff94d4')
fx_preview.save(pack/'boss-fx-contact-sheet.png')
for file in ['boss-reference.png','boss-animation-start.png']:shutil.copyfile(INPUT/file,pack/file)
shutil.copyfile(HERE/'boss-master-v1-api.json',pack/'master-workflow-api.json')
(pack/'validation.json').write_text(json.dumps({'scale':scale,'animations':validation},indent=2))
(pack/'README.txt').write_text('SYNTH DRAKE / Punkman mechanical dragon boss\n'
 'Designed from the supplied blue and magenta dragon reference.\n'
 'Generated locally with ComfyUI: FLUX Klein reference master and VFX; Wan2.2 GGUF + PixelAnimate articulated animations; BiRefNet cutouts. No paid inference API.\n'
 '7 animations x 8 real generated poses. 256x192 cells, 2048x192 atlas, LEFT facing, feet anchor (128,180), shared 96-color palette and binary transparency.\n'
 'idle/walk loop; charge/breath/claw/hurt/death play once. Gameplay chooses timing.\n'
 '3 light VFX x 8 deterministic frames from generated masters, 192x192 cells, soft alpha. Breath and claw face LEFT; mirror for right.\n'
 'API workflows include exact prompts/seeds/model names. Copy the supplied reference PNGs into ComfyUI input. Models remain on the local machine.\n',encoding='utf-8')
shutil.make_archive(str(pack),'zip',pack)
print(json.dumps({'package':str(pack)+'.zip','scale':scale,'animations':validation},indent=2))
