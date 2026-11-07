"""Local FLUX phase effects/cut-in and a real Wan Sonic Quake animation."""
import json
from run import HERE,ROOT,queue
style=('Spectacular 16-bit pixel art game visual effect, ONE isolated effect centered on perfectly pure BLACK. '
 'Sharp readable pixel clusters, bright cyan white core, saturated magenta violet energy and small orange sparks. '
 'Entire effect visible with generous black margins, no character, no text, no border, no sprite sheet. ')
for i,(name,prompt) in enumerate({
 'boss-overdrive':'An explosive circular OVERDRIVE transformation aura: a large EMPTY BLACK central hole for a dragon boss, jagged electric crown flames radiating outward, two broken concentric neon rings, four long diagonal lightning spikes. Spectacular powerful radial silhouette, no solid center.',
 'boss-quake':'A ground-traveling sonic shockwave. One compact round rolling cyan plasma ring with a hollow violet dark center and magenta flame rim, jagged ground sparks at its flat base. Symmetrical circular core CENTERED in the image, no trailing tail, no floor. Readable spherical energy wheel.'
}.items()):
    graph=json.loads((HERE/'vfx-charged-bolt-v1-api.json').read_text())
    graph['6']['inputs']['text']=style+prompt
    graph['18']['inputs']['noise_seed']=2026110910+i
    graph['24']['inputs']['filename_prefix']='boss-phase2/'+name
    queue('fx-'+name+'-v1',graph)
graph=json.loads((ROOT/'setup/text-edit-api.json').read_text())
graph['1']['inputs']['image']='boss-animation-start.png'
graph['6']['inputs']['text']=(
 'The same BLUE mechanical dragon from the reference in a dramatic ultimate boss phase-two cut-in. '
 'Keep its orange eye, long blue armored snout, silver fangs and magenta dorsal spikes. '
 'Large close-up roaring dragon head and shoulders on the LEFT half, facing LEFT. '
 'Intense orange eye with golden highlights, cobalt blue and magenta armor, electric cyan rim light. '
 'Wide cinematic 16-bit pixel art, crisp pixels. Abstract dark purple black background with diagonal pink cyan lightning lines. '
 'RIGHT half mostly empty deep purple space for a title to be added later. No text, no words, no UI, no frame.')
graph['17']['inputs'].update(width=1024,height=512);graph['20']['inputs'].update(width=1024,height=512)
graph['18']['inputs']['noise_seed']=2026110912;graph['24']['inputs']['filename_prefix']='boss-phase2/cutin'
queue('boss-phase2-cutin-v1',graph)
graph=json.loads((HERE/'boss-claw-v1-api.json').read_text())
graph['17']['inputs']['text']=(
 'Pixel art animation of the EXACT SAME blue mechanical dragon boss, facing LEFT in side view. '
 'Same four legs, orange eye, magenta armored dorsal spikes, blue segmented neck and long metal tail. '
 'One powerful ground slam: brace rear legs, lift BOTH front legs and raise the heavy chest high, '
 'pause with front claws high in the air, then slam BOTH front claws down onto the floor at the same time. '
 'The shoulders compress and head drops with the impact, then recover to the original four-legged stance. '
 'Distinct anticipation and heavy impact. Entire body always visible with generous margins, fixed camera and size. '
 'Flat solid neutral gray background. Crisp 16-bit pixels. No glow, no energy, no effects, no floor, no text.')
for key in ['20','21']:graph[key]['inputs']['noise_seed']=2026110913
graph['23']['inputs']['filename_prefix']='boss-stomp-v1/raw-animation';graph['24']['inputs']['filename_prefix']='boss-stomp-v1/frame'
queue('boss-stomp-v1',graph)
