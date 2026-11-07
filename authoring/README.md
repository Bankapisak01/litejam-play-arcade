# Optional 2D authoring sources

These sources were preserved before the original local workspace was cleaned. The playable games remain self-contained in `public/` and `games/`; `npm start`, `npm test` and `npm run build` do not use this directory or require Python, ComfyUI, model downloads or generation credits.

## Music

`music/source/` contains the original deterministic composer, editable JSON scores, MIDI files and the original verification/packaging scripts for Neon Heartbeat and Drake Overdrive. `music/tracks.json` records their arrangement metadata. The composer uses NumPy, SciPy and PyAV, with no commercial samples or remote generation service. Its output paths are relative to `music/`. Existing playback WAVs and game charts remain under `games/tempo-rush/dist/`.

## Sprites and effects

`2d/setup/sprite-walk/` preserves Python generation/export recipes, ComfyUI API/UI workflows, selected-frame indices and model download metadata. `2d/setup/text-edit-api.json` is the shared image-edit graph used by the boss and VFX recipes. `2d/references/sprite-walk/` contains Punkman/Drake references and the selected animation frames. `2d/masters/` contains the transparent VFX masters.

These are the original authoring scripts, not a newly packaged one-command generator. Before rerunning them, configure your local ComfyUI instance, its input/output directories, custom nodes and models. Review the legacy absolute model/clipboard paths and the local API address in `run.py`; `build_boss.py` should use the included `boss-reference.png` instead of its old temporary clipboard path. Some exporters consume generation history, raw frames or legacy prototype paths; regenerate those intermediates and choose an export destination before running them. Python scripts may execute work at import time, so do not import them merely to inspect their contents.

AI model binaries, raw generation videos, run histories, service logs, caches and all 3D work are excluded. Models can be large and are only needed for new local generation. Review their individual licenses when obtaining them. This archive does not install or run them automatically.

`archive-manifest.json` records SHA-256 hashes of the preserved source files. The archive is available in GitHub clones/downloads; the existing `npm run package` command packages the playable game source and tests, not this optional authoring directory. Keep the repository private under the existing asset notices.
