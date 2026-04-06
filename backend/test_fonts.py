import sys
import os
from fontTools.ttLib import TTFont

ttf_path = sys.argv[1]
font = TTFont(ttf_path)

units_per_em = font['head'].unitsPerEm
ascent_hhea = getattr(font.get('hhea'), 'ascent', 'NO_HHEA_ASCENT')
ascent_os2 = getattr(font.get('OS/2'), 'sTypoAscender', 'NO_OS2_ASCENT')
cap_h = getattr(font.get('OS/2'), 'sCapHeight', 'NO_CAP_HEIGHT')

print(f"Font: {os.path.basename(ttf_path)}")
print(f"unitsPerEm: {units_per_em}")
print(f"hhea ascent: {ascent_hhea}")
print(f"OS/2 sTypoAscender: {ascent_os2}")
print(f"OS/2 sCapHeight: {cap_h}")
