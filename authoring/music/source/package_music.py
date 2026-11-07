"""Package the portable listening library and optional instrument stems."""
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
destination = ROOT/'downloads'
destination.mkdir(exist_ok=True)
main = destination/'Punkman-Tempo-Rush-Music.zip'
with zipfile.ZipFile(main, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    for path in sorted(ROOT.rglob('*')):
        if not path.is_file():
            continue
        relative = path.relative_to(ROOT)
        if relative.parts[0] in ('downloads','stems','__pycache__') or '__pycache__' in relative.parts or relative.name == 'server-url.txt':
            continue
        archive.write(path, 'Punkman-Tempo-Rush-Music/'+relative.as_posix())
stems = destination/'Punkman-Tempo-Rush-Stems.zip'
with zipfile.ZipFile(stems, 'w', zipfile.ZIP_STORED) as archive:
    for path in sorted((ROOT/'stems').glob('*.flac')):
        archive.write(path, 'Punkman-Tempo-Rush-Stems/'+path.name)
    archive.write(ROOT/'README.md','Punkman-Tempo-Rush-Stems/README.md')
for path in (main, stems):
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None
        print(f'{path.name}: {len(archive.namelist())} files, {path.stat().st_size/1024**2:.1f} MiB, CRC verified')
