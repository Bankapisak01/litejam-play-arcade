"""Install the verified local sprites and package reusable source assets."""
import json
from pathlib import Path
import shutil
from PIL import Image, ImageDraw
from run import ROOT, OUT

assets=ROOT/'web-game-prototype/dist/assets'
bundles=[('walk-v1','walk'),('jump-v2','jump'),('dash-v1','dash')]
preview=Image.new('RGB',(1024,3*158),'#171728');draw=ImageDraw.Draw(preview)
for row,(name,action) in enumerate(bundles):
    source=OUT/name
    for extension in ['png','json']:
        shutil.copyfile(source/f'punkman-{action}-right.{extension}',assets/f'punkman-{action}-right.{extension}')
    sheet=Image.open(source/f'punkman-{action}-right.png').convert('RGBA')
    preview.paste(sheet,(0,row*158+24),sheet)
    draw.text((14,row*158+6),action.upper()+' / 8 FRAMES / 128 x 128',fill='#ff8bd1')
    if action!='walk':
        shutil.copyfile(ROOT/'workflows'/f'33_Punkman_Side_Walk_{name}.json',source/'workflow.json')
        (source/'README.txt').write_text(
            'Punkman '+action+' / 8 frames\n'
            'Generated locally with ComfyUI + Wan2.2 Q4_K_M + PixelAnimate LoRA.\n'
            'No cloud generation or paid inference API.\n'
            '128x128 cells, 1024x128 RGBA sheet, 64-color walk palette, binary transparency.\n'
            'Anchor (64,118). Flip horizontally for left-facing.\n'
            'The game controls action timing; GIF is a pose preview, not gameplay timing.\n'
            'workflow.json opens in ComfyUI; workflow-api.json is the actual generation graph.\n'
            'Source input: references/sprite-walk/punkman-walk-start.png.\n',encoding='utf-8')
preview.save(assets/'punkman-actions-preview.png')
preview.save(ROOT/'outputs/Punkman-Walk-Jump-Dash-Preview.png')
pack=ROOT/'outputs/Punkman-Jump-Dash-Sprites'
pack.mkdir(exist_ok=True)
for name,action in bundles[1:]:
    shutil.copytree(OUT/name,pack/action,dirs_exist_ok=True)
shutil.copyfile(ROOT/'references/sprite-walk/punkman-walk-start.png',pack/'punkman-walk-start.png')
shutil.copyfile(ROOT/'setup/sprite-walk/model-manifest.json',pack/'model-manifest.json')
shutil.make_archive(str(pack),'zip',pack)
print(json.dumps({'installed':str(assets),'sprite_zip':str(pack)+'.zip'}))
