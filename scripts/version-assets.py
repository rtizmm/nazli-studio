"""Version leaf modules first, then parents and HTML, for coherent updates."""
from pathlib import Path
from hashlib import sha256
import re

root = Path(__file__).resolve().parents[1]
def digest(name):
    return sha256((root / name).read_bytes()).hexdigest()[:12]
def imports(name, dependencies):
    path = root / name
    content = path.read_text()
    for dependency in dependencies:
        pattern = r"(['\"])\./" + re.escape(dependency) + r"(?:\?[^'\"]*)?\1"
        content = re.sub(pattern, lambda m: m[1] + './' + dependency + '?v=' + digest(dependency) + m[1], content)
    path.write_text(content)
imports('audio.mjs', ['music.mjs'])
imports('app.mjs', ['music.mjs', 'audio.mjs'])
path = root / 'index.html'
content = path.read_text()
for name in ['studio.css', 'themes.css', 'app.mjs']:
    pattern = r'(href|src)="' + re.escape(name) + r'(?:\?[^\"]*)?"'
    content, count = re.subn(pattern, lambda m: m[1] + '="' + name + '?v=' + digest(name) + '"', content)
    if count != 1:
        raise ValueError('Expected exactly one reference to ' + name)
path.write_text(content)
