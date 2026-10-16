"""Re-fetch the pinned SPL versions; refuse to overwrite a changed source."""
import hashlib
import io
import json
import pathlib
import urllib.request
import zipfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
manifest=json.loads((ROOT/'data/manifest.json').read_text())
for row in manifest['files']:
 req=urllib.request.Request(row['downloadUrl'],headers={'User-Agent':'PharmaEvidence/1.0 educational-source-reproduction'})
 with urllib.request.urlopen(req,timeout=60) as res:data=res.read()
 archive=zipfile.ZipFile(io.BytesIO(data))
 candidates=[n for n in archive.namelist() if n.endswith('.xml')]
 if len(candidates)!=1:raise RuntimeError('Ambiguous source archive')
 xml=archive.read(candidates[0]);digest=hashlib.sha256(xml).hexdigest()
 if digest!=row['sha256']:raise RuntimeError('Pinned source changed: '+row['id'])
 (ROOT/row['file']).write_bytes(xml)
 print('Verified',row['id'],digest)
