import json
from PIL import Image
from run import ROOT,HERE,INPUT,queue

master=Image.open(ROOT/'outputs/sprite-walk/raw/boss-v1/master_00001_.png').convert('RGB')
canvas=Image.new('RGB',(640,448),master.getpixel((0,0)))
master.thumbnail((600,400),Image.Resampling.NEAREST)
canvas.paste(master,((640-master.width)//2,416-master.height))
canvas.save(INPUT/'boss-animation-start.png')
style=('High quality 16-bit pixel art game effect. ONE isolated energy effect on a perfectly pure BLACK background. '
       'Crisp bright pixel clusters, white highlights, neon cyan and magenta violet palette matching a blue mechanical dragon. '
       'Whole effect centered with wide empty margins. No character, no scenery, no text, no sprite sheet. ')
prompts={
 'boss-breath':'A sonic plasma fireball flying LEFT. Bright round cyan white head on the LEFT with a glowing magenta musical eighth-note symbol in its core. Long jagged purple pink electric flame tail tapers to the RIGHT. Horizontal shape.',
 'boss-claw':'Three parallel curved dragon claw energy slashes raking from upper RIGHT toward lower LEFT. Sharp white cyan leading edges with thick magenta violet wakes, small electric shards. Three separated elegant crescents, diagonal composition.',
 'boss-charge':'A circular sonic charging ring with a LARGE EMPTY BLACK center. Broken cyan concentric arcs, purple magenta electric flames around the rim, small golden musical note sparks at the outer edges. Readable donut silhouette.'
}
for i,(name,prompt) in enumerate(prompts.items()):
    graph=json.loads((HERE/'vfx-charged-bolt-v1-api.json').read_text())
    graph['6']['inputs']['text']=style+prompt
    graph['18']['inputs']['noise_seed']=2026110840+i
    graph['24']['inputs']['filename_prefix']='boss-v1/'+name
    queue('fx-'+name+'-v1',graph)
