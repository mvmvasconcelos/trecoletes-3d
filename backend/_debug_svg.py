import re, os, glob

gen_dir = "/app/static/generated"
dirs = sorted([d for d in glob.glob(f"{gen_dir}/*") if os.path.isdir(d)], key=os.path.getmtime, reverse=True)
target = dirs[0]
print("Job dir:", target)

with open(f"{target}/linhas.svg", "r") as f:
    c = f.read()

paths = re.findall(r'<path[^>]+>', c)
print(f"Total paths: {len(paths)}")
for i, p in enumerate(paths):
    fill = re.search(r'fill="([^"]+)"', p)
    stroke = re.search(r'stroke="([^"]+)"', p)
    sw = re.search(r'stroke-width="([^"]+)"', p)
    d = re.search(r'\bd="(.{0,80})', p)
    print(f"P{i}: fill={fill.group(1) if fill else None}  stroke={stroke.group(1) if stroke else None}  sw={sw.group(1) if sw else None}  d={d.group(1) if d else '?'}")
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
