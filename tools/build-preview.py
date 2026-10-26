"""Export existing approved atlas frames to a GIF; no new artwork is generated.

Development-only dependency: Pillow. Generated image retains the source
artwork's separate license status (not the code's MIT license).
"""
from pathlib import Path
from PIL import Image, ImageDraw
import json

root = Path(__file__).resolve().parents[1] / 'examples' / 'deepseek-v2'
assets = root / 'assets'
data = json.loads((assets / 'asset-data.mjs').read_text(encoding='utf-8').removeprefix('export default ').strip().removesuffix(';'))
sheets = {name: Image.open(assets / f'deepseek-{name}.webp').convert('RGBA')
          for name in ['normal', 'basin', 'transition', 'hissing']}
frames, durations = [], []

def sequence(sheet, row, times, caption, repeats=1):
    for _ in range(repeats):
        for column, duration in enumerate(times):
            canvas = Image.new('RGB', (240, 248), '#f1f5ff')
            sprite = sheets[sheet].crop((column*192, row*208, (column+1)*192, (row+1)*208))
            canvas.paste(sprite, (24, 14), sprite)
            ImageDraw.Draw(canvas).text((12, 229), caption, fill='#23405b')
            frames.append(canvas)
            durations.append(duration)

sequence('normal', 0, [700], 'Normal - idle')
sequence('normal', 7, data['durations']['running'], 'Running - eating rice', repeats=2)
sequence('hissing', 0, data['durations']['hissing'], 'Hover - one hiss')
sequence('transition', 0, data['durations']['transition'], 'Double click - transform')
sequence('basin', 0, data['durations']['basinIdle'], 'Basin - idle')
sequence('basin', 7, data['durations']['running'], 'Basin - eating rice', repeats=2)
sequence('hissing', 1, data['durations']['hissing'], 'Basin - hover hiss')
sequence('basin', 0, [1200], 'Basin form persists')
frames[0].save(root/'preview.gif', save_all=True, append_images=frames[1:],
               duration=durations, loop=0, optimize=True, disposal=2)
print(f'Exported {len(frames)} frames: {root / "preview.gif"}')
