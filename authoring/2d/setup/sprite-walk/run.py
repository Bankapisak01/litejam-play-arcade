"""Local ComfyUI sprite experiment. No cloud inference endpoints."""
import argparse
import json
from pathlib import Path
import urllib.error
import urllib.request
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
OUT = ROOT / 'outputs/sprite-walk'
INPUT = ROOT / 'references/sprite-walk'
BASE = 'http://127.0.0.1:8187'

def api(path, payload=None):
    data = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(BASE + path, data=data, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            return json.load(res)
    except urllib.error.HTTPError as err:
        print(err.read().decode())
        raise

def queue(name, graph):
    (HERE / (name + '-api.json')).write_text(json.dumps(graph, indent=2))
    result = api('/prompt', {'prompt': graph, 'client_id': 'punkman-local-sprite-test'})
    (HERE / (name + '-run.json')).write_text(json.dumps(result, indent=2))
    print(json.dumps(result))

def node(kind, **inputs):
    return {'class_type': kind, 'inputs': inputs}

def prep():
    src = Image.open(ROOT / 'references/sprite-walk/punkman-reference.png')
    crop = src.crop((403, 125, 708, 462)).convert('RGB')
    crop.save(INPUT / 'punkman-walk-crop.png')
    crop.save(OUT / 'reference-crop.png')
    graph = {'1': node('LoadImage', image='punkman-walk-crop.png'),
             '2': node('LoadBackgroundRemovalModel', bg_removal_name='birefnet.safetensors'),
             '3': node('RemoveBackground', bg_removal_model=['2', 0], image=['1', 0]),
             '4': node('InvertMask', mask=['3', 0]),
             '5': node('JoinImageWithAlpha', image=['1', 0], alpha=['4', 0]),
             '6': node('SaveImage', images=['5', 0], filename_prefix='prep/punkman-cutout')}
    queue('prep', graph)

def status(name):
    run = json.loads((HERE / (name + '-run.json')).read_text())
    history = api('/history/' + run['prompt_id'])
    if not history:
        pending = api('/queue')
        print(json.dumps({'history': None, 'running_ids': [x[1] for x in pending['queue_running']],
                          'pending_count': len(pending['queue_pending'])}))
        return
    entry = history[run['prompt_id']]
    (HERE / (name + '-history.json')).write_text(json.dumps(entry, indent=2))
    summary = {k: {kind: len(value) if isinstance(value, list) else value
                   for kind, value in v.items()} for k, v in entry.get('outputs', {}).items()}
    print(json.dumps({'status': entry['status'], 'outputs': summary}))

def build_walk():
    cutout = Image.open(OUT / 'raw/prep/punkman-cutout_00001_.png').convert('RGBA')
    cutout = cutout.crop(cutout.getchannel('A').getbbox())
    scale = 368 / cutout.height
    cutout = cutout.resize((round(cutout.width*scale), 368), Image.Resampling.NEAREST)
    canvas = Image.new('RGB', (512, 512), (128, 128, 128))
    canvas.paste(cutout, ((512-cutout.width)//2, 432-cutout.height), cutout)
    canvas.save(INPUT / 'punkman-walk-start.png')
    canvas.save(OUT / 'walk-start.png')
    graph = json.loads((HERE / 'upstream-loop-template.json').read_text(encoding='utf-8-sig'))
    graph = {k: v for k, v in graph.items() if 7 <= int(k) <= 23}
    graph['2'] = node('LoadImage', image='punkman-walk-start.png')
    graph['7']['inputs']['clip_name'] = 'umt5_xxl_fp8_e4m3fn_scaled.safetensors'
    graph['9']['inputs']['unet_name'] = 'Wan2.2-I2V-A14B-HighNoise-Q4_K_M.gguf'
    graph['13']['inputs']['unet_name'] = 'Wan2.2-I2V-A14B-LowNoise-Q4_K_M.gguf'
    graph['10']['inputs']['lora_name'] = 'wan22_lightning_high_noise_model.safetensors'
    graph['14']['inputs']['lora_name'] = 'wan22_lightning_low_noise_model.safetensors'
    for k in ['11', '15']:
        graph[k]['inputs']['lora_name'] = 'wan2.2_animate_adapter_model.safetensors'
    graph['17']['inputs']['text'] = (
        'Pixel art game sprite animation, side-view walking cycle facing RIGHT. '
        'The same chibi punk guitarist with black and magenta spiky hair, pale face, '
        'black and pink jacket, black pants, pink boots with white soles, holding his white electric guitar. '
        'He walks in place at a steady confident pace, legs clearly alternating forward and backward. '
        'One full walking cycle: right foot forward, feet pass, left foot forward, feet pass, return to start. '
        'Both hands keep holding the guitar steadily across his chest. Tiny vertical body bob. '
        'Fixed side-view orientation toward the right, fixed camera, whole body always visible, '
        'constant size and position at center, crisp pixel art, flat solid gray background. '
        'Seamless looping walk animation with a stable face, hairstyle, outfit and guitar.')
    graph['18']['inputs']['text'] = (
        'camera movement, zoom, panning, turning, rotating, facing left, facing camera, '
        'walking away, moving across screen, running, jumping, dancing, strumming, '
        'changing guitar, changing outfit, extra limbs, deformed hands, disappearing legs, '
        'blurry, photorealistic, 3d, background scenery, floor, shadows, text, watermark, borders')
    graph['19']['inputs'].update(width=512, height=512, length=33,
                                  start_image=['2', 0], end_image=['2', 0])
    for k in ['20', '21']:
        graph[k]['inputs']['noise_seed'] = 2026110501
    graph['23']['inputs'].update(filename_prefix='walk-v1/raw-animation', lossless=True, quality=100)
    graph['24'] = node('SaveImage', images=['22', 0], filename_prefix='walk-v1/frame')
    (HERE / 'walk-v1-api.json').write_text(json.dumps(graph, indent=2))
    print(json.dumps({'prepared': str(HERE / 'walk-v1-api.json'), 'frames': 33, 'size': [512, 512]}))

def run_saved(name):
    graph = json.loads((HERE / (name + '-api.json')).read_text())
    queue(name, graph)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['prep', 'status', 'build', 'run'])
    parser.add_argument('name', nargs='?', default='prep')
    args = parser.parse_args()
    if args.action == 'prep':
        prep()
    elif args.action == 'status':
        status(args.name)
    elif args.action == 'build':
        build_walk()
    else:
        run_saved(args.name)
