"""Collect local jobs, queue background removal, retain provenance and contact previews."""
import json,time
from PIL import Image,ImageDraw
from run import HERE,ROOT,OUT,api
from export_frames import cutouts,raw_frames
actions=['idle','walk','charge','breath','claw','hurt','death']
def collect(names):
    pending=set(names)
    while pending:
        for name in list(pending):
            run=json.loads((HERE/(name+'-run.json')).read_text())
            h=api('/history/'+run['prompt_id']).get(run['prompt_id'])
            if h:
                (HERE/(name+'-history.json')).write_text(json.dumps(h,indent=2))
                assert h['status']['status_str']=='success',(name,h['status'])
                pending.remove(name);print('Completed '+name,flush=True)
        if pending:time.sleep(3)
collect(['boss-'+a+'-v1' for a in actions])
review=Image.new('RGB',(1280,len(actions)*132),'#171728');draw=ImageDraw.Draw(review)
for row,action in enumerate(actions):
    name='boss-'+action+'-v1';indices=[0,4,8,12,16,20,24,28] if action not in ['charge','death'] else [0,4,8,12,16,21,26,32]
    for col,index in enumerate(indices):
        im=Image.open(raw_frames(name)[index]).convert('RGB').resize((160,112))
        review.paste(im,(col*160,row*132+20))
    draw.text((4,row*132+3),action.upper(),fill='#ff8bd1')
    cutouts(name,indices)
review.save(ROOT/'outputs/Boss-Raw-Animations.jpg',quality=95)
collect(['boss-'+a+'-v1-cutouts' for a in actions])
print('All boss cutouts ready',flush=True)
