"""Download the locally run Wan sprite-animation models; verify upstream hashes."""
import concurrent.futures
import hashlib
import json
from pathlib import Path
import subprocess
import urllib.request

HERE = Path(__file__).resolve().parent
DEST = Path(r'D:\20_AI\ComfyUI-Shared\models')
FILES = [
    ('QuantStack/Wan2.2-I2V-A14B-GGUF', 'HighNoise/Wan2.2-I2V-A14B-HighNoise-Q4_K_M.gguf', 'diffusion_models'),
    ('QuantStack/Wan2.2-I2V-A14B-GGUF', 'LowNoise/Wan2.2-I2V-A14B-LowNoise-Q4_K_M.gguf', 'diffusion_models'),
    ('Comfy-Org/Wan_2.1_ComfyUI_repackaged', 'split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors', 'text_encoders'),
    ('Comfy-Org/Wan_2.2_ComfyUI_Repackaged', 'split_files/vae/wan_2.1_vae.safetensors', 'vae'),
    ('styly-agents/Wan2-2-pixel-animate', 'wan2.2_animate_adapter_model.safetensors', 'loras'),
    ('lightx2v/Wan2.2-Lightning', 'Wan2.2-I2V-A14B-4steps-lora-rank64-Seko-V1/high_noise_model.safetensors', 'loras'),
    ('lightx2v/Wan2.2-Lightning', 'Wan2.2-I2V-A14B-4steps-lora-rank64-Seko-V1/low_noise_model.safetensors', 'loras'),
]

def metadata(repo):
    with urllib.request.urlopen(f'https://huggingface.co/api/models/{repo}?blobs=true', timeout=60) as response:
        return json.load(response)

def download(item):
    dest = Path(item['path'])
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_name(dest.name + '.part')
    if not dest.exists():
        print(json.dumps({'downloading': dest.name, 'GB': round(item['size']/1e9, 2)}), flush=True)
        with (HERE / (dest.name + '.download.log')).open('a') as log:
            subprocess.run(['curl.exe', '-L', '--fail', '--retry', '5', '--retry-delay', '3',
                            '--connect-timeout', '30', '--speed-limit', '1024', '--speed-time', '60',
                            '-C', '-', '-o', str(part), item['url']], stdout=log, stderr=log, check=True)
        target = part
    else:
        target = dest
    if target.stat().st_size != item['size']:
        raise RuntimeError(f'Wrong file size: {target}')
    sha = hashlib.file_digest(target.open('rb'), 'sha256').hexdigest()
    if sha != item['sha256']:
        raise RuntimeError(f'Hash mismatch: {target}')
    if target == part:
        part.replace(dest)
    print(json.dumps({'verified': dest.name, 'sha256': sha}), flush=True)
    return {'name': dest.name, 'sha256': sha, 'bytes': item['size'], 'verified': True}

if __name__ == '__main__':
    repos = {repo: metadata(repo) for repo in dict.fromkeys(x[0] for x in FILES)}
    manifest = []
    for repo, remote, folder in FILES:
        info = repos[repo]
        entry = next(x for x in info['siblings'] if x['rfilename'] == remote)
        name = Path(remote).name
        if 'Lightning' in repo:
            name = 'wan22_lightning_' + name
        manifest.append({'repo': repo, 'revision': info['sha'], 'remote': remote,
                         'path': str(DEST / folder / name), 'size': entry['lfs']['size'],
                         'sha256': entry['lfs']['sha256'],
                         'url': f"https://huggingface.co/{repo}/resolve/{info['sha']}/{remote}"})
    (HERE / 'model-manifest.json').write_text(json.dumps(manifest, indent=2))
    print(json.dumps({'files': len(manifest), 'totalGB': round(sum(x['size'] for x in manifest)/1e9, 2)}), flush=True)
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        futures = [pool.submit(download, item) for item in manifest]
        for future in concurrent.futures.as_completed(futures):
            results.append(future.result())
            (HERE / 'model-verification.json').write_text(json.dumps(results, indent=2))
    print('ALL MODELS VERIFIED', flush=True)
