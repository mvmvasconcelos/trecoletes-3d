import sys
from fontTools.ttLib import TTFont
from fontTools.pens.boundsPen import BoundsPen

font_path = sys.argv[1]
text = sys.argv[2]

font = TTFont(font_path)
cmap = font.getBestCmap() or {}
hmtx = font['hmtx'].metrics
glyphSet = font.getGlyphSet()

advs = []
min_xs = []
max_xs = []

for char in text:
    gname = cmap.get(ord(char), '.notdef')
    adv = hmtx.get(gname, hmtx.get('.notdef', (0,)))[0]
    advs.append(adv)
    
    pen = BoundsPen(glyphSet)
    if gname in glyphSet:
        glyphSet[gname].draw(pen)
        if pen.bounds:
            xmin, ymin, xmax, ymax = pen.bounds
            min_xs.append(xmin)
            max_xs.append(xmax)
        else:
            min_xs.append(0)
            max_xs.append(0)

print(f"Advs: {advs}")
print(f"Xmins: {min_xs}")
print(f"Xmaxs: {max_xs}")

total_w = sum(advs)
start_x = -total_w / 2

x = start_x
physical_minX = 999999
physical_maxX = -999999

for i in range(len(advs)):
    # The physical left edge is the origin X plus the local xMin
    p_min = x + min_xs[i]
    p_max = x + max_xs[i]
    physical_minX = min(physical_minX, p_min)
    physical_maxX = max(physical_maxX, p_max)
    print(f"Char '{text[i]}': Origin: {x:.1f}, DrawBounds: [{p_min:.1f}, {p_max:.1f}], Adv: {advs[i]}")
    x += advs[i]

print(f"Abstract origins range: [{-total_w/2:.1f}, {total_w/2:.1f}]")
print(f"Abstract End: {x - advs[-1] + advs[-1]:.1f}")
print(f"Physical bounds: [{physical_minX:.1f}, {physical_maxX:.1f}]")
print(f"Difference Left: {physical_minX - (-total_w/2):.1f}")
print(f"Difference Right: {physical_maxX - (total_w/2):.1f}")
