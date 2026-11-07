import json
from run import HERE, queue
graph=json.loads((HERE/'jump-v1-api.json').read_text())
graph['17']['inputs']['text']=(
    'Pixel art platformer game sprite. The same small punk guitarist faces RIGHT. '
    'Black and magenta spiky hair, black pink jacket, pink boots, white guitar. '
    'A single vertical jump in place. Bend BOTH knees, spring upward with BOTH feet, '
    'then tuck BOTH knees up together underneath the body. '
    'Both boots stay underneath the hips, toes point downward, neither leg kicks forward. '
    'Hold this compact airborne pose with BOTH knees bent for a moment. '
    'Then straighten both legs downward, descend and land on BOTH feet, bend knees, stand again. '
    'Hands keep holding the guitar securely across the chest at the same angle throughout. '
    'Fixed right-facing side view, fixed camera, full body visible, no horizontal travel. '
    'Crisp pixel sprite on plain solid gray background. Stable character design and proportions.')
graph['18']['inputs']['text']+=(
    ', kicking, high kick, one leg straight forward, martial arts, dancing, '
    'guitar solo, tilted guitar, running, split legs, leg pointing horizontally')
for k in ['20','21']: graph[k]['inputs']['noise_seed']=2026110512
graph['23']['inputs']['filename_prefix']='jump-v2/raw-animation'
graph['24']['inputs']['filename_prefix']='jump-v2/frame'
queue('jump-v2',graph)
