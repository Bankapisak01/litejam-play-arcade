"""Select real generated frames, remove backgrounds locally, and export pixel sprites."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import numpy as np
from PIL import Image, ImageDraw
from run import HERE, ROOT, OUT, INPUT, api, node, queue

def raw_frames(name):
    history = json.loads((HERE / (name + '-history.json')).read_text())
    return [OUT / 'raw' / x['subfolder'] / x['filename']
            for x in history['outputs']['24']['images']]

def contact(name):
    files = raw_frames(name)
    sheet = Image.new('RGB', (8*160, ((len(files)+7)//8)*182), '#171728')
    draw = ImageDraw.Draw(sheet)
    for i, file in enumerate(files):
        x, y = i % 8*160, i // 8*182
        sheet.paste(Image.open(file).convert('RGB').resize((156,156)), (x+2,y+2))
        draw.text((x+5,y+161), f'{i:02}', fill='white')
    sheet.save(OUT / (name + '-all-frames.jpg'), quality=95)
    print(OUT / (name + '-all-frames.jpg'))

def cutouts(name, indices):
    files = raw_frames(name)
    graph = {'1': node('LoadBackgroundRemovalModel', bg_removal_name='birefnet.safetensors')}
    previous = None
    next_id = 10
    for slot, index in enumerate(indices):
        filename = f'{name}-selected-{slot:02}.png'
        shutil.copyfile(files[index], INPUT / filename)
        key = str(next_id)
        graph[key] = node('LoadImage', image=filename)
        next_id += 1
        if previous is None:
            previous = [key, 0]
        else:
            batch = str(next_id)
            graph[batch] = node('ImageBatch', image1=previous, image2=[key, 0])
            previous = [batch, 0]
            next_id += 1
    graph['100'] = node('RemoveBackground', bg_removal_model=['1', 0], image=previous)
    graph['101'] = node('InvertMask', mask=['100', 0])
    graph['102'] = node('JoinImageWithAlpha', image=previous, alpha=['101', 0])
    graph['103'] = node('SaveImage', images=['102', 0], filename_prefix=name+'/cutouts/frame')
    (HERE / (name+'-selection.json')).write_text(json.dumps(indices))
    queue(name+'-cutouts', graph)

def export(name):
    history = json.loads((HERE / (name+'-cutouts-history.json')).read_text())
    files = [OUT / 'raw' / x['subfolder'] / x['filename']
             for x in history['outputs']['103']['images']]
    assert len(files) == 8
    frames = [Image.open(file).convert('RGBA') for file in files]
    # Use one scale for the whole animation, and a common floor.
    bounds = [im.getchannel('A').point(lambda x: 255 if x>=128 else 0).getbbox() for im in frames]
    max_height = max(b[3]-b[1] for b in bounds)
    max_width = max(b[2]-b[0] for b in bounds)
    scale = min(106/max_height, 110/max_width)
    aligned = []
    for im, box in zip(frames, bounds):
        crop = im.crop(box)
        crop = crop.resize((round(crop.width*scale), round(crop.height*scale)), Image.Resampling.BOX)
        crop.putalpha(crop.getchannel('A').point(lambda x: 255 if x>=128 else 0))
        canvas = Image.new('RGBA', (128,128))
        canvas.alpha_composite(crop, ((128-crop.width)//2, 118-crop.height))
        aligned.append(canvas)
    # A single shared palette prevents per-frame color changes.
    atlas_rgb = Image.new('RGB', (128*8,128), '#12111c')
    for i, im in enumerate(aligned):
        atlas_rgb.paste(im, (i*128,0), im)
    palette = atlas_rgb.quantize(colors=64, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    palette_data = palette.getpalette()[:192]
    palette.putpalette(palette_data + palette_data[-3:] * 192)
    final = []
    for im in aligned:
        color = im.convert('RGB').quantize(palette=palette, dither=Image.Dither.NONE).convert('RGBA')
        color.putalpha(im.getchannel('A'))
        arr = np.array(color)
        arr[arr[:,:,3]==0,:3] = 0
        final.append(Image.fromarray(arr))
    dest = OUT / name
    (dest/'frames').mkdir(parents=True, exist_ok=True)
    sheet = Image.new('RGBA', (1024,128))
    for i, im in enumerate(final):
        im.save(dest/'frames'/f'walk-right-{i:02}.png')
        sheet.alpha_composite(im, (i*128,0))
    sheet.save(dest/'punkman-walk-right.png')
    final[0].save(dest/'punkman-walk-right.apng', save_all=True, append_images=final[1:],
                  duration=125, loop=0, disposal=0, blend=0)
    preview = []
    for im in final:
        bg = Image.new('RGB', (128,128), '#171728')
        bg.paste(im, (0,0), im)
        preview.append(bg.resize((512,512), Image.Resampling.NEAREST))
    preview[0].save(dest/'punkman-walk-preview.gif', save_all=True, append_images=preview[1:],
                    duration=[120,130]*4, loop=0, disposal=2)
    review = Image.new('RGB',(4*384,2*414),'#171728')
    draw = ImageDraw.Draw(review)
    for i, im in enumerate(final):
        x,y = i%4*384,i//4*414
        bg=Image.new('RGB',(128,128),'#282839')
        bg.paste(im,(0,0),im)
        review.paste(bg.resize((384,384),Image.Resampling.NEAREST),(x,y))
        draw.text((x+12,y+392),f'WALK RIGHT  {i+1:02} / 08',fill='#f986cf')
    review.save(dest/'punkman-walk-contact-sheet.png')
    hashes=[hashlib.sha256(im.tobytes()).hexdigest() for im in final]
    colors={tuple(pixel[:3]) for im in final for pixel in np.array(im).reshape(-1,4) if pixel[3]}
    validation={'frames':8,'unique_frames':len(set(hashes)),'frame_size':[128,128],
                'sheet_size':[1024,128],'opaque_colors':len(colors),'fps':8,
                'binary_alpha':all(set(np.unique(np.array(im)[:,:,3])) <= {0,255} for im in final),
                'source_indices':json.loads((HERE/(name+'-selection.json')).read_text()),
                'sha256_per_frame':hashes}
    assert validation['unique_frames']==8 and validation['opaque_colors']<=64 and validation['binary_alpha']
    (dest/'validation.json').write_text(json.dumps(validation,indent=2))
    atlas={'frames':{f'walk-right-{i:02}.png':{'frame':{'x':i*128,'y':0,'w':128,'h':128},
           'rotated':False,'trimmed':False,'spriteSourceSize':{'x':0,'y':0,'w':128,'h':128},
           'sourceSize':{'w':128,'h':128},'duration':125} for i in range(8)},
           'meta':{'image':'punkman-walk-right.png','format':'RGBA8888','size':{'w':1024,'h':128},
                   'scale':'1','frameTags':[{'name':'walk-right','from':0,'to':7,'direction':'forward'}]}}
    (dest/'punkman-walk-right.json').write_text(json.dumps(atlas,indent=2))
    print(json.dumps(validation,indent=2))

if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('action',choices=['contact','cutouts','export'])
    p.add_argument('name',default='walk-v1',nargs='?')
    p.add_argument('--indices',default='0,4,8,12,16,20,24,28')
    args=p.parse_args()
    if args.action=='contact': contact(args.name)
    elif args.action=='cutouts': cutouts(args.name,[int(v) for v in args.indices.split(',')])
    else: export(args.name)
