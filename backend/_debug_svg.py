import subprocess, re, os, tempfile
from PIL import Image, ImageDraw
import io

img = Image.new('RGBA', (200, 200), (255,255,255,255))
draw = ImageDraw.Draw(img)
draw.ellipse([20, 20, 180, 180], fill=(0,0,0,255))
draw.ellipse([60, 60, 140, 140], fill=(255,255,255,255))

# grayscale + threshold + 1bit
gray = img.convert('L')
gray = gray.point(lambda p: 0 if p < 128 else 255, 'L')
bw = gray.convert('1')
w, h = bw.size

pbm_buf = io.BytesIO()
bw.save(pbm_buf, format='PPM')

with tempfile.NamedTemporaryFile(suffix='.pbm', delete=False) as tf:
    tf.write(pbm_buf.getvalue())
    tf_path = tf.name

result = subprocess.run(
    ['potrace', '--svg', '-o', '-', '--turdsize', '2', tf_path],
    capture_output=True, timeout=30
)
os.unlink(tf_path)

svg = result.stdout.decode('utf-8')
svg_clean = re.sub(r'<\?xml[^?]*\?>', '', svg)
svg_clean = re.sub(r'<!DOCTYPE[^>]*>', '', svg_clean)
svg_clean = re.sub(r'<metadata>.*?</metadata>', '', svg_clean, flags=re.DOTALL)
svg_clean = svg_clean.strip()

print('returncode:', result.returncode)
print('stdout len:', len(result.stdout))
print('stderr:', result.stderr.decode())
print('=== potrace SVG BRUTO (primeiros 1500 chars) ===')
print(svg[:1500])
print('\n=== APOS LIMPEZA ===')
print(svg_clean[:800])
