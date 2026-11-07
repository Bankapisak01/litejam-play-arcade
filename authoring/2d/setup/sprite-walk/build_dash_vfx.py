"""Generate the missing dash wake with the installed local FLUX model."""
import json
from run import HERE, queue

graph=json.loads((HERE/'vfx-charged-bolt-v1-api.json').read_text())
graph['6']['inputs']['text']=(
    'Premium 16-bit pixel art DASH SPEED EFFECT for a side scrolling action game. '
    'ONE isolated horizontal energy wake centered on perfectly pure BLACK. '
    'The character dashes to the RIGHT: a thin curved cyan pressure ring at the RIGHT end, '
    'long tapered magenta and cyan flame speed streaks trail far to the LEFT. '
    'Hollow BLACK inside the pressure ring, sharp white edge accents, small detached pixel sparks. '
    'Wide horizontal silhouette, about three times wider than tall. Bright saturated neon pink and turquoise. '
    'Crisp chunky pixel clusters, restrained glow, generous empty margins, entire effect visible. '
    'No character, no weapon, no projectile ball, no scene, no floor, no text, no labels, no border, no sprite sheet.')
graph['18']['inputs']['noise_seed']=2026110721
graph['24']['inputs']['filename_prefix']='vfx-v1/dash'
queue('vfx-dash-v1',graph)
