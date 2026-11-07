"""Package phase-two assets from local generations; keep the existing boss scale/palette."""
import json,hashlib,shutil,math
import numpy as np
from PIL import Image,ImageDraw
from run import HERE,ROOT,OUT,INPUT

assets=ROOT/'web-game-prototype/dist/assets';pack=ROOT/'outputs/Synth-Drake-Phase2';pack.mkdir(exist_ok=True)
def files(name,key='24'):
    h=json.loads((HERE/(name+'-history.json')).read_text());return [OUT/'raw'/v['subfolder']/v['filename'] for v in h['outputs'][key]['images']]
scale=json.loads((ROOT/'outputs/Synth-Drake-Boss/validation.json').read_text())['scale']
colors=set()
for name in ['idle','walk','charge','breath','claw','hurt','death']:
    a=np.array(Image.open(assets/('boss-'+name+'-left.png')));colors.update(map(tuple,np.unique(a[a[:,:,3]>0,:3],axis=0)))
colors=sorted(colors);assert len(colors)<=96
palette=Image.new('P',(1,1));palette.putpalette([int(v) for c in colors+[colors[-1]]*(256-len(colors)) for v in c])
atlas=Image.new('RGBA',(2048,192));preview=Image.new('RGB',(2048,218),'#171728');gif=[];hashes=[]
for i,path in enumerate(files('boss-stomp-v1-cutouts','103')):
    im=Image.open(path).convert('RGBA');box=im.getchannel('A').point(lambda a:255 if a>=128 else 0).getbbox()
    small=im.resize((round(im.width*scale),round(im.height*scale)),Image.Resampling.BOX);small.putalpha(small.getchannel('A').point(lambda a:255 if a>=128 else 0))
    cell=Image.new('RGBA',(256,192));cell.alpha_composite(small,(128-round(im.width*scale/2),180-round(box[3]*scale)))
    color=cell.convert('RGB').quantize(palette=palette,dither=Image.Dither.NONE).convert('RGBA');color.putalpha(cell.getchannel('A'))
    a=np.array(color);a[a[:,:,3]==0,:3]=0;color=Image.fromarray(a)
    atlas.alpha_composite(color,(i*256,0));preview.paste(color,(i*256,26),color);hashes.append(hashlib.sha256(color.tobytes()).hexdigest())
    bg=Image.new('RGB',(256,192),'#171728');bg.paste(color,(0,0),color);gif.append(bg.resize((512,384),Image.Resampling.NEAREST))
assert len(hashes)==8 and len(set(hashes))==8
atlas.save(pack/'boss-stomp-left.png');shutil.copyfile(pack/'boss-stomp-left.png',assets/'boss-stomp-left.png')
ImageDraw.Draw(preview).text((10,8),'SONIC QUAKE / 8 REAL GENERATED POSES',fill='#ff95d4');preview.save(pack/'stomp-contact-sheet.png')
gif[0].save(pack/'stomp-preview.gif',save_all=True,append_images=gif[1:],duration=[170,170,170,190,90,100,120,160],loop=0,disposal=2)
(pack/'boss-stomp-left.json').write_text(json.dumps({'frames':8,'frameWidth':256,'frameHeight':192,'anchor':[128,180],'facing':'left','anticipationFrames':[0,1,2,3],'impactFrame':5,'sourceIndices':[0,3,6,9,12,16,22,28]},indent=2))
shutil.copyfile(HERE/'boss-stomp-v1-api.json',pack/'stomp-workflow-api.json')
fx_preview=Image.new('RGB',(1536,440),'#171728');draw=ImageDraw.Draw(fx_preview)
for row,name in enumerate(['boss-overdrive','boss-quake']):
    stem='fx-'+name+'-v1';im=Image.open(files(stem)[0]).convert('RGB')
    box=Image.fromarray((np.array(im).max(axis=2)>22).astype('uint8')*255).getbbox();im=im.crop(box);im.thumbnail((168,168),Image.Resampling.BOX)
    bg=Image.new('RGB',(192,192));bg.paste(im,((192-im.width)//2,(192-im.height)//2));rgb=np.array(bg,dtype=float)
    alpha=np.clip((rgb.max(axis=2)-7)/248,0,1);rgb=np.clip(rgb/np.maximum(alpha[:,:,None],.001),0,255);rgb[alpha==0]=0
    master=Image.fromarray(np.dstack([rgb,alpha*255]).astype('uint8'));master.save(pack/(name+'-master.png'))
    sheet=Image.new('RGBA',(1536,192));frame_hashes=[]
    for i in range(8):
        frame=master.rotate(-i*45,resample=Image.Resampling.NEAREST);a=np.array(frame.getchannel('A'),dtype=float);yy,xx=np.indices(a.shape)
        a*=.9+.1*np.sin(i/8*math.tau+xx*.06+yy*.08);frame.putalpha(Image.fromarray(a.clip(0,255).astype('uint8')))
        sheet.alpha_composite(frame,(i*192,0));fx_preview.paste(frame,(i*192,row*220+26),frame);frame_hashes.append(hashlib.sha256(frame.tobytes()).hexdigest())
    assert len(set(frame_hashes))==8
    sheet.save(pack/('fx-'+name+'.png'));shutil.copyfile(pack/('fx-'+name+'.png'),assets/('fx-'+name+'.png'))
    (pack/('fx-'+name+'.json')).write_text(json.dumps({'frames':8,'frameWidth':192,'frameHeight':192,'anchor':[96,96],'fps':18,'loop':True},indent=2))
    shutil.copyfile(HERE/(stem+'-api.json'),pack/(name+'-workflow-api.json'));draw.text((10,row*220+8),name.upper(),fill='#ff95d4')
fx_preview.save(pack/'phase2-fx-contact-sheet.png')
cutin=Image.open(files('boss-phase2-cutin-v1')[0]).convert('RGB').resize((512,256),Image.Resampling.NEAREST)
cutin.save(pack/'boss-phase2-cutin.png');shutil.copyfile(pack/'boss-phase2-cutin.png',assets/'boss-phase2-cutin.png')
web_preview=Image.new('RGB',(1024,914),'#171728')
web_preview.paste(preview.resize((1024,109),Image.Resampling.NEAREST),(0,0))
web_preview.paste(fx_preview.resize((1024,293),Image.Resampling.NEAREST),(0,109))
web_preview.paste(cutin.resize((1024,512),Image.Resampling.NEAREST),(0,402))
web_preview.save(assets/'boss-phase2-preview.png');web_preview.save(pack/'phase2-overview.png')
shutil.copyfile(HERE/'boss-phase2-cutin-v1-api.json',pack/'cutin-workflow-api.json');shutil.copyfile(INPUT/'boss-animation-start.png',pack/'boss-animation-start.png')
(pack/'validation.json').write_text(json.dumps({'stompFrames':8,'uniqueStompFrames':len(set(hashes)),'scale':scale,'paletteColors':len(colors),'sameScaleAndPaletteAsBoss':True,'impactFrame':5},indent=2))
(pack/'README.txt').write_text('SYNTH DRAKE / OVERDRIVE PHASE 2\n'
 'Generated entirely on localhost ComfyUI with installed FLUX Klein, Wan2.2 and BiRefNet. No paid inference API.\n'
 'One real generated Sonic Quake animation: 8 poses, 256x192 cells, anchor (128,180), LEFT facing.\n'
 'Frames 0-3 anticipate; frames 4-7 strike/recover; frame 5 is ground contact. Same palette and scale as original boss.\n'
 'Two generated VFX masters assembled into 8-frame 192x192 atlases; soft alpha.\n'
 '512x256 phase cut-in, GIF preview, exact API workflows/prompts/seeds and reference input included.\n',encoding='utf-8')
shutil.make_archive(str(pack),'zip',pack);print(json.dumps({'package':str(pack)+'.zip','stompUniqueFrames':len(set(hashes)),'paletteColors':len(colors)}))
