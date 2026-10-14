#!/usr/bin/env python3
"""Write sw.js with the full file list + a new version so iPads pick up updates."""
import os, time, json
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
files = ['./']
for d in ['', 'src', 'src/world', 'vendor', 'assets']:
    for f in sorted(os.listdir(os.path.join(root, d) if d else root)):
        p = os.path.join(d, f) if d else f
        if os.path.isdir(os.path.join(root, p)) or f.startswith('.') or f == 'sw.js' or f.endswith('.md') or f.endswith('.py'):
            continue
        files.append('./' + p)
version = time.strftime('%Y%m%d-%H%M%S')
tpl = open(os.path.join(root, 'tools', 'sw.template.js')).read()
out = tpl.replace('__VERSION__', version).replace('__FILES__', json.dumps(files, indent=2))
open(os.path.join(root, 'sw.js'), 'w').write(out)
open(os.path.join(root, 'version.txt'), 'w').write(version + '\n')
print('sw.js', version, len(files), 'files')
