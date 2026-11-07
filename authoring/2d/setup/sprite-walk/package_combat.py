import json
import shutil
from PIL import Image,ImageDraw
from run import ROOT,OUT

actions=['crouch','shoot','slash','special']
assets=ROOT/'web-game-prototype/dist/assets'
pack=ROOT/'outputs/Punkman-Combat-Sprites';pack.mkdir(exist_ok=True)
preview=Image.new('RGB',(1024,4*158),'#171728');draw=ImageDraw.Draw(preview)
for row,action in enumerate(actions):
    name=action+('-v2' if action=='crouch' else '-v1');source=OUT/name
    for ext in ['png','json']:
        shutil.copyfile(source/f'punkman-{action}-right.{ext}',assets/f'punkman-{action}-right.{ext}')
    sheet=Image.open(source/f'punkman-{action}-right.png').convert('RGBA')
    preview.paste(sheet,(0,row*158+24),sheet)
    draw.text((12,row*158+6),action.upper()+' / 8 FRAMES / 128 x 128',fill='#ff8bd1')
    shutil.copyfile(ROOT/'setup/sprite-walk'/f'{name}-ui.json',source/'workflow.json')
    shutil.copytree(source,pack/action,dirs_exist_ok=True)
preview.save(assets/'punkman-combat-preview.png')
preview.save(ROOT/'outputs/Punkman-Combat-Sprites-Preview.png')
shutil.copyfile(ROOT/'references/sprite-walk/punkman-walk-start.png',pack/'punkman-walk-start.png')
shutil.copyfile(ROOT/'setup/sprite-walk/model-manifest.json',pack/'model-manifest.json')
(pack/'README.txt').write_text('Punkman local combat sprites\n4 actions x 8 frames, 128x128 cells, anchor (64,118).\n'
  'Generated on localhost:8187 with ComfyUI/Wan2.2 GGUF + PixelAnimate. No paid inference API.\n'
  '64-color palette shared with the walk; binary transparent background.\n'
  'workflow.json opens in ComfyUI. Copy punkman-walk-start.png to its input directory.\n'
  'The game supplies charge glow, melee arcs and the rainbow ultimate as Canvas effects.\n'
  'PNG/JSON files are reusable. GIF timing is a review preview, not gameplay timing.\n',encoding='utf-8')
shutil.make_archive(str(pack),'zip',pack)
print(json.dumps({'assets':str(assets),'zip':str(pack)+'.zip'}))
