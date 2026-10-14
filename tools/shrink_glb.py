#!/usr/bin/env python3
"""Shrink a .glb for the iPad: textures down to MAX px (JPEG unless they need alpha)."""
import json, struct, sys, io
from PIL import Image
MAX = int(sys.argv[3]) if len(sys.argv) > 3 else 1024
src, dst = sys.argv[1], sys.argv[2]
b = open(src, 'rb').read()
jl = struct.unpack('<I', b[12:16])[0]
j = json.loads(b[20:20 + jl])
bo = 20 + jl
bl = struct.unpack('<I', b[bo:bo + 4])[0]
binc = b[bo + 8: bo + 8 + bl]
views = [binc[v.get('byteOffset', 0): v.get('byteOffset', 0) + v['byteLength']] for v in j['bufferViews']]
for img in j.get('images', []):
    vi = img['bufferView']
    im = Image.open(io.BytesIO(views[vi]))
    im.load()
    if max(im.size) > MAX:
        s = MAX / max(im.size)
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    out = io.BytesIO()
    alpha = im.mode in ('RGBA', 'LA') and im.getchannel('A').getextrema()[0] < 250
    if alpha:
        im.save(out, 'PNG', optimize=True); img['mimeType'] = 'image/png'
    else:
        im.convert('RGB').save(out, 'JPEG', quality=86); img['mimeType'] = 'image/jpeg'
    views[vi] = out.getvalue()
    print(' image', vi, im.size, 'alpha' if alpha else 'jpeg', len(views[vi]))
newbin = bytearray()
for v, data in zip(j['bufferViews'], views):
    while len(newbin) % 4: newbin += b'\0'
    v['byteOffset'] = len(newbin); v['byteLength'] = len(data)
    newbin += data
while len(newbin) % 4: newbin += b'\0'
j['buffers'][0]['byteLength'] = len(newbin)
js = json.dumps(j, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
total = 12 + 8 + len(js) + 8 + len(newbin)
with open(dst, 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, total))
    f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
    f.write(struct.pack('<II', len(newbin), 0x004E4942)); f.write(newbin)
print(dst, total)
