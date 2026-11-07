"""Reference-guided local boss art and Wan animation jobs. No external inference."""
import json,sys,shutil
from PIL import Image
from run import ROOT,HERE,INPUT,queue

identity=('The EXACT SAME quadruped mechanical dragon boss from the reference. '
 'Facing LEFT in side view. Cobalt blue segmented armor, purple-magenta spikes along neck and back, '
 'orange glowing eye, silver fangs, long armored neck, heavy shoulders, four clawed legs and long metal tail. ')
def master():
    src=ROOT/'references/sprite-walk/boss-reference.png'
    shutil.copyfile('C:/Users/User/AppData/Local/Temp/codex-clipboard-f4377987-4b9b-49e7-b2e3-c1794f2a475e.png',src)
    graph=json.loads((ROOT/'setup/text-edit-api.json').read_text())
    graph['1']['inputs']['image']='boss-reference.png'
    graph['6']['inputs']['text']=(identity+
      'Create a clean FULL BODY 16-bit pixel-art sprite of this boss, reconstruct all cropped legs and tail. '
      'Entire dragon visible centered with 12 percent empty margins, feet on one baseline. '
      'Low powerful four-legged stance, long head and neck extend toward the LEFT, tail extends to the RIGHT. '
      'Preserve the distinctive sharp angular blue snout, round shoulder armor, magenta dorsal spikes and orange eye. '
      'Bold readable pixel clusters, dark navy outline, limited rich palette. '
      'Flat solid neutral GRAY background #808080. No floor, no shadow, no effects, no notes, no text, no health bar, no UI.')
    graph['17']['inputs'].update(width=768,height=512)
    graph['20']['inputs'].update(width=768,height=512)
    graph['18']['inputs']['noise_seed']=2026110801
    graph['24']['inputs']['filename_prefix']='boss-v1/master'
    queue('boss-master-v1',graph)

actions={
 'idle':'Calm menacing idle breathing loop: shoulder armor rises and falls subtly, neck flexes, head bobs slightly, tail tip sways. All four feet remain planted. Mouth mostly closed.',
 'walk':'One heavy quadruped walking-in-place cycle. Four mechanical legs take clearly alternating steps, knees bend, clawed feet lift and plant. Shoulders bob heavily and the tail counterbalances. Stay centered without sliding across the image.',
 'charge':'Charge a powerful breath attack: brace and lower the front legs, arch the back, slowly pull the head backward and raise the neck, spread the jaw wider. Hold the charged anticipation near the end. No glow or effects.',
 'breath':'One fierce breath attack without any flame effect: thrust the long neck and head forward toward the LEFT, open the jaw very wide, recoil the shoulders from a forceful roar, then recover into the original stance.',
 'claw':'One powerful front-claw attack toward the LEFT. Lift the near front arm high with claws spread, sweep it forward and downward in a large arc, lunge shoulders forward, then plant the claw back on the floor. Other legs brace the body.',
 'hurt':'One brief hit reaction: jerk the head and shoulders backward toward the RIGHT, bend front knees, open jaw in pain, then recover to the original ready stance. Feet stay near their original positions.',
 'death':'A defeat collapse: legs buckle, the heavy body and head drop onto the ground, neck lies low, jaw opens, tail settles. Stay collapsed at the end. Mechanical dragon remains intact. No explosion and no effects.'
}
def animate():
    for i,(name,action) in enumerate(actions.items()):
        graph=json.loads((HERE/'walk-v1-api.json').read_text())
        graph['2']['inputs']['image']='boss-animation-start.png'
        graph['17']['inputs']['text']=identity+action+(' Crisp pixel art. Static camera, keep the same size, proportions and facing direction. Entire body including feet, head and tail visible throughout. Flat solid neutral gray background. No scene, no visual effects, no UI. Distinct articulated limb and neck motion, not a sliding still picture.')
        graph['18']['inputs']['text']='camera motion, zoom, facing right, rotating, turning to camera, human, two legs, extra legs, missing limbs, changing design, cropped tail, cropped feet, moving across screen, glow, fire, sparks, background scenery, floor, shadow, health bar, words, text, blur, photorealistic'
        graph['19']['inputs'].update(width=640,height=448,length=33)
        if name in ['charge','death']:graph['19']['inputs'].pop('end_image',None)
        for key in ['20','21']:graph[key]['inputs']['noise_seed']=2026110810+i
        graph['23']['inputs']['filename_prefix']='boss-'+name+'-v1/raw-animation'
        graph['24']['inputs']['filename_prefix']='boss-'+name+'-v1/frame'
        queue('boss-'+name+'-v1',graph)

if __name__=='__main__':
    master() if sys.argv[1]=='master' else animate()
