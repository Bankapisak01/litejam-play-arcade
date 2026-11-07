"""Start the local experiment as soon as all seven model hashes are verified."""
import json
import time
from run import HERE, run_saved

deadline=time.monotonic()+3600
last=-1
while time.monotonic()<deadline:
    path=HERE/'model-verification.json'
    try:
        verified=json.loads(path.read_text()) if path.exists() else []
    except json.JSONDecodeError:
        verified=[]
    count=len(verified)
    if count!=last:
        print(f'Verified model files: {count}/7',flush=True)
        last=count
    if count==7 and all(item['verified'] for item in verified):
        run_saved('walk-v1')
        break
    time.sleep(5)
else:
    raise TimeoutError('Downloads have not completed; no generation was queued.')
