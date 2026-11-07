"""Export selected local generations on the same pixel grid/palette as the walk."""
import argparse
import hashlib
import json
import shutil
import numpy as np
from PIL import Image, ImageDraw
from run import HERE, OUT

def images_for(name):
    history=json.loads((HERE/(name+'-cutouts-history.json')).read_text())
    return [Image.open(OUT/'raw'/item['subfolder']/item['filename']).convert('RGBA')
            for item in history['outputs']['103']['images']]

def bounds(im):
    return im.getchannel('A').point(lambda a:255 if a>=128 else 0).getbbox()

def export(name, action):
    originals=images_for('walk-v1')
    boxes=[bounds(im) for im in originals]
    scale=min(106/max(b[3]-b[1] for b in boxes),110/max(b[2]-b[0] for b in boxes))
    walk=Image.open(OUT/'walk-v1/punkman-walk-right.png').convert('RGBA')
    colors=sorted({tuple(p[:3]) for p in np.array(walk).reshape(-1,4) if p[3]})
    palette=Image.new('P',(1,1))
    palette.putpalette([v for c in colors+[colors[-1]]*(256-len(colors)) for v in c])
    frames=[]
    for im in images_for(name):
        crop=im.crop(bounds(im))
        crop=crop.resize((round(crop.width*scale),round(crop.height*scale)),Image.Resampling.BOX)
        assert crop.width<=124 and crop.height<=118, 'Action exceeds cell at the walk scale'
        crop.putalpha(crop.getchannel('A').point(lambda a:255 if a>=128 else 0))
        cell=Image.new('RGBA',(128,128))
        # Remove generated screen travel: gameplay supplies the actual trajectory.
        # One scale for all actions preserves crouches and tucked leg silhouettes.
        cell.alpha_composite(crop,((128-crop.width)//2,118-crop.height))
        quantized=cell.convert('RGB').quantize(palette=palette,dither=Image.Dither.NONE).convert('RGBA')
        quantized.putalpha(cell.getchannel('A'))
        pixels=np.array(quantized);pixels[pixels[:,:,3]==0,:3]=0
        frames.append(Image.fromarray(pixels))
    count=len(frames);dest=OUT/name;(dest/'frames').mkdir(parents=True,exist_ok=True)
    sheet=Image.new('RGBA',(128*count,128))
    review=Image.new('RGB',(4*256,((count+3)//4)*282),'#171728');draw=ImageDraw.Draw(review)
    previews=[]
    for i,im in enumerate(frames):
        im.save(dest/'frames'/f'{action}-right-{i:02}.png');sheet.alpha_composite(im,(i*128,0))
        bg=Image.new('RGB',(128,128),'#282839');bg.paste(im,(0,0),im)
        review.paste(bg.resize((256,256),Image.Resampling.NEAREST),(i%4*256,i//4*282))
        draw.text((i%4*256+8,i//4*282+263),f'{action.upper()}  {i:02}',fill='#ff8bd1')
        previews.append(bg.resize((384,384),Image.Resampling.NEAREST))
    stem=f'punkman-{action}-right'
    sheet.save(dest/(stem+'.png'));review.save(dest/(stem+'-contact.png'))
    previews[0].save(dest/(stem+'-preview.gif'),save_all=True,append_images=previews[1:],duration=100,loop=0,disposal=2)
    atlas={'frames':{f'{action}-right-{i:02}.png':{'frame':{'x':i*128,'y':0,'w':128,'h':128},
        'rotated':False,'trimmed':False,'spriteSourceSize':{'x':0,'y':0,'w':128,'h':128},
        'sourceSize':{'w':128,'h':128},'duration':100} for i in range(count)},
        'meta':{'image':stem+'.png','format':'RGBA8888','size':{'w':128*count,'h':128},'scale':'1',
                'anchor':{'x':64,'y':118},'frameTags':[{'name':action+'-right','from':0,'to':count-1,'direction':'forward'}]}}
    (dest/(stem+'.json')).write_text(json.dumps(atlas,indent=2))
    hashes=[hashlib.sha256(im.tobytes()).hexdigest() for im in frames]
    validation={'action':action,'frames':count,'unique_frames':len(set(hashes)),'frame_size':[128,128],
        'sheet_size':list(sheet.size),'scale_from_512':scale,'same_palette_as_walk':True,
        'binary_alpha':all(set(np.unique(np.array(im)[:,:,3]))<={0,255} for im in frames),
        'source_indices':json.loads((HERE/(name+'-selection.json')).read_text()),'sha256_per_frame':hashes}
    assert validation['unique_frames']==count and validation['binary_alpha']
    (dest/'validation.json').write_text(json.dumps(validation,indent=2))
    shutil.copyfile(HERE/(name+'-api.json'),dest/'workflow-api.json')
    print(json.dumps(validation,indent=2))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('name');parser.add_argument('action')
    args=parser.parse_args();export(args.name,args.action)
