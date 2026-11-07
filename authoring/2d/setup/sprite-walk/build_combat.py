"""Generate combat animations with the existing offline ComfyUI models."""
import json
from run import HERE, queue

identity=('Pixel art game sprite animation. The exact same chibi punk guitarist facing RIGHT. '
          'Black and magenta spiky hair, pale face, black pink jacket, black trousers, pink boots, '
          'white electric guitar. Keep the character design and proportions unchanged. ')
actions={
 'crouch': 'Crouch deeply: bend BOTH knees, lower the hips and head, spread knees outward, '
           'both boots planted on the floor. Hold a low compact crouching pose for most of the clip. '
           'Both hands hold the guitar horizontally at waist level. Then stand up again. ',
 'shoot': 'One powerful guitar strum attack. Keep feet planted in a wide combat stance. '
          'Left hand grips guitar neck pointing right, right picking hand lifts away from the strings, '
          'then swings DOWN across the strings in one dramatic strum. Lean slightly into the strum, '
          'follow through with the right hand below the guitar, then return to the ready stance. ',
 'slash': 'One powerful melee swing using the white electric guitar as a sword. '
          'Both hands grip the guitar neck. Wind the guitar back up over the left shoulder, '
          'then swing the entire guitar in a big downward diagonal arc toward the RIGHT. '
          'Twist torso slightly, bend knees into a strong forward lunge. '
          'End with the guitar low to the right, then return to the ready stance. ',
 'special': 'One spectacular finishing guitar attack. Raise the guitar up high with both hands, '
            'brace both feet firmly apart, then sweep it forward and down toward the right '
            'with a powerful full body strum and forward lunge. Hold a triumphant strong follow-through, '
            'then return to the ready stance. '
}
for index,(action,prompt) in enumerate(actions.items()):
    name=action+'-v1'
    graph=json.loads((HERE/'walk-v1-api.json').read_text())
    graph['17']['inputs']['text']=identity+prompt+(
        'Static right-facing side-view camera, entire body and guitar always visible, generous margins. '
        'Stay centered in place, flat solid gray background. Crisp pixel art. No visual effects. '
        'One action with distinct anticipation, action and recovery poses.')
    graph['18']['inputs']['text']=(
        'camera movement, zoom, turning to face camera, facing left, walking, running, '
        'moving across screen, cropped head, cropped guitar, extra hands, extra limbs, '
        'different clothing, missing guitar, detached guitar, photorealistic, 3d, blurry, '
        'background scenery, floor, shadows, text, watermark, energy effects, sparks, glow, trails')
    for key in ['20','21']:graph[key]['inputs']['noise_seed']=2026110601+index
    graph['23']['inputs']['filename_prefix']=name+'/raw-animation'
    graph['24']['inputs']['filename_prefix']=name+'/frame'
    queue(name,graph)
