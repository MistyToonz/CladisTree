# Logo CladisTree transparent à partir de src/PT.png (fond blanc opaque, 2000 px).
# Chaque pixel est vu comme un mélange entre UNE couleur du logo et le blanc : on retrouve la couleur
# d'origine et l'opacité exacte (bords lissés propres sur fond sombre), les aplats restent opaques.
import sys
import numpy as np
from PIL import Image

src, out_dir = sys.argv[1], sys.argv[2]
img = np.asarray(Image.open(src).convert('RGB')).astype(np.float64)
h, w, _ = img.shape
px = img.reshape(-1, 3)
white = np.array([255.0, 255.0, 255.0])
palette = np.array([[0, 0, 0], [255, 49, 49], [0, 74, 173]], dtype=np.float64)

best_a = np.zeros(len(px)); best_err = np.full(len(px), np.inf); best_c = np.zeros((len(px), 3))
d = white - px
for fg in palette:
    v = white - fg
    a = np.clip(d @ v / (v @ v), 0, 1)
    err = np.linalg.norm(d - np.outer(a, v), axis=1)
    better = err < best_err
    best_err[better] = err[better]; best_a[better] = a[better]; best_c[better] = fg
alpha = best_a
alpha[alpha < 0.02] = 0
rgba = np.zeros((len(px), 4), dtype=np.uint8)
rgba[:, :3] = best_c.astype(np.uint8)
rgba[:, 3] = np.round(alpha * 255).astype(np.uint8)
logo = Image.fromarray(rgba.reshape(h, w, 4), 'RGBA')

# Recadrage sur le contenu, avec une petite marge, puis carré.
bbox = logo.getbbox()
logo = logo.crop(bbox)
side = max(logo.size)
pad = int(side * 0.04)
canvas = Image.new('RGBA', (side + 2 * pad, side + 2 * pad), (0, 0, 0, 0))
canvas.paste(logo, (pad + (side - logo.size[0]) // 2, pad + (side - logo.size[1]) // 2))
for size in (512, 128):
    canvas.resize((size, size), Image.LANCZOS).save(f'{out_dir}/logo-{size}.png', optimize=True)
# Variante pour fond sombre : traits noirs -> clairs (le C rouge et le T bleu sont inchangés).
arr = np.asarray(canvas).copy()
dark = (arr[:, :, 0] < 40) & (arr[:, :, 1] < 40) & (arr[:, :, 2] < 40)
arr[dark, :3] = (236, 236, 236)
dark_logo = Image.fromarray(arr, 'RGBA')
for size in (512, 128):
    dark_logo.resize((size, size), Image.LANCZOS).save(f'{out_dir}/logo-dark-{size}.png', optimize=True)
print('bbox', bbox, 'max residual', round(float(best_err.max()), 1), 'sur fond blanc :', round(float(np.mean(best_err)), 3))
