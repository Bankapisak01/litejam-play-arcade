"""Generate additional Punkman actions with the installed, offline Wan models."""
import json
from run import HERE, queue

IDENTITY = (
    'Pixel art game sprite animation, same chibi punk guitarist facing RIGHT in side view. '
    'Black and magenta spiky hair, pale face, black and pink jacket, black pants, '
    'pink boots with white soles, holding the same white electric guitar with both hands. ')
STABLE = (
    'Keep the face, hairstyle, clothing, guitar and body proportions unchanged. '
    'Fixed camera and orientation, full body visible with generous margins, no zoom. '
    'Single character alone on a flat solid gray background, crisp pixel art. '
    'Return to the original standing pose at the end. ')
ACTIONS = {
    'jump-v1': (2026110502,
        'One clear platformer jump in place: crouch deeply bending both knees, '
        'push off with both legs, rise into the air and tuck both knees under the body, '
        'hang briefly with boots lifted, extend legs while descending, '
        'land on both feet with a soft knee bend, stand again. '
        'The guitar stays firmly held across the chest. Exaggerated readable airborne leg poses. ',
        'walking, running, strumming, dancing, repeated jumps'),
    'dash-v1': (2026110503,
        'One explosive side-view dash toward the right, performed in place for a game sprite. '
        'Bend knees into a low crouch, lean the torso strongly forward to the right, '
        'push the trailing left leg straight behind, forward right knee tucked under chest. '
        'Hold a very low streamlined forward lunging pose for most of the animation, '
        'hair swept backward, guitar tucked close across the chest. '
        'Then brake by bending the front knee and recover to standing. '
        'Clear distinct anticipation, low forward dash, and recovery poses. ',
        'walking cycle, jogging, jumping upward, strumming, dancing'),
}
for name, (seed, action, negative) in ACTIONS.items():
    graph = json.loads((HERE / 'walk-v1-api.json').read_text())
    graph['17']['inputs']['text'] = IDENTITY + action + STABLE
    graph['18']['inputs']['text'] = (
        'camera movement, zoom, turning, rotating, facing left, facing camera, '
        'moving out of frame, cropped body, changing outfit, changing guitar, '
        'extra limbs, missing legs, floating guitar, blurry, photorealistic, 3d, '
        'scenery, floor, shadows, motion streaks, text, watermark, borders, ' + negative)
    for key in ['20', '21']:
        graph[key]['inputs']['noise_seed'] = seed
    graph['23']['inputs']['filename_prefix'] = name + '/raw-animation'
    graph['24']['inputs']['filename_prefix'] = name + '/frame'
    queue(name, graph)
