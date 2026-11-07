"""Local FLUX Klein masters for Punkman's raster VFX; no external inference."""
import json
from run import HERE, ROOT, queue

style=('Premium 16-bit pixel art visual effect for a side scrolling action game. '
       'ONE isolated effect centered on a perfectly pure BLACK background. '
       'Crisp intentional pixel clusters, elegant energetic silhouette, bright white core, '
       'saturated neon colors with restrained glow. Entire effect visible with generous empty margins. '
       'No character, no weapon, no scene, no floor, no text, no labels, no border, no sprite sheet. ')
prompts={
 'bolt': 'A small cyan plasma projectile flying horizontally to the RIGHT. Bright rounded spearhead on the right, tapered comet flame tail trailing left, turquoise electric filaments, white-hot center. Wide horizontal shape, no vertical beam.',
 'charged-bolt': 'A powerful large horizontal plasma blast flying to the RIGHT. Rounded white-hot oval core at right, layered cyan and magenta plasma flames trailing left, sharp energy fins, violet inner shadows, a few small star sparks. Dense readable wide horizontal silhouette.',
 'slash': 'A single thick sweeping crescent sword slash. Convex bright cutting edge on the RIGHT, open hollow side on the LEFT. Pointed top and bottom tips, white leading edge, magenta pink violet layered ribbons following the curve, detached hot pink sparks. Tall vertical crescent silhouette, not a full circle.',
 'charge': 'A circular power charging aura. Large EMPTY BLACK center for a character to stand inside. Two broken concentric neon cyan and magenta orbital rings with diamond sparks, small electric arcs, rising flame wisps along outer rim. Clear donut silhouette, energetic and symmetrical, no solid center.',
 'impact': 'An explosive hit spark starburst. White central diamond with sharp asymmetrical cyan and hot pink rays, chunky glowing pixel shards shooting outward. Compact circular explosion, several small detached star sparks. No smoke.',
 'ultimate': 'A huge powerful rainbow energy crescent blade. Convex leading edge points RIGHT and open side LEFT. Brilliant white cutting edge, layered fuchsia violet blue cyan green and gold ribbons forming one continuous thick crescent, fiery pointed tips and rainbow plasma fragments trailing left. Spectacular luminous sharp vertical crescent, not a circle.'
}
base=json.loads((ROOT/'setup/text-edit-api.json').read_text())
def graph_for(prompt,seed,w=768,h=768):
    graph={k:v for k,v in json.loads(json.dumps(base)).items() if k in ['3','4','5','6','7','17','18','19','20','21','22','23','24']}
    graph['6']['inputs']['text']=prompt
    graph['17']['inputs'].update(width=w,height=h,batch_size=1)
    graph['18']['inputs']['noise_seed']=seed
    graph['20']['inputs'].update(width=w,height=h,steps=4)
    graph['21']['inputs'].update(positive=['6',0],negative=['7',0])
    return graph
for i,(name,prompt) in enumerate(prompts.items()):
    graph=graph_for(style+prompt,2026110701+i)
    graph['24']['inputs']['filename_prefix']='vfx-v1/'+name
    queue('vfx-'+name+'-v1',graph)

cutin=json.loads(json.dumps(base))
cutin['1']['inputs']['image']='punkman-walk-start.png'
cutin['6']['inputs']['text']=(
 'Use the exact Punkman from the reference as the hero in a dramatic 16-bit pixel-art game ultimate cut-in. '
 'Wide horizontal composition. Large chest-up portrait occupies the LEFT half, facing RIGHT, '
 'determined expression, same pale face, huge black and magenta spiky hair, black pink jacket and white guitar. '
 'The head and hair are fully visible inside the image. Sharp detailed pixel art, handsome expressive face. '
 'Diagonal magenta and cyan speed lines on deep violet black behind him, small rainbow sparks. '
 'RIGHT half is mostly clean dark purple space for a title to be added later. '
 'No text, no words, no letters, no logo, no frame. Cinematic heroic composition.')
cutin['17']['inputs'].update(width=1024,height=512)
cutin['20']['inputs'].update(width=1024,height=512)
cutin['18']['inputs']['noise_seed']=2026110710
cutin['24']['inputs']['filename_prefix']='vfx-v1/cutin'
queue('vfx-cutin-v1',cutin)
