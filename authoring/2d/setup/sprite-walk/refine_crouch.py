import json
from run import HERE,queue
g=json.loads((HERE/'crouch-v1-api.json').read_text())
g['17']['inputs']['text']=(
 'Pixel art side-view game sprite, same magenta-haired punk guitarist facing RIGHT. '
 'A very LOW ducking crouch. He drops down onto ONE KNEE, kneeling close to the ground. '
 'Right knee touches the ground. Left foot stays planted with left knee bent sharply. '
 'Hips almost touch the heels. Torso folds forward over his thighs. '
 'His head is much LOWER than in standing, at about two-thirds of its original height. '
 'He holds the white guitar low across his thighs, guitar almost horizontal. '
 'Hold this very low kneeling cover pose for most of the video, then stand up. '
 'Keep the black and pink jacket, pink boots, face and hairstyle identical. '
 'Whole body visible, same size, static camera, facing right throughout, solid gray background.')
g['18']['inputs']['text']+=', standing upright, straight legs, shallow squat, tiny knee bend, walking, jumping'
for key in ['20','21']:g[key]['inputs']['noise_seed']=2026110622
g['23']['inputs']['filename_prefix']='crouch-v2/raw-animation'
g['24']['inputs']['filename_prefix']='crouch-v2/frame'
queue('crouch-v2',g)
