"""
SVG content normalization for OpenSCAD compatibility.

Problem:
  paper.js may export SVGs where viewBox = "0 0 500 500" (canvas size)
  but the actual path content spans e.g. (90,90)→(410,410). OpenSCAD's
  resize() scales from the origin, so any "dead space" before the content
  survives the resize and offsets the art from where translate() expects.

Solution:
  Parse path coordinates → find content bounds → wrap in
  <g transform="translate(-minX, -minY)"> → set viewBox to "0 0 W H".
"""

import re


def _parse_svg_path_bounds(d_attr: str):
    """Parse SVG path 'd' attribute and return lists of (xs, ys) visited."""
    tokens = re.findall(r'[A-Za-z]|[-+]?\d*\.?\d+', d_attr)
    xs, ys = [], []
    x, y = 0.0, 0.0
    cmd = 'M'
    i = 0
    while i < len(tokens):
        t = tokens[i]
        if t.isalpha():
            cmd = t
            i += 1
            continue
        val = float(t)
        if cmd in ('M', 'L'):
            x = val
            y = float(tokens[i + 1]) if i + 1 < len(tokens) and not tokens[i + 1].isalpha() else y
            xs.append(x); ys.append(y)
            i += 2
            if cmd == 'M':
                cmd = 'L'
        elif cmd in ('m', 'l'):
            x += val
            dy = float(tokens[i + 1]) if i + 1 < len(tokens) and not tokens[i + 1].isalpha() else 0
            y += dy
            xs.append(x); ys.append(y)
            i += 2
            if cmd == 'm':
                cmd = 'l'
        elif cmd == 'H':
            x = val; xs.append(x); i += 1
        elif cmd == 'h':
            x += val; xs.append(x); i += 1
        elif cmd == 'V':
            y = val; ys.append(y); i += 1
        elif cmd == 'v':
            y += val; ys.append(y); i += 1
        elif cmd == 'C':
            if i + 5 < len(tokens):
                for j in range(0, 6, 2):
                    xs.append(float(tokens[i + j]))
                    ys.append(float(tokens[i + j + 1]))
                x = float(tokens[i + 4]); y = float(tokens[i + 5])
                i += 6
            else:
                break
        elif cmd == 'c':
            if i + 5 < len(tokens):
                for j in range(0, 6, 2):
                    xs.append(x + float(tokens[i + j]))
                    ys.append(y + float(tokens[i + j + 1]))
                x += float(tokens[i + 4]); y += float(tokens[i + 5])
                i += 6
            else:
                break
        else:
            i += 1
    return xs, ys


def normalize_svg_to_origin(svg_bytes: bytes) -> bytes:
    """
    Shift SVG content so it starts at (0, 0) and update viewBox to match.
    """
    try:
        text = svg_bytes.decode('utf-8', errors='replace')
        path_ds = re.findall(r'\bd="([^"]*)"', text)
        if not path_ds:
            return svg_bytes

        all_x, all_y = [], []
        for d in path_ds:
            xs, ys = _parse_svg_path_bounds(d)
            all_x.extend(xs)
            all_y.extend(ys)

        if not all_x or not all_y:
            return svg_bytes

        min_x, min_y = min(all_x), min(all_y)
        max_x, max_y = max(all_x), max(all_y)
        cw = max_x - min_x
        ch = max_y - min_y

        if cw < 0.001 or ch < 0.001:
            return svg_bytes

        # Already at origin and viewBox matches? skip
        if abs(min_x) < 0.5 and abs(min_y) < 0.5:
            vb_m = re.search(r'viewBox="([^"]*)"', text)
            if vb_m:
                vb = list(map(float, vb_m.group(1).split()))
                if len(vb) == 4 and abs(vb[2] - cw) < 1 and abs(vb[3] - ch) < 1:
                    return svg_bytes

        print(
            f"[normalize_svg_to_origin] content bounds: "
            f"({min_x},{min_y})->({max_x},{max_y}), size {cw}x{ch}",
            flush=True,
        )

        # Update viewBox to content size
        text = re.sub(
            r'viewBox="[^"]*"',
            f'viewBox="0 0 {cw} {ch}"',
            text,
            count=1,
        )

        # Wrap the entire content in a translate to shift to origin
        svg_tag_end = re.search(r'<svg\b[^>]*>', text)
        if svg_tag_end:
            pos = svg_tag_end.end()
            g_open = f'<g transform="translate({-min_x} {-min_y})">'
            text = text[:pos] + g_open + text[pos:]
            text = text.rsplit('</svg>', 1)
            text = '</g></svg>'.join(text)

        return text.encode('utf-8')
    except Exception as e:
        print(f"[normalize_svg_to_origin] error: {e}", flush=True)
        return svg_bytes
