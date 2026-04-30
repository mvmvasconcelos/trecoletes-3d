import hashlib
import math
import os
import re
import shutil
import subprocess
import time
import json
import uuid
import zipfile
import threading
import numpy as np
import trimesh
from concurrent.futures import ThreadPoolExecutor, as_completed
from fastapi import APIRouter, UploadFile, Form, Request
from fastapi.responses import JSONResponse
from app.api._svg_normalize import normalize_svg_to_origin
from fontTools.ttLib import TTFont
from app.api.fonts import ensure_font_downloaded, FONTS_DIR


def _flatten_svg_transforms(svg_bytes: bytes) -> bytes:
    """
    Achata transforms de grupos/paths no SVG para que as coordenadas fiquem
    diretamente no espaço do viewport. Necessário para compatibilidade com
    Paper.js, que usa child.bounds no espaço local do parent ao calcular
    o viewBox exportado.

    Suporta:
    - <g transform="translate(tx,ty) scale(sx,sy)"> (saída do potrace)
    - <path transform="translate(tx,ty)">           (saída do vtracer)
    """
    import re as _re
    from lxml import etree

    try:
        root = etree.fromstring(svg_bytes)
    except Exception:
        return svg_bytes

    def _parse_matrix(t_str: str):
        """Converte string de transform SVG para matriz [a,b,c,d,e,f]. Retorna None se não suportado."""
        t = t_str.strip()
        m = _re.match(r'matrix\(\s*([\d.eE+-]+)[,\s]+([\d.eE+-]+)[,\s]+([\d.eE+-]+)[,\s]+([\d.eE+-]+)[,\s]+([\d.eE+-]+)[,\s]+([\d.eE+-]+)\s*\)', t)
        if m:
            return [float(x) for x in m.groups()]
        m = _re.match(r'translate\(\s*([\d.eE+-]+)[\s,]+([\d.eE+-]+)\s*\)\s*scale\(\s*([\d.eE+-]+)[\s,]+([\d.eE+-]+)\s*\)', t)
        if m:
            tx, ty, sx, sy = map(float, m.groups())
            return [sx, 0.0, 0.0, sy, tx, ty]
        m = _re.match(r'scale\(\s*([\d.eE+-]+)[\s,]+([\d.eE+-]+)\s*\)\s*translate\(\s*([\d.eE+-]+)[\s,]+([\d.eE+-]+)\s*\)', t)
        if m:
            sx, sy, tx, ty = map(float, m.groups())
            return [sx, 0.0, 0.0, sy, sx * tx, sy * ty]
        m = _re.match(r'translate\(\s*([\d.eE+-]+)[\s,]+([\d.eE+-]+)\s*\)$', t)
        if m:
            tx, ty = map(float, m.groups())
            return [1.0, 0.0, 0.0, 1.0, tx, ty]
        m = _re.match(r'scale\(\s*([\d.eE+-]+)[\s,]+([\d.eE+-]+)\s*\)$', t)
        if m:
            sx, sy = map(float, m.groups())
            return [sx, 0.0, 0.0, sy, 0.0, 0.0]
        return None

    def _xform_d(d: str, mat) -> str:
        """Aplica matriz afim [a,b,c,d,e,f] aos dados de path SVG."""
        a, b, c, dm, e, f = mat

        def abs_p(x, y):
            return a * x + c * y + e, b * x + dm * y + f

        def rel_p(dx, dy):
            return a * dx + c * dy, b * dx + dm * dy

        tokens = _re.findall(r'[A-Za-z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?', d)
        out = []
        i = 0
        cmd = ''

        def pop(n):
            nonlocal i
            vals = [float(tokens[i + j]) for j in range(n)]
            i += n
            return vals

        while i < len(tokens):
            t = tokens[i]
            if t.isalpha():
                cmd = t
                out.append(t)
                i += 1
                continue
            try:
                if cmd in ('M', 'L', 'T'):
                    x, y = pop(2)
                    nx, ny = abs_p(x, y)
                    out.append(f'{nx:.4g} {ny:.4g}')
                elif cmd in ('m', 'l', 't'):
                    dx, dy = pop(2)
                    ndx, ndy = rel_p(dx, dy)
                    out.append(f'{ndx:.4g} {ndy:.4g}')
                elif cmd == 'C':
                    pts = []
                    for _ in range(3):
                        x, y = pop(2)
                        nx, ny = abs_p(x, y)
                        pts.append(f'{nx:.4g} {ny:.4g}')
                    out.append(' '.join(pts))
                elif cmd == 'c':
                    pts = []
                    for _ in range(3):
                        dx, dy = pop(2)
                        ndx, ndy = rel_p(dx, dy)
                        pts.append(f'{ndx:.4g} {ndy:.4g}')
                    out.append(' '.join(pts))
                elif cmd in ('S', 'Q'):
                    pts = []
                    for _ in range(2):
                        x, y = pop(2)
                        nx, ny = abs_p(x, y)
                        pts.append(f'{nx:.4g} {ny:.4g}')
                    out.append(' '.join(pts))
                elif cmd in ('s', 'q'):
                    pts = []
                    for _ in range(2):
                        dx, dy = pop(2)
                        ndx, ndy = rel_p(dx, dy)
                        pts.append(f'{ndx:.4g} {ndy:.4g}')
                    out.append(' '.join(pts))
                elif cmd == 'H':
                    [x] = pop(1)
                    nx, _ = abs_p(x, 0)
                    out.append(f'{nx:.4g}')
                elif cmd == 'h':
                    [dx] = pop(1)
                    ndx, _ = rel_p(dx, 0)
                    out.append(f'{ndx:.4g}')
                elif cmd == 'V':
                    [y] = pop(1)
                    _, ny = abs_p(0, y)
                    out.append(f'{ny:.4g}')
                elif cmd == 'v':
                    [dy] = pop(1)
                    _, ndy = rel_p(0, dy)
                    out.append(f'{ndy:.4g}')
                else:
                    out.append(tokens[i])
                    i += 1
            except (IndexError, ValueError):
                out.append(tokens[i])
                i += 1

        return ' '.join(out)

    # --- Passa 1: achatar transforms de grupos ---
    for elem in list(root.iter()):
        tag = elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag
        if tag != 'g':
            continue
        t_str = elem.get('transform', '')
        if not t_str:
            continue
        mat = _parse_matrix(t_str)
        if mat is None:
            continue
        fill_from_g = elem.get('fill', '')
        for child in elem.iter():
            c_tag = child.tag.split('}')[-1] if '}' in child.tag else child.tag
            if c_tag != 'path':
                continue
            d = child.get('d', '')
            if d:
                child.set('d', _xform_d(d, mat))
            if fill_from_g and not child.get('fill'):
                child.set('fill', fill_from_g)
            child.set('stroke', 'none')
            if child.get('transform'):
                del child.attrib['transform']
        del elem.attrib['transform']
        if 'fill' in elem.attrib:
            del elem.attrib['fill']

    # --- Passa 2: achatar transforms restantes diretamente em paths ---
    for elem in list(root.iter()):
        tag = elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag
        if tag != 'path':
            continue
        t_str = elem.get('transform', '')
        if not t_str:
            continue
        mat = _parse_matrix(t_str)
        if mat is None:
            continue
        d = elem.get('d', '')
        if d:
            elem.set('d', _xform_d(d, mat))
        del elem.attrib['transform']

    # --- Normaliza dimensões: usa viewBox, seta width/height para 100% ---
    vb = root.get('viewBox', '')
    if not vb:
        w_str = _re.match(r'[\d.]+', root.get('width', '100'))
        h_str = _re.match(r'[\d.]+', root.get('height', '100'))
        if w_str and h_str:
            root.set('viewBox', f'0 0 {w_str.group()} {h_str.group()}')
    root.set('width', '100%')
    root.set('height', '100%')

    return etree.tostring(root, encoding='unicode').encode('utf-8')


def _is_white_ish(fill_value: str) -> bool:
    """Retorna True se a cor de fill é branca ou quase branca."""
    v = fill_value.strip().lower()
    if v in ('white', '#fff', '#ffffff', 'rgb(255,255,255)', 'rgb(255, 255, 255)'):
        return True
    m = re.match(r'rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)', v)
    if m:
        r, g, b = int(m.group(1)), int(m.group(2)), int(m.group(3))
        return r > 230 and g > 230 and b > 230
    return False


def _clean_vtracer_svg(svg_str: str) -> bytes:
    """
    Pós-processa o SVG gerado pelo vtracer para compatibilidade com Paper.js:
    1. Converte atributos style="fill:X;stroke:Y" para atributos de apresentação.
    2. Remove elementos com fill branco/quase-branco (fundo e furos brancos do stacked mode).
    3. Força fill="black" stroke="none" nos paths restantes.
    O resultado é um SVG com apenas paths pretos limpos, sem camadas sobrepostas.
    """
    try:
        from lxml import etree

        SVG_NS = 'http://www.w3.org/2000/svg'
        root = etree.fromstring(svg_str.encode('utf-8'))

        # Coleta elementos para remover (não pode remover durante a iteração)
        to_remove = []
        for elem in root.iter():
            # Converte style="..." para atributos de apresentação
            style_attr = elem.get('style', '')
            if style_attr:
                for part in style_attr.split(';'):
                    part = part.strip()
                    if ':' in part:
                        k, v = part.split(':', 1)
                        elem.set(k.strip(), v.strip())
                if 'style' in elem.attrib:
                    del elem.attrib['style']

            # Marca elementos brancos para remoção
            fill = elem.get('fill', '')
            if fill and _is_white_ish(fill):
                to_remove.append(elem)

        for elem in to_remove:
            parent = elem.getparent()
            if parent is not None:
                parent.remove(elem)

        # Força fill=black e stroke=none em todos os elementos de path
        SHAPE_TAGS = {'path', 'polygon', 'polyline', 'rect', 'circle', 'ellipse'}
        for elem in root.iter():
            tag = elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag
            if tag in SHAPE_TAGS:
                elem.set('fill', 'black')
                elem.set('stroke', 'none')

        return etree.tostring(root, encoding='unicode').encode('utf-8')

    except Exception as e:
        print(f"[PNG→SVG] Aviso: falha no pós-processamento SVG: {e}", flush=True)
        return svg_str.encode('utf-8')  # fallback seguro


def _png_bytes_to_svg(png_bytes: bytes) -> bytes:
    """
    Converte bytes de uma imagem PNG em SVG vetorizado via potrace.
    Fluxo: Pillow (grayscale + threshold → PBM 1-bit) → potrace --svg → SVG limpo.
    Potrace gera paths com coordenadas diretas no espaço pixel, sem transform attributes,
    o que garante compatibilidade com o Paper.js do frontend.
    """
    import io
    import tempfile
    try:
        from PIL import Image
    except ImportError:
        raise RuntimeError("Pillow não está instalado. Adicione 'Pillow' ao requirements.txt.")

    # Pré-processa: grayscale → threshold → 1-bit para potrace
    img = Image.open(io.BytesIO(png_bytes)).convert("L")
    img = img.point(lambda p: 0 if p < 128 else 255, "L")
    img_1bit = img.convert("1")
    w, h = img_1bit.size

    pbm_buf = io.BytesIO()
    img_1bit.save(pbm_buf, format="PPM")  # Pillow salva mode "1" como PBM
    pbm_bytes = pbm_buf.getvalue()

    with tempfile.NamedTemporaryFile(suffix=".pbm", delete=False) as tf:
        tf.write(pbm_bytes)
        tf_path = tf.name

    try:
        result = subprocess.run(
            [
                "potrace", "--svg", "-o", "-",
                "--turdsize", "2",
                tf_path,
            ],
            capture_output=True,
            timeout=30,
        )
        if result.returncode != 0:
            raise RuntimeError(f"potrace error: {result.stderr.decode()}")

        svg_str = result.stdout.decode("utf-8")

        # Remove o DOCTYPE e PI do potrace (Paper.js prefere SVG limpo)
        svg_str = re.sub(r'<\?xml[^?]*\?>', '', svg_str)
        svg_str = re.sub(r'<!DOCTYPE[^>]*>', '', svg_str)
        svg_str = re.sub(r'<metadata>.*?</metadata>', '', svg_str, flags=re.DOTALL)
        svg_str = svg_str.strip()

        print(f"[PNG→SVG] potrace OK: {w}x{h}px → {len(svg_str)} bytes SVG", flush=True)
        svg_normalized = _flatten_svg_transforms(svg_str.encode("utf-8"))
        return svg_normalized
    finally:
        os.unlink(tf_path)

def _compute_char_positions(text: str, font_path: str, size_mm: float, spacing: float = 1.0, word_spacing: float = 1.0) -> dict:
    """
    Retorna posições X (mm), bounds reais de limite e largura teórica.
    Usa BoundsPen para obter as margens físicas do glyfo se a fonte for cursiva e extrapolar as bordas virtuais.
    """
    from fontTools.ttLib import TTFont
    from fontTools.pens.boundsPen import BoundsPen
    
    font = TTFont(font_path)
    # OpenSCAD scale exact match: The OpenSCAD wiki states font size maps to ASCENT (height above baseline).
    # This precisely matches font['hhea'].ascent in FreeType.
    ascent: int = getattr(font.get('hhea'), 'ascent', font['head'].unitsPerEm)
    scale = size_mm / ascent
    cmap = font.getBestCmap() or {}
    hmtx = font['hmtx'].metrics
    try:
        glyphSet = font.getGlyphSet()
    except Exception:
        glyphSet = None

    advs = []
    min_xs = []
    max_xs = []

    for char in text:
        gname = cmap.get(ord(char), '.notdef')
        if gname not in hmtx:
            gname = '.notdef'
        factor = word_spacing if char == ' ' else spacing
        adv = hmtx[gname][0] * scale * factor
        advs.append(adv)
        
        pen_bounds = None
        if glyphSet and gname in glyphSet:
            try:
                pen = BoundsPen(glyphSet)
                glyphSet[gname].draw(pen)
                pen_bounds = pen.bounds
            except Exception:
                pass
                
        if pen_bounds:
            min_xs.append(pen_bounds[0] * scale)
            max_xs.append(pen_bounds[2] * scale)
        else:
            min_xs.append(0)
            max_xs.append(adv)

    total_w = sum(advs)
    # OpenSCAD text com halign="left" aninha nativamente o vetor no ponto 0.
    # Ao abandonarmos a centralização cega de start_x = -total_w / 2,
    # as medidas físicas (min_x, max_x) não acumulam erros de kerning e a argola segue o texto perfeitamente!
    start_x = 0.0
    
    positions = []
    x = start_x
    physical_min_x = 999999.0
    physical_max_x = -999999.0
    
    for i, adv in enumerate(advs):
        positions.append(round(x, 4))
        physical_min_x = min(physical_min_x, x + min_xs[i])
        physical_max_x = max(physical_max_x, x + max_xs[i])
        x += adv
        
    if physical_min_x == 999999.0:
        physical_min_x = start_x
        physical_max_x = start_x + total_w

    return {
        "positions": positions,
        "total_w": total_w,
        "min_x": physical_min_x,
        "max_x": physical_max_x
    }


# ── Estado global de jobs de batch (em memória) ──────────────────────────────
# { job_id: { "total": N, "done": N, "errors": [], "status": "running"|"done"|"error", "file": url } }
_batch_jobs: dict = {}
_batch_jobs_lock = threading.Lock()

router = APIRouter()

# /app/app/api/generator.py → sobe 3 níveis para chegar à raiz do container /app
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MODELS_DIR = os.environ.get("MODELS_DIR", os.path.abspath(os.path.join(BASE_DIR, "..", "models")))
GENERATED_DIR = os.path.join(BASE_DIR, "static", "generated")

OPENSCAD_TIMEOUT = 300  # segundos por parte
JOB_MAX_AGE_HOURS = 24


def _cleanup_old_jobs():
    """Remove diretórios de job com mais de JOB_MAX_AGE_HOURS horas."""
    if not os.path.isdir(GENERATED_DIR):
        return
    cutoff = time.time() - JOB_MAX_AGE_HOURS * 3600
    for entry in os.scandir(GENERATED_DIR):
        if entry.is_dir() and entry.stat().st_mtime < cutoff:
            try:
                shutil.rmtree(entry.path)
            except Exception:
                pass


def _to_scad_assignment(key: str, raw: str) -> str:
    """
    Converte um par key/value vindo do FormData em um argumento -D do OpenSCAD.
    Todos os valores chegam como string; detectamos o tipo pretendido:
      - "true" / "false"  → booleano SCAD
      - int/float parseável → número SCAD
      - "[...]"            → array SCAD (passado cru)
      - qualquer outra coisa → string SCAD com aspas escapadas
    """
    v = raw.strip()
    if v.lower() == "true":
        return f"{key}=true"
    if v.lower() == "false":
        return f"{key}=false"
    if v.startswith("[") and v.endswith("]"):
        return f"{key}={v}"
    try:
        int(v)
        return f"{key}={v}"
    except ValueError:
        pass
    try:
        float(v)
        return f"{key}={v}"
    except ValueError:
        pass
    escaped = v.replace('"', '\\"')
    return f'{key}="{escaped}"'


def normalize_svg_viewbox(svg_bytes: bytes) -> bytes:
    """
    Shift the SVG coordinate system so the viewBox starts at (0, 0).
    Without this, OpenSCAD's resize() may place the art offset from
    the origin, making centering impossible from within SCAD.

    Strategy:
      1. Parse the viewBox (x y w h).  If x==0 and y==0, return as-is.
      2. Update viewBox to '0 0 w h'.
      3. Wrap all SVG children in <g transform='translate(-x, -y)'>
         so coordinates become relative to the new origin.
    """
    try:
        text = svg_bytes.decode('utf-8', errors='replace')

        vb_match = re.search(r'viewBox=["\']([-\d\s.]+)["\']', text)
        if not vb_match:
            return svg_bytes

        parts = list(map(float, vb_match.group(1).split()))
        if len(parts) != 4:
            return svg_bytes

        vb_x, vb_y, vb_w, vb_h = parts
        if abs(vb_x) < 0.001 and abs(vb_y) < 0.001:
            return svg_bytes  # already at origin

        # Update viewBox to start at (0, 0)
        text = re.sub(
            r'viewBox=["\']([-\d\s.]+)["\']',
            f'viewBox="0 0 {vb_w} {vb_h}"',
            text, count=1
        )

        # Wrap children: insert <g translate> right after the opening <svg...> tag
        svg_tag_end = re.search(r'<svg\b[^>]*>', text)
        if svg_tag_end:
            insert_pos = svg_tag_end.end()
            g_open = f'<g transform="translate({-vb_x} {-vb_y})">'  # SVG uses space, not comma
            text = text[:insert_pos] + g_open + text[insert_pos:]
            # Close the group before </svg>
            text = text.rsplit('</svg>', 1)
            text = '</g></svg>'.join(text)

        return text.encode('utf-8')
    except Exception:
        return svg_bytes  # fallback seguro

# ---------------------------------------------------------------------------
# Funções de geração de 3MF com metadados Bambu Studio
# ---------------------------------------------------------------------------

def _f3d(v: float) -> str:
    """Formata um float para coordenadas 3MF (7 dígitos significativos)."""
    return f"{v:.7g}"


def _xml_object_1_model(meshes: list) -> bytes:
    """Gera o conteúdo de 3D/Objects/object_1.model com todas as malhas."""
    out = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<model unit="millimeter" xml:lang="en-US"'
        ' xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"'
        ' xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06">',
        ' <metadata name="BambuStudio:3mfVersion">1</metadata>',
        ' <resources>',
    ]
    for obj_id, mesh in meshes:
        verts = mesh.vertices
        faces = mesh.faces
        out.append(f'  <object id="{obj_id}" type="model">')
        out.append('   <mesh>')
        out.append('    <vertices>')
        for v in verts:
            out.append(f'     <vertex x="{_f3d(v[0])}" y="{_f3d(v[1])}" z="{_f3d(v[2])}"/>')
        out.append('    </vertices>')
        out.append('    <triangles>')
        for f in faces:
            out.append(f'     <triangle v1="{f[0]}" v2="{f[1]}" v3="{f[2]}"/>')
        out.append('    </triangles>')
        out.append('   </mesh>')
        out.append('  </object>')
    out.append(' </resources>')
    out.append('</model>')
    return '\n'.join(out).encode('utf-8')


def _xml_3dmodel(part_cfgs: list) -> bytes:
    """Gera o conteúdo de 3D/3dmodel.model (estrutura de montagem + build)."""
    assembly_uuid = str(uuid.uuid4())
    build_uuid    = str(uuid.uuid4())
    item_uuid     = str(uuid.uuid4())
    out = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<model unit="millimeter" xml:lang="en-US"'
        ' xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"'
        ' xmlns:BambuStudio="http://schemas.bambulab.com/package/2021"'
        ' xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06"'
        ' requiredextensions="p">',
        ' <metadata name="Application">BambuStudio-02.05.00.64</metadata>',
        ' <metadata name="BambuStudio:3mfVersion">1</metadata>',
        ' <resources>',
        f'  <object id="4" p:UUID="{assembly_uuid}" type="model">',
        '   <components>',
    ]
    for cfg in part_cfgs:
        comp_uuid = str(uuid.uuid4())
        out.append(
            f'    <component p:path="/3D/Objects/object_1.model"'
            f' objectid="{cfg["object_id"]}" p:UUID="{comp_uuid}"/>'
        )
    out += [
        '   </components>',
        '  </object>',
        ' </resources>',
        f' <build p:UUID="{build_uuid}">',
        f'  <item objectid="4" p:UUID="{item_uuid}"'
        '  transform="1 0 0 0 1 0 0 0 1 0 0 0" printable="1"/>',
        ' </build>',
        '</model>',
    ]
    return '\n'.join(out).encode('utf-8')


def _xml_model_settings(part_cfgs: list, total_faces: int, model_id: str = "model") -> bytes:
    """Gera o conteúdo de Metadata/model_settings.config."""
    obj_extruder = part_cfgs[0]['extruder'] if part_cfgs else 1
    out = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<config>',
        '  <object id="4">',
        f'    <metadata key="name" value="{model_id}_all"/>',
        f'    <metadata key="extruder" value="{obj_extruder}"/>',
        f'    <metadata face_count="{total_faces}"/>',
    ]
    for cfg in part_cfgs:
        z_off = _f3d(cfg['z_offset'])
        matrix = f'1 0 0 0 0 1 0 0 0 0 1 {z_off} 0 0 0 1'
        src_z  = _f3d(cfg['source_offset_z'])
        out += [
            f'    <part id="{cfg["object_id"]}" subtype="normal_part">',
            f'      <metadata key="name" value="{cfg["display_name"]}"/>',
            f'      <metadata key="extruder" value="{cfg["extruder"]}"/>',
            f'      <metadata key="matrix" value="{matrix}"/>',
            f'      <metadata key="source_file" value="{model_id}_all.3mf"/>',
            f'      <metadata key="source_object_id" value="{cfg["object_id"] - 1}"/>',
            f'      <metadata key="source_volume_id" value="0"/>',
            f'      <metadata key="source_offset_x" value="0"/>',
            f'      <metadata key="source_offset_y" value="0"/>',
            f'      <metadata key="source_offset_z" value="{src_z}"/>',
            f'      <mesh_stat face_count="{cfg["face_count"]}"'
            '  edges_fixed="0" degenerate_facets="0"'
            '  facets_removed="0" facets_reversed="0" backwards_edges="0"/>',
            '    </part>',
        ]
    out += [
        '  </object>',
        '  <plate>',
        '    <metadata key="plater_id" value="1"/>',
        '    <metadata key="plater_name" value=""/>',
        '    <metadata key="locked" value="false"/>',
        '    <metadata key="filament_map_mode" value="Auto For Flush"/>',
        '    <metadata key="filament_maps" value="1 1 1 1 1"/>',
        '    <metadata key="filament_volume_maps" value="0 0 0 0 0"/>',
        '    <model_instance>',
        '      <metadata key="object_id" value="4"/>',
        '      <metadata key="instance_id" value="0"/>',
        '    </model_instance>',
        '  </plate>',
        '  <assemble>',
        '   <assemble_item object_id="4" instance_id="0"'
        '  transform="1 0 0 0 1 0 0 0 1 0 0 0" offset="0 0 0" />',
        '  </assemble>',
        '</config>',
    ]
    return '\n'.join(out).encode('utf-8')


def _pack_bambu_3mf(
    model_id: str,
    parts_to_render: list,
    job_dir: str,
    mf_filepath: str,
    extruder_overrides: dict = None,  # ex: {"base": 3, "letters": 2}
) -> bool:
    """
    Cria um 3MF com metadados completos do Bambu Studio se existir
    models/<model_id>/bambu_template/.
    Retorna True em caso de sucesso; False faz o chamador recorrer ao
    fallback via trimesh.
    """
    template_dir = os.path.join(MODELS_DIR, model_id, 'bambu_template')
    if not os.path.isdir(template_dir):
        return False

    parts_cfg_path = os.path.join(template_dir, 'bambu_parts_config.json')
    if not os.path.exists(parts_cfg_path):
        return False

    with open(parts_cfg_path, 'r', encoding='utf-8') as fh:
        bambu_cfg = json.load(fh)
    part_defs = {p['scad_name']: p for p in bambu_cfg['parts']}

    # --- Carrega malhas ---
    meshes_raw: dict = {}
    for part in parts_to_render:
        stl_path = os.path.join(job_dir, f'{model_id}_{part}.stl')
        if not os.path.exists(stl_path):
            print(f'[BAMBU] STL não encontrado: {stl_path}', flush=True)
            return False
        loaded = trimesh.load(stl_path)
        if isinstance(loaded, trimesh.Scene):
            mesh = trimesh.util.concatenate(list(loaded.geometry.values()))
        else:
            mesh = loaded
        meshes_raw[part] = mesh

    # --- Normaliza Z: apoia todo o conjunto no plano Z=0 ---
    global_z_min = min(float(m.bounds[0][2]) for m in meshes_raw.values())
    for m in meshes_raw.values():
        m.apply_translation([0.0, 0.0, -global_z_min])

    # --- Monta configurações por parte ---
    part_cfgs = []
    total_faces = 0
    for idx, part in enumerate(parts_to_render):
        mesh = meshes_raw[part]
        defn = part_defs.get(part, {})
        face_count = len(mesh.faces)
        total_faces += face_count
        ov = extruder_overrides or {}
        part_cfgs.append({
            'object_id':      idx + 1,
            'scad_name':      part,
            'display_name':   defn.get('display_name', part),
            'extruder':       ov.get(part, defn.get('extruder', 1)),
            'face_count':     face_count,
            'z_offset':       0.0,
            'source_offset_z': float(mesh.bounds[0][2]),
            'mesh':           mesh,
        })

    # --- Gera XMLs dinâmicos ---
    obj1_xml     = _xml_object_1_model([(c['object_id'], c['mesh']) for c in part_cfgs])
    model3d_xml  = _xml_3dmodel(part_cfgs)
    settings_xml = _xml_model_settings(part_cfgs, total_faces, model_id)

    # --- Empacota o ZIP (.3mf) ---
    static_dir = os.path.join(template_dir, 'static')
    # Estes arquivos são gerados dinamicamente — não copiar do template estático
    _dynamic_entries = {
        '3D/Objects/object_1.model',
        '3D/3dmodel.model',
        'Metadata/model_settings.config',
    }
    try:
        with zipfile.ZipFile(mf_filepath, 'w', zipfile.ZIP_DEFLATED) as zf:
            # Arquivos estáticos do template (exceto os dinâmicos)
            if os.path.isdir(static_dir):
                for root, _dirs, files in os.walk(static_dir):
                    for fname in files:
                        abs_path = os.path.join(root, fname)
                        arc_path = os.path.relpath(abs_path, static_dir).replace('\\', '/')
                        if arc_path in _dynamic_entries:
                            continue
                        zf.write(abs_path, arc_path)
            # Arquivos dinâmicos (gerados por job)
            zf.writestr('3D/Objects/object_1.model', obj1_xml)
            zf.writestr('3D/3dmodel.model', model3d_xml)
            zf.writestr('Metadata/model_settings.config', settings_xml)
        print(f'[BAMBU] 3MF Bambu Studio gerado: {mf_filepath}', flush=True)
        return True
    except Exception as e:
        print(f'[BAMBU] Erro ao empacotar 3MF: {repr(e)}', flush=True)
        if os.path.exists(mf_filepath):
            os.remove(mf_filepath)
        return False


# ---------------------------------------------------------------------------
# Montagem de 3MF em lote: N modelos na mesma prancheta (223×223 mm)
# ---------------------------------------------------------------------------

PLATE_W = 223.0   # mm
PLATE_H = 223.0   # mm
# O bounding box medido pelo trimesh não inclui o outline_margin da base (~2.3mm).
# BATCH_GAP precisa cobrir 2× esse raio de arredondamento + folga visual.
BATCH_GAP = 15.0  # mm de margem entre peças


def _layout_rects(sizes: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """
    Distribui N retângulos (w, h) na prancheta usando shelf-packing simples.
    Retorna lista de (x, y) — canto inferior-esquerdo de cada peça,
    centralizada na prancheta ao final.
    Peças que não cabem na prancheta são empilhadas continuando além do limite
    (o Bambu Studio aceita e avisa o usuário).
    """
    positions = []
    x, y = 0.0, 0.0
    shelf_h = 0.0

    for w, h in sizes:
        if x + w > PLATE_W and x > 0:
            # Avança para a próxima prateleira
            x = 0.0
            y += shelf_h + BATCH_GAP
            shelf_h = 0.0
        positions.append((x, y))
        x += w + BATCH_GAP
        shelf_h = max(shelf_h, h)

    # Centraliza o conjunto na prancheta
    total_w = max((pos[0] + sz[0]) for pos, sz in zip(positions, sizes))
    total_h = max((pos[1] + sz[1]) for pos, sz in zip(positions, sizes))
    off_x = max(0.0, (PLATE_W - total_w) / 2.0)
    off_y = max(0.0, (PLATE_H - total_h) / 2.0)
    return [(px + off_x, py + off_y) for px, py in positions]


def _assemble_batch_3mf(
    model_id: str,
    render_tasks: list,
    results: dict,
    parts_to_render: list,
    batch_dir: str,
    output_path: str,
):
    """
    Carrega os STLs de cada nome, calcula layout na prancheta e gera
    um único .3mf com todos os objetos posicionados.
    Cada nome vira um grupo de partes (base + letras) tratado como
    um único objeto multicolor pelo Bambu Studio.
    """
    # Bambu template (estático) do modelo
    template_dir = os.path.join(MODELS_DIR, model_id, "bambu_template")
    parts_cfg_path = os.path.join(template_dir, "bambu_parts_config.json")
    with open(parts_cfg_path, "r", encoding="utf-8") as fh:
        bambu_cfg = json.load(fh)
    part_defs = {p["scad_name"]: p for p in bambu_cfg["parts"]}

    # ── 1. Carrega todas as malhas e calcula bounding boxes ──────────────
    items = []   # list of { name, name_hash, parts: {part: mesh}, bbox_w, bbox_h }
    for name, name_hash, src_hash, is_dup in render_tasks:
        stl_paths = results.get(src_hash if is_dup else name_hash)
        if not stl_paths:
            continue
        part_meshes = {}
        for part in parts_to_render:
            stl_p = stl_paths.get(part)
            if stl_p and os.path.exists(stl_p):
                loaded = trimesh.load(stl_p)
                mesh = (trimesh.util.concatenate(list(loaded.geometry.values()))
                        if isinstance(loaded, trimesh.Scene) else loaded)
                part_meshes[part] = mesh
        if not part_meshes:
            continue

        # Bounding box horizontal da peça (base define o footprint)
        all_verts = trimesh.util.concatenate(list(part_meshes.values())).vertices
        bbox_w = float(all_verts[:, 0].max() - all_verts[:, 0].min())
        bbox_h_y = float(all_verts[:, 1].max() - all_verts[:, 1].min())
        items.append({
            "name": name,
            "part_meshes": part_meshes,
            "bbox_w": bbox_w,
            "bbox_hy": bbox_h_y,
        })

    if not items:
        raise RuntimeError("Nenhum modelo renderizado com sucesso para montar o 3MF.")

    # ── 2. Layout na prancheta ───────────────────────────────────────────
    sizes = [(it["bbox_w"], it["bbox_hy"]) for it in items]
    positions = _layout_rects(sizes)

    # ── 3. Monta XMLs do 3MF ────────────────────────────────────────────
    # Cada parte de cada nome é um <object> separado em object_1.model
    # Todos compõem um único assembly no 3dmodel.model
    all_mesh_entries = []   # (object_id, mesh)
    all_part_cfgs    = []   # para model_settings.config
    obj_id = 1
    total_faces = 0

    for idx, (item, (px, py)) in enumerate(zip(items, positions)):
        # Normaliza Z: base no plano Z=0
        combined = trimesh.util.concatenate(list(item["part_meshes"].values()))
        z_min = float(combined.bounds[0][2])

        for part in parts_to_render:
            mesh = item["part_meshes"].get(part)
            if mesh is None:
                continue
            # Aplica translação (layout X,Y) + Z normalização
            m = mesh.copy()
            m.apply_translation([px, py, -z_min])
            defn = part_defs.get(part, {})
            fc = len(m.faces)
            total_faces += fc
            all_mesh_entries.append((obj_id, m))
            all_part_cfgs.append({
                "object_id":      obj_id,
                "scad_name":      part,
                "display_name":   f"{item['name']} - {defn.get('display_name', part)}",
                "extruder":       defn.get("extruder", 1),
                "face_count":     fc,
                "z_offset":       0.0,
                "source_offset_z": 0.0,
            })
            obj_id += 1

    # Gera XMLs
    obj1_xml     = _xml_object_1_model(all_mesh_entries)
    model3d_xml  = _xml_batch_3dmodel(all_part_cfgs)
    settings_xml = _xml_batch_model_settings(all_part_cfgs, total_faces, model_id, len(items))

    # ── 4. Empacota o ZIP (.3mf) ─────────────────────────────────────────
    static_dir = os.path.join(template_dir, "static")
    _dynamic_entries = {
        '3D/Objects/object_1.model',
        '3D/3dmodel.model',
        'Metadata/model_settings.config',
    }
    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zf:
        if os.path.isdir(static_dir):
            for root, _dirs, files in os.walk(static_dir):
                for fname in files:
                    abs_p = os.path.join(root, fname)
                    arc_p = os.path.relpath(abs_p, static_dir).replace("\\", "/")
                    if arc_p in _dynamic_entries:
                        continue
                    zf.write(abs_p, arc_p)
        zf.writestr("3D/Objects/object_1.model", obj1_xml)
        zf.writestr("3D/3dmodel.model", model3d_xml)
        zf.writestr("Metadata/model_settings.config", settings_xml)
    print(f"[BATCH] 3MF gerado: {output_path}", flush=True)


def _xml_batch_3dmodel(part_cfgs: list) -> bytes:
    """3dmodel.model para batch: cada peça é um componente separado num único assembly."""
    assembly_uuid = str(uuid.uuid4())
    build_uuid    = str(uuid.uuid4())
    item_uuid     = str(uuid.uuid4())
    out = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<model unit="millimeter" xml:lang="en-US"'
        ' xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"'
        ' xmlns:BambuStudio="http://schemas.bambulab.com/package/2021"'
        ' xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06"'
        ' requiredextensions="p">',
        ' <metadata name="Application">BambuStudio-02.05.00.64</metadata>',
        ' <metadata name="BambuStudio:3mfVersion">1</metadata>',
        ' <resources>',
        f'  <object id="999" p:UUID="{assembly_uuid}" type="model">',
        '   <components>',
    ]
    for cfg in part_cfgs:
        comp_uuid = str(uuid.uuid4())
        out.append(
            f'    <component p:path="/3D/Objects/object_1.model"'
            f' objectid="{cfg["object_id"]}" p:UUID="{comp_uuid}"/>'
        )
    out += [
        '   </components>',
        '  </object>',
        ' </resources>',
        f' <build p:UUID="{build_uuid}">',
        f'  <item objectid="999" p:UUID="{item_uuid}"'
        '  transform="1 0 0 0 1 0 0 0 1 0 0 0" printable="1"/>',
        ' </build>',
        '</model>',
    ]
    return '\n'.join(out).encode('utf-8')


def _xml_batch_model_settings(part_cfgs: list, total_faces: int, model_id: str, n_items: int) -> bytes:
    """model_settings.config para batch."""
    obj_extruder = part_cfgs[0]["extruder"] if part_cfgs else 1
    out = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<config>',
        '  <object id="999">',
        f'    <metadata key="name" value="{model_id}_batch_{n_items}"/>',
        f'    <metadata key="extruder" value="{obj_extruder}"/>',
        f'    <metadata face_count="{total_faces}"/>',
    ]
    for cfg in part_cfgs:
        out += [
            f'    <part id="{cfg["object_id"]}" subtype="normal_part">',
            f'      <metadata key="name" value="{cfg["display_name"]}"/>',
            f'      <metadata key="extruder" value="{cfg["extruder"]}"/>',
            f'      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>',
            f'      <metadata key="source_file" value="{model_id}_batch.3mf"/>',
            f'      <metadata key="source_object_id" value="{cfg["object_id"] - 1}"/>',
            f'      <metadata key="source_volume_id" value="0"/>',
            f'      <metadata key="source_offset_x" value="0"/>',
            f'      <metadata key="source_offset_y" value="0"/>',
            f'      <metadata key="source_offset_z" value="0"/>',
            f'      <mesh_stat face_count="{cfg["face_count"]}"'
            '  edges_fixed="0" degenerate_facets="0"'
            '  facets_removed="0" facets_reversed="0" backwards_edges="0"/>',
            '    </part>',
        ]
    out += [
        '  </object>',
        '  <plate>',
        '    <metadata key="plater_id" value="1"/>',
        '    <metadata key="plater_name" value=""/>',
        '    <metadata key="locked" value="false"/>',
        '    <metadata key="filament_map_mode" value="Auto For Flush"/>',
        '    <model_instance>',
        '      <metadata key="object_id" value="999"/>',
        '      <metadata key="instance_id" value="0"/>',
        '    </model_instance>',
        '  </plate>',
        '  <assemble>',
        '   <assemble_item object_id="999" instance_id="0"'
        '  transform="1 0 0 0 1 0 0 0 1 0 0 0" offset="0 0 0" />',
        '  </assemble>',
        '</config>',
    ]
    return '\n'.join(out).encode('utf-8')


def _inject_char_positions(scad_args: list, params: dict, model_dir: str) -> list:
    """
    Calcula a posição X de cada caractere usando os advance widths reais da fonte
    e injeta como parâmetros SCAD (chars1, char_xs1, chars2, char_xs2).
    O model.scad renderiza cada caractere individualmente em 3D, evitando o
    problema de furos causado pela regra even-odd do OpenSCAD em letras sobrepostas.

    Quando max_width > 0 e a largura natural do modelo (texto + outline_margin)
    exceder esse valor, injeta scale_x < 1 para que o .scad achate o modelo
    somente em X, mantendo altura (Z) intacta.
    """
    args = list(scad_args)
    font_name_val = params.get("font_name", "")
    font_family = font_name_val.split(":")[0].strip()

    if not font_family:
        return args  # sem fonte, fallback para text() padrão

    ttf_path = ensure_font_downloaded(font_family)
    if not ttf_path:
        return args  # falha no download, fallback

    max_line_w = 0.0  # largura abstrata principal
    global_min_x = 999999.0
    global_max_x = -999999.0
    line_actual_w: dict = {}  # total_w real por linha (escala correta de _compute_char_positions)

    for line_key, size_key, chars_param, xs_param in [
        ("text_line_1", "text_size_1", "chars1", "char_xs1"),
        ("text_line_2", "text_size_2", "chars2", "char_xs2"),
    ]:
        text_val = params.get(line_key, "")
        if not text_val:
            continue
        try:
            size_mm = float(params.get(size_key, 12))
            spacing = float(params.get("spacing", 1.0))
            word_spacing = float(params.get("word_spacing", 1.0))
        except ValueError:
            size_mm, spacing, word_spacing = 12.0, 1.0, 1.0

        try:
            data = _compute_char_positions(text_val, ttf_path, size_mm, spacing, word_spacing)
            # Centraliza cada linha individualmente em x=0 para que linhas de larguras
            # diferentes fiquem visualmente centralizadas uma sobre a outra.
            center_offset = -(data["total_w"]) / 2
            centered_positions = [round(p + center_offset, 4) for p in data["positions"]]
            xs_str = "[" + ",".join(f"{x}" for x in centered_positions) + "]"
            args.extend(["-D", f'{chars_param}="{text_val}"'])
            args.extend(["-D", f'{xs_param}={xs_str}'])
            adj_min_x = data["min_x"] + center_offset
            adj_max_x = data["max_x"] + center_offset
            print(f"[CHAR_POS] {line_key}='{text_val}' min_x={adj_min_x:.2f} max_x={adj_max_x:.2f}", flush=True)

            max_line_w = max(max_line_w, data["total_w"])
            global_min_x = min(global_min_x, adj_min_x)
            global_max_x = max(global_max_x, adj_max_x)
            line_actual_w[line_key] = data["total_w"]
        except Exception as exc:
            print(f"[CHAR_POS] Erro para '{line_key}': {exc}", flush=True)

    # ── Largura máxima ────────────────────────────────────────────────────
    try:
        max_width = float(params.get("max_width", 0))
        outline_margin = float(params.get("outline_margin", 2.3))
    except ValueError:
        max_width, outline_margin = 0.0, 2.3

    if global_min_x != 999999.0:
        args.extend(["-D", f"body_min_x={round(global_min_x, 6)}"])
        args.extend(["-D", f"body_max_x={round(global_max_x, 6)}"])

    # Ajustado de natural_w considerando o physical_span inteiro
    physical_span = (global_max_x - global_min_x) if global_min_x != 999999.0 else max_line_w
    natural_w = physical_span + 2 * outline_margin if physical_span > 0 else 0.0
    final_w = natural_w
    
    if max_width > 0 and physical_span > 0:
        if natural_w > max_width:
            scale_x = max_width / natural_w
            args.extend(["-D", f"scale_x={round(scale_x, 6)}"])
            final_w = max_width
            print(f"[MAX_WIDTH] natural={natural_w:.2f}mm > max={max_width}mm → scale_x={scale_x:.4f}", flush=True)

    if final_w > 0:
        args.extend(["-D", f"body_span_x={round(final_w, 6)}"])

    try:
        size1 = float(params.get("text_size_1", 12))
        size2 = float(params.get("text_size_2", 10))
        line_spacing = float(params.get("line_spacing", 1.0))
        text_2 = params.get("text_line_2", "")
    except ValueError:
        size1, size2, line_spacing, text_2 = 12.0, 10.0, 1.0, ""

    if text_2:
        line_y_0 = size2 * line_spacing * 0.6
        line_y_1 = -(size1 * line_spacing * 0.6)
        top_y = line_y_0 + (size1 / 2)
        bottom_y = line_y_1 - (size2 / 2)
        span_y = (top_y - bottom_y) + (2 * outline_margin)
    else:
        span_y = size1 + (2 * outline_margin)

    if span_y > 0:
        args.extend(["-D", f"body_span_y={round(span_y, 6)}"])

    # ── Preencher gap VERTICAL entre linha 1 e linha 2 ─────────────────────────
    # O gap existe quando as duas linhas de texto ficam com espaço entre elas
    # e o offset() não consegue uni-las com uma margem pequena.
    fill_word_gaps_raw = params.get("fill_word_gaps", "true")
    fill_word_gaps = str(fill_word_gaps_raw).lower() in ("true", "1", "yes", "on")
    print(f"[FILL_GAPS_DEBUG] raw={repr(fill_word_gaps_raw)}, parsed={fill_word_gaps}", flush=True)

    if fill_word_gaps:
        text_1 = params.get("text_line_1", "")
        text_2 = params.get("text_line_2", "")

        if text_1 and text_2:
            try:
                size1 = float(params.get("text_size_1", 12))
                size2 = float(params.get("text_size_2", 10))
                line_spacing_val = float(params.get("line_spacing", 1.0))
                spacing_val = float(params.get("spacing", 1.0))
                word_spacing_val = float(params.get("word_spacing", 1.0))
                outline_margin_val = float(params.get("outline_margin", 2.3))

                # Usa os total_w reais já calculados por _compute_char_positions (escala correta)
                # em vez de _line_total_w que usa cap_h (escala diferente).
                width_1 = line_actual_w.get("text_line_1", 0.0)
                width_2 = line_actual_w.get("text_line_2", 0.0)
                if not width_1 or not width_2:
                    raise ValueError("Widths não disponíveis")

                # Espelha _line_y() do SCAD:
                #   _line_y(0) = sizes[1] * line_spacing * 0.6  ← centro Y da linha 1 (cima)
                #   _line_y(1) = -sizes[0] * line_spacing * 0.6 ← centro Y da linha 2 (baixo)
                line_y_0 = size2 * line_spacing_val * 0.6
                line_y_1 = -(size1 * line_spacing_val * 0.6)

                # em base_2d(): translate([xs[i], _line_y(i) - size_i/2]) com valign="baseline"
                baseline_1 = line_y_0 - size1 / 2   # baseline da linha 1
                baseline_2 = line_y_1 - size2 / 2   # baseline da linha 2

                # Limites verticais visíveis das letras
                bottom_line1 = baseline_1                # fundo da linha 1 ≈ baseline
                top_line2    = baseline_2 + size2 * 0.7  # topo da linha 2 ≈ cap height

                vertical_gap = bottom_line1 - top_line2  # >0 = gap real; <0 = sobreposição

                print(f"[FILL_GAPS] bottom_line1={bottom_line1:.2f}, top_line2={top_line2:.2f}, vertical_gap={vertical_gap:.2f}mm", flush=True)

                # Injeta bridge sempre que o gap for menor que outline_margin
                # (sobreposição mínima cria "pescoço" fino que deixa buracos no offset)
                if vertical_gap > -(outline_margin_val * 0.5):
                    bridge_w = min(width_1, width_2)
                    bridge_h = max(vertical_gap + 0.2, 0.4)
                    x_center = 0.0   # ambas as linhas estão centralizadas em x=0
                    y_center = (bottom_line1 + top_line2) / 2

                    rects_str = f"[[{round(x_center,4)},{round(y_center,4)},{round(bridge_w,4)},{round(bridge_h,4)}]]"
                    args.extend(["-D", f"fill_gap_rects={rects_str}"])
                    print(f"[FILL_GAPS] Bridge injected: y_center={y_center:.2f}, w={bridge_w:.2f}, h={bridge_h:.2f}", flush=True)
                    print(f"[FILL_GAPS] SCAD arg: fill_gap_rects={rects_str}", flush=True)
                else:
                    print(f"[FILL_GAPS] Lines overlap {-vertical_gap:.2f}mm > threshold, no bridge needed", flush=True)

            except Exception as exc:
                import traceback
                print(f"[FILL_GAPS] ERROR: {exc}", flush=True)
                print(traceback.format_exc(), flush=True)
        else:
            print(f"[FILL_GAPS] Skipped: need both lines ('{text_1}' / '{text_2}')", flush=True)

    import sys
    print(f"[FILL_GAPS_FINAL] Returning args with {len(args)} elements", flush=True)
    sys.stdout.flush()
    return args


# ─────────────────────────────────────────────────────────────────────────────
# Detecção de paredes finas
# ─────────────────────────────────────────────────────────────────────────────

def _warn_thin_text_sizes(params: dict, min_feature_mm: float) -> list:
    """
    Opção 3: estima a espessura mínima do traço para cada linha de texto e
    avisa se essa estimativa ficar abaixo de min_feature_mm.
    Usa stem_ratio=0.12 (conservador para fontes cursivas/display).
    Para fontes com peso regular, traços típicos são ~12-15% do tamanho.
    """
    warnings = []
    STEM_RATIO = 0.12
    for key in ("text_size_1", "text_size_2"):
        raw = params.get(key)
        if not raw:
            continue
        try:
            size = float(raw)
        except (ValueError, TypeError):
            continue
        estimated_stroke = size * STEM_RATIO
        if estimated_stroke < min_feature_mm:
            min_safe = math.ceil(min_feature_mm / STEM_RATIO)
            warnings.append(
                f"Texto '{key}={size:.1f}mm': espessura estimada do traço "
                f"~{estimated_stroke:.2f}mm < mínimo recomendado {min_feature_mm}mm. "
                f"Partes da letra podem não ser fatiadas pelo fatiador. "
                f"Tente aumentar o tamanho para ≥{min_safe}mm."
            )
    return warnings


def _warn_thin_params(params: dict, model_config: dict) -> list:
    """
    Opção 4: verifica parâmetros que possuem 'min_safe_mm' declarado no
    config.json do modelo e avisa se o valor fornecido estiver abaixo desse limiar.
    """
    warnings = []
    all_params = list(model_config.get("parameters", []))
    for section in model_config.get("sections", []):
        all_params.extend(section.get("parameters", []))
    for p in all_params:
        min_safe = p.get("min_safe_mm")
        if min_safe is None:
            continue
        pid = p["id"]
        raw = params.get(pid)
        if raw is None:
            continue
        try:
            val = float(raw)
        except (ValueError, TypeError):
            continue
        if val < float(min_safe):
            warnings.append(
                f"'{p.get('name', pid)}' ({val}mm) está abaixo de {min_safe}mm: "
                f"essa espessura pode não ser impressa corretamente com bico 0.4mm."
            )
    return warnings


def _check_thin_walls_mesh(mesh, min_thickness_mm: float = 0.8, n_samples: int = 1500) -> tuple:
    """
    Opção 1: detecta paredes finas via ray casting nas faces verticais da malha.
    Lança raios para dentro da superfície ao longo das normais invertidas e mede
    a espessura no ponto de saída oposto.
    Retorna (fração_fina, espessura_mínima_mm):
      - fração_fina [0.0, 1.0]: fração de amostras com espessura < min_thickness_mm
      - espessura_mínima_mm: menor espessura medida (float('inf') se nenhum hit)
    Threshold de alerta: fração > 0.06 (6%) OU espessura_mínima < min_thickness_mm * 0.6
    """
    try:
        # Apenas faces "verticais": |normal.z| < 0.3 → paredes laterais das letras
        vert_mask = np.abs(mesh.face_normals[:, 2]) < 0.3
        if not np.any(vert_mask):
            return 0.0, float('inf')
        vert_indices = np.where(vert_mask)[0]
        n = min(n_samples, len(vert_indices))
        if n == 0:
            return 0.0, float('inf')

        rng = np.random.default_rng(42)  # seed fixo → resultado determinístico
        sampled = rng.choice(vert_indices, n, replace=False)

        normals = mesh.face_normals[sampled]                        # (n, 3)
        centers = mesh.vertices[mesh.faces[sampled]].mean(axis=1)  # (n, 3)
        origins = centers - normals * 0.01    # pequeno offset para dentro
        directions = -normals                  # direção: atravessa a parede

        locs, ray_ids, _ = mesh.ray.intersects_location(
            ray_origins=origins,
            ray_directions=directions,
            multiple_hits=False,
        )
        if len(locs) == 0:
            return 0.0, float('inf')

        thin_hits: set = set()
        min_thickness = float('inf')
        for i in range(len(ray_ids)):
            ri = int(ray_ids[i])
            dist = float(np.linalg.norm(locs[i] - origins[ri]))
            if 0.02 < dist:
                if dist < min_thickness:
                    min_thickness = dist
                if dist < min_thickness_mm:
                    thin_hits.add(ri)

        return len(thin_hits) / n, min_thickness
    except Exception as exc:
        print(f"[THIN_WALL] Erro no ray casting: {exc}", flush=True)
        return 0.0, float('inf')


@router.post("/clear_cache")
async def clear_cache():
    """Remove todos os arquivos e diretórios gerados em static/generated."""
    removed = 0
    if os.path.isdir(GENERATED_DIR):
        for entry in os.scandir(GENERATED_DIR):
            try:
                if entry.is_dir():
                    shutil.rmtree(entry.path)
                else:
                    os.remove(entry.path)
                removed += 1
            except Exception:
                pass
    return {"removed": removed}


@router.get("/models/{model_id}/config")
async def get_model_config(model_id: str):
    """
    Retorna o config.json do modelo para que o frontend possa desenhar os controles
    dinamicamente (Server-Driven UI).
    """
    config_path = os.path.join(MODELS_DIR, model_id, "config.json")
    if not os.path.exists(config_path):
        return JSONResponse(status_code=404, content={"error": "Configuração não encontrada"})

    with open(config_path, "r", encoding="utf-8") as f:
        config_data = json.load(f)

    return config_data


@router.post("/convert/png-to-svg")
async def convert_png_to_svg(file: UploadFile):
    """
    Recebe um arquivo PNG e retorna o SVG vetorizado como texto.
    Usado pelo frontend para converter PNGs antes de abrir o modal de edição SVG.
    """
    raw = await file.read()
    if not (raw[:8] == b'\x89PNG\r\n\x1a\n'):
        return JSONResponse(status_code=422, content={"error": "Arquivo enviado não é um PNG válido."})
    try:
        svg_bytes = _png_bytes_to_svg(raw)
    except Exception as exc:
        return JSONResponse(status_code=500, content={"error": f"Falha na conversão: {exc}"})
    from fastapi.responses import Response
    return Response(content=svg_bytes, media_type="image/svg+xml")


@router.post("/generate/{model_id}")
async def generate_model(
    request: Request,
    model_id: str,
    linhas_svg: UploadFile = Form(...),
    silhueta_svg: UploadFile = Form(...),
):
    scad_path = os.path.join(MODELS_DIR, model_id, "model.scad")
    if not os.path.exists(scad_path):
        return JSONResponse(status_code=404, content={"error": "Model not found"})

    # Lê os bytes dos SVGs e os parâmetros do form antes de qualquer I/O de disco,
    # para que o hash possa ser calculado antes de criar diretórios.
    linhas_bytes_raw = await linhas_svg.read()
    silhueta_bytes_raw = await silhueta_svg.read()
    form_data = await request.form()

    # Parâmetros de texto do form (exclui os campos de arquivo já lidos acima)
    file_keys = {"linhas_svg", "silhueta_svg"}
    text_params = sorted(
        (k, v) for k, v in form_data.items()
        if k not in file_keys and isinstance(v, str)
    )

    # Cache MD5: hash determinístico de tudo que compõe este job
    hasher = hashlib.md5()
    hasher.update(model_id.encode())
    hasher.update(linhas_bytes_raw)
    hasher.update(silhueta_bytes_raw)
    for k, v in text_params:
        hasher.update(f"{k}={v}".encode())
    job_id = hasher.hexdigest()[:16]

    # Parse config to find parts
    config_path = os.path.join(MODELS_DIR, model_id, "config.json")
    model_config = {}
    if os.path.exists(config_path):
        with open(config_path, "r", encoding="utf-8") as f:
            model_config = json.load(f)
    parts_to_render = list(model_config.get("parts", ["carimbo_base", "carimbo_arte", "cortador"]))

    # Para carimbo_eva_svg: se art_relief_positive=False, molde_arte é um placeholder vazio —
    # remove-o da lista para não incluir geometria vazia no 3MF.
    art_relief_raw = dict(text_params).get("art_relief_positive", "true")
    if art_relief_raw.lower() in ("false", "0") and "molde_arte" in parts_to_render:
        parts_to_render.remove("molde_arte")

    job_dir = os.path.join(GENERATED_DIR, job_id)
    mf_filename = f"{model_id}_all.3mf"
    mf_filepath = os.path.join(job_dir, mf_filename)

    # Cache hit: 3MF já existe para estes parâmetros exatos
    if os.path.exists(mf_filepath):
        print(f"[CACHE HIT] job_id={job_id}", flush=True)
        cached_urls = {p: f"/static/generated/{job_id}/{model_id}_{p}.stl" for p in parts_to_render}
        cached_urls["3mf"] = f"/static/generated/{job_id}/{mf_filename}"
        return {"success": True, "job_id": job_id, "files": cached_urls, "from_cache": True}

    # Cache miss: cria o diretório do job e processa
    _cleanup_old_jobs()
    os.makedirs(job_dir, exist_ok=True)

    # DEBUG: print raw SVG header to inspect viewBox from Paper.js
    print(f"[DEBUG linhas.svg first 300]: {linhas_bytes_raw[:300].decode('utf-8','ignore')}", flush=True)
    # normalize_svg_viewbox é intencionalmente omitido aqui: ele adicionava um <g transform> baseado
    # no offset do viewBox, que se acumulava incorretamente com o <g transform> de normalize_svg_to_origin
    # (o qual calcula os bounds a partir dos atributos 'd' brutos, sem considerar o translate externo).
    # normalize_svg_to_origin é suficiente: ele substitui o viewBox pelo tamanho real do conteúdo e
    # aplica um único translate que leva o conteúdo exatamente para a origem.
    linhas_bytes = normalize_svg_to_origin(linhas_bytes_raw)
    print(f"[DEBUG linhas.svg after normalize first 400]: {linhas_bytes[:400].decode('utf-8','ignore')}", flush=True)

    linhas_path = os.path.join(job_dir, "linhas.svg")
    with open(linhas_path, "wb") as f:
        f.write(linhas_bytes)

    # Normaliza a silhueta da mesma forma que as linhas: garante que o conteúdo
    # começa em (0,0) e o viewBox equivale exatamente ao tamanho do conteúdo.
    # Isso é necessário para que resize([art_width, art_height]) no SCAD
    # funcione corretamente ao importar svg_silhueta_path.
    silhueta_bytes = normalize_svg_to_origin(silhueta_bytes_raw)
    silhueta_path = os.path.join(job_dir, "silhueta.svg")
    with open(silhueta_path, "wb") as f:
        f.write(silhueta_bytes)

    # Monta os argumentos -D base para o OpenSCAD (sem a parte — injetada por worker)
    scad_variables_base = [
        "-D", f'svg_linhas_path="{linhas_path}"',
        "-D", f'svg_silhueta_path="{silhueta_path}"',
    ]
    for key, value in text_params:
        scad_variables_base.extend(["-D", _to_scad_assignment(key, value)])

    font_path = f"{FONTS_DIR}:{os.path.join(MODELS_DIR, model_id)}"

    def render_part(part: str) -> tuple[str, str] | tuple[str, Exception]:
        """Renderiza uma parte via OpenSCAD. Retorna (part, output_path) ou (part, exceção)."""
        output_filename = f"{model_id}_{part}.stl"
        output_path = os.path.join(job_dir, output_filename)

        # Reutiliza STL existente (pode ocorrer quando o 3MF anterior falhou)
        if os.path.exists(output_path):
            return part, output_path

        cmd = [
            "openscad",
            "-o", output_path,
            *scad_variables_base,
            "-D", f'part="{part}"',
            scad_path,
        ]
        env = os.environ.copy()
        env["OPENSCAD_FONT_PATH"] = font_path
        try:
            subprocess.run(cmd, check=True, capture_output=True, text=True,
                           env=env, timeout=OPENSCAD_TIMEOUT)
            return part, output_path
        except subprocess.TimeoutExpired:
            return part, TimeoutError(f"OpenSCAD timeout ({OPENSCAD_TIMEOUT}s) na parte '{part}'")
        except subprocess.CalledProcessError as e:
            return part, RuntimeError(e.stderr)
        except Exception as e:
            return part, RuntimeError(f"Erro inesperado na parte '{part}': {repr(e)}")

    # Renderiza as 3 partes em paralelo
    generated_urls = {}
    errors = {}
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = {pool.submit(render_part, p): p for p in parts_to_render}
        for future in as_completed(futures):
            part, result = future.result()
            if isinstance(result, Exception):
                errors[part] = str(result)
            else:
                generated_urls[part] = f"/static/generated/{job_id}/{model_id}_{part}.stl"

    if errors:
        print(f"[ERROR] Falha na renderização: {errors}", flush=True)
        return JSONResponse(status_code=500, content={"error": "OpenSCAD falhou", "details": errors})

    # --- Monta 3MF: tenta Bambu Studio primeiro, cai no trimesh como fallback ---
    bambu_ok = _pack_bambu_3mf(model_id, parts_to_render, job_dir, mf_filepath)
    if bambu_ok:
        generated_urls["3mf"] = f"/static/generated/{job_id}/{mf_filename}"
    else:
        # Fallback: exporta via trimesh (sem metadados Bambu Studio)
        try:
            meshes = []
            color_map = {
                "carimbo_base": [100, 100, 255, 255],
                "carimbo_arte": [255, 100, 100, 255],
                "cortador":     [100, 255, 100, 255],
                "base":         [100, 100, 255, 255],
                "svg":          [255, 100, 100, 255],
            }
            name_map = {
                "carimbo_base": "Base do Carimbo",
                "carimbo_arte": "Arte do Carimbo",
                "cortador":     "Cortador",
            }
            for part in parts_to_render:
                stl_path = os.path.join(job_dir, f"{model_id}_{part}.stl")
                if os.path.exists(stl_path):
                    loaded = trimesh.load(stl_path)
                    if isinstance(loaded, trimesh.Scene):
                        mesh = trimesh.util.concatenate(list(loaded.geometry.values()))
                    else:
                        mesh = loaded
                    mesh.metadata['name'] = name_map.get(part, part)
                    mesh.visual.face_colors = color_map.get(part, [200, 200, 200, 255])
                    meshes.append(mesh)
            if meshes:
                scene = trimesh.Scene(meshes)
                scene.export(mf_filepath, file_type='3mf')
                generated_urls["3mf"] = f"/static/generated/{job_id}/{mf_filename}"
        except Exception as e:
            print(f"[FALLBACK] Erro ao exportar 3MF via trimesh: {repr(e)}")

    return {"success": True, "job_id": job_id, "files": generated_urls, "from_cache": False}


@router.post("/generate_parametric/{model_id}")
async def generate_parametric_model(request: Request, model_id: str):
    """
    Endpoint genérico para modelos paramétricos (sem upload de SVG).
    Recebe apenas form data com os parâmetros do modelo.
    Se o config.json declarar output_format="3mf" e parts=[...],
    renderiza múltiplas partes em paralelo e monta um 3MF multicolor.
    Caso contrário, retorna um único STL.
    """
    scad_path = os.path.join(MODELS_DIR, model_id, "model.scad")
    if not os.path.exists(scad_path):
        return JSONResponse(status_code=404, content={"error": "Model not found"})

    # Lê config.json para identificar output_format e partes do modelo
    config_path = os.path.join(MODELS_DIR, model_id, "config.json")
    model_config = {}
    if os.path.exists(config_path):
        with open(config_path, "r", encoding="utf-8") as f:
            model_config = json.load(f)

    output_format = model_config.get("output_format", "stl")
    parts_to_render = model_config.get("parts")  # lista ou None

    form_data = await request.form()
    text_params = sorted(
        (k, v) for k, v in form_data.items()
        if isinstance(v, str)
    )

    # Lê uploads de SVG/PNG para modelos que declaram svg_uploads no config.json.
    # Se o arquivo enviado for PNG, converte para SVG antes de prosseguir.
    # Os bytes são lidos antes do hash para incluí-los no cálculo do cache.
    svg_upload_fields: list = model_config.get("svg_uploads", [])
    svg_bytes_map: dict = {}  # field_name -> bytes SVG normalizados
    for _svg_field in svg_upload_fields:
        _item = form_data.get(_svg_field)
        if _item is not None and not isinstance(_item, str):
            _raw = await _item.read()
            _filename = getattr(_item, "filename", "") or ""
            _is_png = (
                _filename.lower().endswith(".png")
                or (getattr(_item, "content_type", "") or "").lower() in ("image/png",)
                or (_raw[:8] == b'\x89PNG\r\n\x1a\n')  # magic bytes PNG
            )
            if _is_png:
                print(f"[PNG→SVG] Convertendo '{_filename}' para SVG...", flush=True)
                try:
                    _raw = _png_bytes_to_svg(_raw)
                    print(f"[PNG→SVG] Conversão concluída ({len(_raw)} bytes SVG)", flush=True)
                except Exception as _conv_err:
                    return JSONResponse(
                        status_code=422,
                        content={"error": f"Falha ao converter PNG para SVG: {_conv_err}"},
                    )
            svg_bytes_map[_svg_field] = normalize_svg_to_origin(_raw)

    # Hash determinístico para cache
    # Inclui assinatura dos arquivos do modelo para invalidar cache
    # automaticamente quando model.scad/config.json forem alterados.
    hasher = hashlib.md5()
    hasher.update(model_id.encode())
    try:
        scad_stat = os.stat(scad_path)
        hasher.update(str(scad_stat.st_mtime_ns).encode())
        hasher.update(str(scad_stat.st_size).encode())
    except OSError:
        pass
    if os.path.exists(config_path):
        try:
            config_stat = os.stat(config_path)
            hasher.update(str(config_stat.st_mtime_ns).encode())
            hasher.update(str(config_stat.st_size).encode())
        except OSError:
            pass
    for k, v in text_params:
        hasher.update(f"{k}={v}".encode())
    # Inclui bytes dos SVGs no hash para invalidar cache quando a arte mudar
    for _svg_field in sorted(svg_bytes_map.keys()):
        hasher.update(f"file:{_svg_field}=".encode())
        hasher.update(svg_bytes_map[_svg_field])
    job_id = hasher.hexdigest()[:16]

    # ── Detecção de paredes finas (Opções 3 e 4) ─────────────────────────────
    # Executado sempre, inclusive em cache hits, pois é rápido (sem I/O de disco).
    _params_dict = dict(text_params)
    _min_feature_mm = float(model_config.get("min_feature_size_mm", 0.0))
    gen_warnings: list = []
    gen_thin_parts: list = []
    if _min_feature_mm > 0:
        gen_warnings += _warn_thin_params(_params_dict, model_config)
        if model_config.get("text_to_svg"):
            gen_warnings += _warn_thin_text_sizes(_params_dict, _min_feature_mm)
    if gen_warnings:
        print(f"[THIN_WALL] {len(gen_warnings)} aviso(s) de parede fina detectado(s)", flush=True)

    job_dir = os.path.join(GENERATED_DIR, job_id)
    font_path = f"{FONTS_DIR}:{os.path.join(MODELS_DIR, model_id)}"

    # ── Fluxo multipart 3MF ───────────────────────────────────────────────
    if output_format == "3mf" and parts_to_render:
        mf_filename = f"{model_id}_all.3mf"
        mf_filepath = os.path.join(job_dir, mf_filename)

        if os.path.exists(mf_filepath):
            print(f"[CACHE HIT parametric 3mf] job_id={job_id}", flush=True)
            cached_urls = {p: f"/static/generated/{job_id}/{model_id}_{p}.stl" for p in parts_to_render}
            cached_urls["3mf"] = f"/static/generated/{job_id}/{mf_filename}"
            # Ray casting também no cache hit
            if model_config.get("thin_wall_check") and _min_feature_mm > 0:
                for _check_part in ("letters", "svg", "nome"):
                    _stl_p = os.path.join(job_dir, f"{model_id}_{_check_part}.stl")
                    if not os.path.exists(_stl_p):
                        continue
                    try:
                        _loaded = trimesh.load(_stl_p)
                        _mesh = (trimesh.util.concatenate(list(_loaded.geometry.values()))
                                 if isinstance(_loaded, trimesh.Scene) else _loaded)
                        _frac, _min_thick = _check_thin_walls_mesh(_mesh, _min_feature_mm)
                        _critical_thin = _min_thick < _min_feature_mm * 0.6
                        if _frac > 0.06 or _critical_thin:
                            gen_thin_parts.append(_check_part)
                            _min_str = f"{_min_thick:.2f}mm" if _min_thick != float('inf') else "?"
                            gen_warnings.append(
                                f"Parte '{_check_part}': {_frac * 100:.0f}% das faces laterais "
                                f"têm espessura < {_min_feature_mm}mm "
                                f"(mínimo detectado: {_min_str}). "
                                f"Alguns traços podem não ser fatiados."
                            )
                    except Exception as _exc:
                        print(f"[THIN_WALL cache] Erro ao verificar '{_check_part}': {_exc}", flush=True)
            return {"success": True, "job_id": job_id, "files": cached_urls, "from_cache": True, "warnings": gen_warnings, "thin_wall_parts": gen_thin_parts}

        _cleanup_old_jobs()
        os.makedirs(job_dir, exist_ok=True)

        # Salva os SVGs no diretório do job e injeta os caminhos como args SCAD
        for _svg_field, _svg_bytes in svg_bytes_map.items():
            _svg_path = os.path.join(job_dir, f"{_svg_field}.svg")
            with open(_svg_path, "wb") as _f:
                _f.write(_svg_bytes)
            print(f"[SVG UPLOAD] Salvo: {_svg_path}", flush=True)

        scad_args_base = []
        for key, value in text_params:
            scad_args_base.extend(["-D", _to_scad_assignment(key, value)])
        # Injeta caminhos dos SVGs (devem sobrescrever os defaults do SCAD)
        for _svg_field, _svg_bytes in svg_bytes_map.items():
            _svg_path = os.path.join(job_dir, f"{_svg_field}.svg")
            scad_args_base.extend(["-D", f'{_svg_field}="{_svg_path}"'])

        # Injeta posições de caracteres (quando text_to_svg=true no config.json)
        if model_config.get("text_to_svg"):
            scad_args_base = _inject_char_positions(
                scad_args_base, dict(text_params),
                os.path.join(MODELS_DIR, model_id)
            )

        def render_part(part: str) -> tuple:
            output_filename = f"{model_id}_{part}.stl"
            output_path = os.path.join(job_dir, output_filename)
            if os.path.exists(output_path):
                return part, output_path
            cmd = [
                "openscad", "-o", output_path,
                *scad_args_base,
                "-D", f'part="{part}"',
                scad_path,
            ]
            env = os.environ.copy()
            env["OPENSCAD_FONT_PATH"] = font_path
            try:
                subprocess.run(cmd, check=True, capture_output=True, text=True,
                               env=env, timeout=OPENSCAD_TIMEOUT)
                return part, output_path
            except subprocess.TimeoutExpired:
                return part, TimeoutError(f"OpenSCAD timeout ({OPENSCAD_TIMEOUT}s) na parte '{part}'")
            except subprocess.CalledProcessError as e:
                return part, RuntimeError(e.stderr)
            except Exception as e:
                return part, RuntimeError(repr(e))

        generated_urls = {}
        errors = {}
        with ThreadPoolExecutor(max_workers=len(parts_to_render)) as pool:
            futures = {pool.submit(render_part, p): p for p in parts_to_render}
            for future in as_completed(futures):
                part, result = future.result()
                if isinstance(result, Exception):
                    errors[part] = str(result)
                else:
                    generated_urls[part] = f"/static/generated/{job_id}/{model_id}_{part}.stl"

        if errors:
            print(f"[PARAMETRIC 3MF ERROR] {errors}", flush=True)
            return JSONResponse(status_code=500, content={"error": "OpenSCAD falhou", "details": errors})

        # ── Opção 1: ray casting nas malhas geradas ───────────────────────────────
        # Verifica paredes laterais das peças de texto/SVG após renderização.
        if model_config.get("thin_wall_check") and _min_feature_mm > 0:
            for _check_part in ("letters", "svg", "nome"):
                _stl_p = os.path.join(job_dir, f"{model_id}_{_check_part}.stl")
                if not os.path.exists(_stl_p):
                    continue
                try:
                    _loaded = trimesh.load(_stl_p)
                    _mesh = (trimesh.util.concatenate(list(_loaded.geometry.values()))
                             if isinstance(_loaded, trimesh.Scene) else _loaded)
                    _frac, _min_thick = _check_thin_walls_mesh(_mesh, _min_feature_mm)
                    print(f"[THIN_WALL] Parte '{_check_part}': fração fina={_frac:.2f}, min_thick={_min_thick:.2f}mm", flush=True)
                    _critical_thin = _min_thick < _min_feature_mm * 0.6
                    if _frac > 0.06 or _critical_thin:
                        gen_thin_parts.append(_check_part)
                        _min_str = f"{_min_thick:.2f}mm" if _min_thick != float('inf') else "?"
                        gen_warnings.append(
                            f"Parte '{_check_part}': {_frac * 100:.0f}% das faces laterais "
                            f"têm espessura < {_min_feature_mm}mm "
                            f"(mínimo detectado: {_min_str}). "
                            f"Alguns traços podem não ser fatiados."
                        )
                except Exception as _exc:
                    print(f"[THIN_WALL] Erro ao verificar '{_check_part}': {_exc}", flush=True)

        ov = {}
        for k, v in text_params:
            if k == "extrusor_base":
                try: ov["base"] = int(v)
                except ValueError: pass
            elif k == "extrusor_letras":
                try:
                    val = int(v)
                    ov["letters"] = val
                    ov["svg"] = val  # para modelos com parte "svg" (ex: topo_bolo_svg)
                except ValueError: pass

        bambu_ok = _pack_bambu_3mf(model_id, parts_to_render, job_dir, mf_filepath, extruder_overrides=ov)
        if bambu_ok:
            generated_urls["3mf"] = f"/static/generated/{job_id}/{mf_filename}"
        else:
            try:
                meshes = []
                for part in parts_to_render:
                    stl_path = os.path.join(job_dir, f"{model_id}_{part}.stl")
                    if os.path.exists(stl_path):
                        loaded = trimesh.load(stl_path)
                        mesh = (trimesh.util.concatenate(list(loaded.geometry.values()))
                                if isinstance(loaded, trimesh.Scene) else loaded)
                        meshes.append(mesh)
                if meshes:
                    trimesh.Scene(meshes).export(mf_filepath, file_type='3mf')
                    generated_urls["3mf"] = f"/static/generated/{job_id}/{mf_filename}"
            except Exception as e:
                print(f"[PARAMETRIC FALLBACK] Erro ao exportar 3MF via trimesh: {repr(e)}")

        return {"success": True, "job_id": job_id, "files": generated_urls, "from_cache": False, "warnings": gen_warnings, "thin_wall_parts": gen_thin_parts}

    # ── Fluxo STL único (original) ────────────────────────────────────────
    output_filename = f"{model_id}.stl"
    output_path = os.path.join(job_dir, output_filename)

    if os.path.exists(output_path):
        print(f"[CACHE HIT parametric] job_id={job_id}", flush=True)
        return {
            "success": True,
            "job_id": job_id,
            "files": {"model": f"/static/generated/{job_id}/{output_filename}"},
            "from_cache": True,
            "warnings": gen_warnings,
        }

    _cleanup_old_jobs()
    os.makedirs(job_dir, exist_ok=True)

    scad_args = []
    for key, value in text_params:
        scad_args.extend(["-D", _to_scad_assignment(key, value)])

    cmd = ["openscad", "-o", output_path, *scad_args, scad_path]
    env = os.environ.copy()
    env["OPENSCAD_FONT_PATH"] = font_path

    try:
        result = subprocess.run(
            cmd, check=True, capture_output=True, text=True,
            env=env, timeout=OPENSCAD_TIMEOUT,
        )
        print(f"[PARAMETRIC] Gerado: {output_path}", flush=True)
    except subprocess.TimeoutExpired:
        return JSONResponse(
            status_code=500,
            content={"error": f"OpenSCAD timeout ({OPENSCAD_TIMEOUT}s)"},
        )
    except subprocess.CalledProcessError as e:
        print(f"[PARAMETRIC ERROR] {e.stderr}", flush=True)
        return JSONResponse(
            status_code=500,
            content={"error": "OpenSCAD falhou", "details": e.stderr},
        )
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": repr(e)})

    return {
        "success": True,
        "job_id": job_id,
        "files": {"model": f"/static/generated/{job_id}/{output_filename}"},
        "from_cache": False,
        "warnings": gen_warnings,
    }


# ─────────────────────────────────────────────────────────────────────────────
# BATCH: gera um 3MF com múltiplos letreiros na mesma prancheta
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/batch_status/{batch_id}")
async def batch_status(batch_id: str):
    """Retorna o estado atual de um job de batch."""
    with _batch_jobs_lock:
        job = _batch_jobs.get(batch_id)
    if not job:
        return JSONResponse(status_code=404, content={"error": "Job não encontrado"})
    return job


@router.post("/generate_batch/{model_id}")
async def generate_batch(request: Request, model_id: str):
    """
    Gera um 3MF único com N instâncias do modelo, cada uma com um nome diferente.
    Body: multipart/form-data com:
      - names: JSON array string, ex: '[{"nome":"ALICE"},{"nome":"PEDRO"}]'
      - todos os outros parâmetros do modelo (exceto text_line_1, que é substituído)
    Retorna imediatamente { batch_id } e processa em background.
    """
    scad_path = os.path.join(MODELS_DIR, model_id, "model.scad")
    if not os.path.exists(scad_path):
        return JSONResponse(status_code=404, content={"error": "Model not found"})

    config_path = os.path.join(MODELS_DIR, model_id, "config.json")
    model_config = {}
    if os.path.exists(config_path):
        with open(config_path, "r", encoding="utf-8") as f:
            model_config = json.load(f)

    parts_to_render = model_config.get("parts", ["base", "letters"])
    font_path = f"{FONTS_DIR}:{os.path.join(MODELS_DIR, model_id)}"

    form_data = await request.form()

    # Lê e valida a lista de nomes
    raw_names = form_data.get("names", "[]")
    try:
        names_list = json.loads(raw_names)
        names = [str(item.get("nome", "")).strip() for item in names_list if item.get("nome")]
        # extrusor_overrides: lista paralela a names, cada item é {} ou {"base":N, "letters":N}
        names_extruders = []
        for item in names_list:
            if not item.get("nome"):
                continue
            ov = {}
            if "extrusor_base" in item:
                ov["base"] = int(item["extrusor_base"])
            if "extrusor_letras" in item:
                val = int(item["extrusor_letras"])
                ov["letters"] = val
                ov["svg"] = val  # para modelos com parte "svg" (ex: topo_bolo_svg)
            names_extruders.append(ov)
    except Exception:
        return JSONResponse(status_code=400, content={"error": "Campo 'names' inválido. Esperado JSON array de objetos com 'nome'."})

    if not names:
        return JSONResponse(status_code=400, content={"error": "Lista de nomes vazia."})

    # Parâmetros base (sem 'names' e sem 'text_line_1' — será injetado por nome)
    skip_keys = {"names", "text_line_1"}
    base_params = {k: v for k, v in form_data.items()
                   if isinstance(v, str) and k not in skip_keys}

    # Gera batch_id único para este job
    hasher = hashlib.md5()
    hasher.update(model_id.encode())
    hasher.update(raw_names.encode())
    for k, v in sorted(base_params.items()):
        hasher.update(f"{k}={v}".encode())
    batch_id = hasher.hexdigest()[:16]

    batch_dir = os.path.join(GENERATED_DIR, f"batch_{batch_id}")
    batch_zip = os.path.join(batch_dir, f"{model_id}_batch.zip")

    # Cache hit
    if os.path.exists(batch_zip):
        print(f"[BATCH CACHE HIT] batch_id={batch_id}", flush=True)
        return {
            "batch_id": batch_id,
            "status": "done",
            "file": f"/static/generated/batch_{batch_id}/{model_id}_batch.zip",
            "total": len(names),
            "done": len(names),
            "from_cache": True,
        }

    # Inicializa estado do job
    with _batch_jobs_lock:
        _batch_jobs[batch_id] = {
            "status": "running",
            "total": len(names),
            "done": 0,
            "errors": [],
            "file": None,
        }

    _cleanup_old_jobs()
    os.makedirs(batch_dir, exist_ok=True)

    def _run_batch():
        """Executa toda a renderização em background."""
        # Monta pares (nome, scad_args) — nomes duplicados reutilizam STLs via hash
        render_tasks = []
        seen: dict = {}  # nome_hash → job_subdir

        for name, extruder_ov in zip(names, names_extruders):
            # Hash individual para cache de peça (apenas geometria, não extrusor)
            h = hashlib.md5()
            h.update(model_id.encode())
            h.update(name.encode())
            for k, v in sorted(base_params.items()):
                h.update(f"{k}={v}".encode())
            name_hash = h.hexdigest()[:12]

            if name_hash in seen:
                # Duplicado — STLs reutilizados, mas 3MF gerado por nome (extrusor pode diferir)
                render_tasks.append((name, name_hash, seen[name_hash], True, extruder_ov))
            else:
                seen[name_hash] = name_hash
                render_tasks.append((name, name_hash, name_hash, False, extruder_ov))

        # Diretórios individuais de cache dentro de batch_dir
        def render_one(name: str, name_hash: str, src_hash: str, is_dup: bool, extruder_ov: dict = None):
            piece_dir = os.path.join(batch_dir, name_hash)
            os.makedirs(piece_dir, exist_ok=True)

            stl_paths = {}

            # Monta os args SCAD uma única vez para todas as partes
            # split_name_on_space: divide no primeiro espaço (ex: "João Batista" → linha1 + linha2)
            if model_config.get("split_name_on_space"):
                name_parts = name.split(" ", 1)
                line1 = name_parts[0]
                line2 = name_parts[1] if len(name_parts) > 1 else ""
            else:
                line1, line2 = name, ""
            scad_args = ["-D", _to_scad_assignment("text_line_1", line1),
                         "-D", _to_scad_assignment("text_line_2", line2)]
            for k, v in base_params.items():
                scad_args.extend(["-D", _to_scad_assignment(k, v)])

            # Injeta posições de caracteres para este nome
            if model_config.get("text_to_svg"):
                scad_args = _inject_char_positions(
                    scad_args,
                    {"text_line_1": line1, "text_line_2": line2, **base_params},
                    font_path
                )

            for part in parts_to_render:
                out = os.path.join(piece_dir, f"{model_id}_{part}.stl")
                stl_paths[part] = out

                if os.path.exists(out):
                    continue  # cache hit da peça

                cmd = ["openscad", "-o", out,
                       *scad_args,
                       "-D", f'part="{part}"',
                       scad_path]
                env = os.environ.copy()
                env["OPENSCAD_FONT_PATH"] = font_path
                try:
                    subprocess.run(cmd, check=True, capture_output=True,
                                   text=True, env=env, timeout=OPENSCAD_TIMEOUT)
                except Exception as exc:
                    return name, None, str(exc)

            return name, stl_paths, None

        # Submete todas as tarefas únicas em paralelo (máx 4 workers)
        unique_tasks = [(n, nh, sh, d, ov) for n, nh, sh, d, ov in render_tasks if not d]
        dup_tasks    = [(n, nh, sh, d, ov) for n, nh, sh, d, ov in render_tasks if d]

        results: dict = {}  # name_hash → stl_paths
        MAX_WORKERS = 4

        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
            futures = {pool.submit(render_one, n, nh, sh, False): nh
                       for n, nh, sh, _, _ov in unique_tasks}
            for future in as_completed(futures):
                name_hash = futures[future]
                name, stl_paths, err = future.result()
                if err:
                    with _batch_jobs_lock:
                        _batch_jobs[batch_id]["errors"].append(f"{name}: {err}")
                else:
                    results[name_hash] = stl_paths
                with _batch_jobs_lock:
                    _batch_jobs[batch_id]["done"] += 1
                print(f"[BATCH] {name} done ({_batch_jobs[batch_id]['done']}/{len(unique_tasks)})", flush=True)

        # Duplicados: apenas incrementa contagem
        for n, nh, sh, _, _ov in dup_tasks:
            results[nh] = results.get(sh, {})
            with _batch_jobs_lock:
                _batch_jobs[batch_id]["done"] += 1

        # Verifica se houve erros fatais
        with _batch_jobs_lock:
            errs = list(_batch_jobs[batch_id]["errors"])
        if len(errs) == len(names):
            with _batch_jobs_lock:
                _batch_jobs[batch_id]["status"] = "error"
            return

        # ── Gera um 3MF por nome e zipa tudo ─────────────────────────────
        try:
            zip_path = os.path.join(batch_dir, f"{model_id}_batch.zip")
            with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
                arc_name_count: dict = {}
                for name, name_hash, src_hash, is_dup, extruder_ov in render_tasks:
                    piece_hash = src_hash if is_dup else name_hash
                    stl_paths = results.get(piece_hash)
                    if not stl_paths:
                        continue

                    safe_name = "".join(c if c.isalnum() or c in " _-" else "_" for c in name).strip()
                    # 3MF gerado por nome (extrusor pode diferir entre pessoas com mesmo nome)
                    mf_path = os.path.join(batch_dir, f"{safe_name}_{name_hash[:6]}.3mf")
                    piece_dir = os.path.join(batch_dir, piece_hash)
                    ok = _pack_bambu_3mf(model_id, parts_to_render, piece_dir, mf_path,
                                         extruder_overrides=extruder_ov if extruder_ov else None)
                    if not ok:
                        print(f"[BATCH ZIP] _pack_bambu_3mf falhou para '{name}'", flush=True)
                        continue

                    # Desambigua nomes iguais *e* nomes que diferem só por caixa
                    # (ex: "KID" e "KId" → conflito em Windows que é case-insensitive).
                    # A chave do contador é sempre lowercase; o nome exibido preserva a caixa original.
                    arc_base = safe_name
                    arc_key  = arc_base.lower()
                    count = arc_name_count.get(arc_key, 0) + 1
                    arc_name_count[arc_key] = count
                    arc_name = f"{arc_base}.3mf" if count == 1 else f"{arc_base}_{count}.3mf"

                    zf.write(mf_path, arc_name)
                    print(f"[BATCH ZIP] adicionado: {arc_name}", flush=True)

            with _batch_jobs_lock:
                _batch_jobs[batch_id]["status"] = "done"
                _batch_jobs[batch_id]["file"] = f"/static/generated/batch_{batch_id}/{model_id}_batch.zip"
        except Exception as exc:
            print(f"[BATCH ASSEMBLE ERROR] {repr(exc)}", flush=True)
            with _batch_jobs_lock:
                _batch_jobs[batch_id]["status"] = "error"
                _batch_jobs[batch_id]["errors"].append(f"Montagem ZIP: {repr(exc)}")

    # Dispara background thread e retorna imediatamente
    t = threading.Thread(target=_run_batch, daemon=True)
    t.start()

    return {
        "batch_id": batch_id,
        "status": "running",
        "total": len(names),
        "done": 0,
    }


# ─────────────────────────────────────────────────────────────────────────────
# CadQuery: engine alternativo ao OpenSCAD para modelos com model.py
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/generate_cq/{model_id}")
async def generate_cq_model(request: Request, model_id: str):
    """
    Endpoint para modelos CadQuery (engine=cadquery no config.json).
    Carrega model.py do diretório do modelo e chama generate(params, output_dir).
    Reutiliza o mesmo mecanismo de cache/hash e empacotamento 3MF do fluxo padrão.
    """
    import importlib.util

    model_py_path = os.path.join(MODELS_DIR, model_id, "model.py")
    if not os.path.exists(model_py_path):
        return JSONResponse(status_code=404, content={"error": "model.py não encontrado"})

    config_path = os.path.join(MODELS_DIR, model_id, "config.json")
    model_config = {}
    if os.path.exists(config_path):
        with open(config_path, "r", encoding="utf-8") as f:
            model_config = json.load(f)

    parts_to_render = model_config.get("parts", [])

    form_data = await request.form()
    params = {k: v for k, v in form_data.items() if isinstance(v, str)}

    # Hash determinístico (mesmo mecanismo do fluxo OpenSCAD)
    hasher = hashlib.md5()
    hasher.update(("cq_" + model_id).encode())
    for k, v in sorted(params.items()):
        hasher.update(f"{k}={v}".encode())
    job_id = hasher.hexdigest()[:16]

    job_dir     = os.path.join(GENERATED_DIR, job_id)
    mf_filename = f"{model_id}_all.3mf"
    mf_filepath = os.path.join(job_dir, mf_filename)

    # Cache hit
    if os.path.exists(mf_filepath):
        print(f"[CQ CACHE HIT] job_id={job_id}", flush=True)
        urls = {p: f"/static/generated/{job_id}/{model_id}_{p}.stl" for p in parts_to_render}
        urls["3mf"] = f"/static/generated/{job_id}/{mf_filename}"
        return {"success": True, "job_id": job_id, "files": urls, "from_cache": True}

    _cleanup_old_jobs()
    os.makedirs(job_dir, exist_ok=True)

    # Carregar model.py dinamicamente
    spec = importlib.util.spec_from_file_location(f"cq_model_{model_id}", model_py_path)
    mod  = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    try:
        raw_paths = mod.generate(params, job_dir)
    except Exception as e:
        import traceback
        print(f"[CQ ERROR] {traceback.format_exc()}", flush=True)
        return JSONResponse(status_code=500, content={"error": str(e)})

    # Renomear arquivos para o padrão {model_id}_{part}.stl
    for part in parts_to_render:
        src = raw_paths.get(part)
        dst = os.path.join(job_dir, f"{model_id}_{part}.stl")
        if src and os.path.exists(src) and src != dst:
            os.rename(src, dst)

    generated_urls = {
        p: f"/static/generated/{job_id}/{model_id}_{p}.stl"
        for p in parts_to_render
        if os.path.exists(os.path.join(job_dir, f"{model_id}_{p}.stl"))
    }

    # Empacotar 3MF via trimesh
    try:
        meshes = []
        for part in parts_to_render:
            stl_path = os.path.join(job_dir, f"{model_id}_{part}.stl")
            if os.path.exists(stl_path):
                loaded = trimesh.load(stl_path)
                mesh = (trimesh.util.concatenate(list(loaded.geometry.values()))
                        if isinstance(loaded, trimesh.Scene) else loaded)
                meshes.append(mesh)
        if meshes:
            trimesh.Scene(meshes).export(mf_filepath, file_type='3mf')
            generated_urls["3mf"] = f"/static/generated/{job_id}/{mf_filename}"
    except Exception as e:
        print(f"[CQ 3MF ERROR] {repr(e)}", flush=True)

    return {"success": True, "job_id": job_id, "files": generated_urls, "from_cache": False}
