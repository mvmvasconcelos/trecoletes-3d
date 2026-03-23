"""
Gerador Shapely + trimesh para teste_tolerancia_texto_cq.
Substitui model.scad — não usa subprocess OpenSCAD nem CadQuery.

Estratégia: todas as operações booleanas são feitas em 2D (Shapely) antes da
extrusão (trimesh.creation.extrude_polygon).  Isso é mais simples, rápido e
robusto do que operações booleanas 3D.

Dependências (instaladas no container):
  - shapely==2.0.6
  - fonttools==4.53.0  (já presente)
  - trimesh==4.4.1     (já presente)
  - numpy              (já presente)

Interface pública:
  generate(params: dict, output_dir: str) -> dict[str, str]
"""

import os
import trimesh
import numpy as np
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import RecordingPen
from shapely.geometry import Polygon, MultiPolygon, box as shapely_box
from shapely.affinity import translate as shapely_translate
from shapely.ops import unary_union

# ── Constantes ────────────────────────────────────────────────────────────────
PLATE_THICKNESS = 3.0
TEXT_THICKNESS  = 2.0
GAP             = 2.0       # espaço entre linhas de cavidades (mm)
FONT_PATH       = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"


# ── Helpers: texto → polígono Shapely ─────────────────────────────────────────

def _quad_bezier_pts(p0, p1, p2, n: int) -> list:
    """Amostra n-1 pontos de uma curva quadrática Bézier (exclui o ponto inicial)."""
    result = []
    for t in np.linspace(0, 1, n)[1:]:
        x = (1 - t)**2 * p0[0] + 2 * (1 - t) * t * p1[0] + t**2 * p2[0]
        y = (1 - t)**2 * p0[1] + 2 * (1 - t) * t * p1[1] + t**2 * p2[1]
        result.append((x, y))
    return result


def _cubic_bezier_pts(p0, p1, p2, p3, n: int) -> list:
    """Amostra n-1 pontos de uma curva cúbica Bézier (exclui o ponto inicial)."""
    result = []
    for t in np.linspace(0, 1, n)[1:]:
        u = 1 - t
        x = u**3*p0[0] + 3*u**2*t*p1[0] + 3*u*t**2*p2[0] + t**3*p3[0]
        y = u**3*p0[1] + 3*u**2*t*p1[1] + 3*u*t**2*p2[1] + t**3*p3[1]
        result.append((x, y))
    return result


def _glyph_to_contours(glyph_name: str, font: TTFont, scale: float) -> list:
    """Retorna lista de sequências de pontos (contornos fechados) de um glifo."""
    pen = RecordingPen()
    glyph_set = font.getGlyphSet()
    if glyph_name not in glyph_set:
        return []
    glyph_set[glyph_name].draw(pen)

    N = 16  # subdivisões por segmento de curva
    contours = []
    current: list = []

    for op, args in pen.value:
        if op == "moveTo":
            current = [args[0]]

        elif op == "lineTo":
            current.append(args[0])

        elif op == "qCurveTo":
            # Fonte TrueType: todos os pontos exceto o último são off-curve.
            # Entre off-curves consecutivos há pontos on-curve IMPLÍCITOS no ponto médio.
            # Cada segmento é uma Bézier quadrática independente.
            off_curves = list(args[:-1])
            end_on = args[-1]
            p0 = current[-1]
            for i, off in enumerate(off_curves):
                # on-curve deste segmento: ponto médio ou o ponto final se for o último
                if i < len(off_curves) - 1:
                    p2 = ((off[0] + off_curves[i + 1][0]) / 2,
                          (off[1] + off_curves[i + 1][1]) / 2)
                else:
                    p2 = end_on
                current.extend(_quad_bezier_pts(p0, off, p2, N))
                p0 = p2

        elif op == "curveTo":
            # Bézier cúbica (PostScript/OTF CFF — raro em TrueType puro)
            # args = (off1, off2, on)  por segmento; pode vir encadeado
            pts = list(args)
            p0 = current[-1]
            while len(pts) >= 3:
                p1, p2, p3 = pts[0], pts[1], pts[2]
                current.extend(_cubic_bezier_pts(p0, p1, p2, p3, N))
                p0 = p3
                pts = pts[3:]

        elif op in ("endPath", "closePath"):
            if len(current) >= 3:
                contours.append([(x * scale, y * scale) for x, y in current])
            current = []

    return contours


def _contours_to_poly(contours_pts: list):
    """
    Converte lista de contornos de um glifo para geometria Shapely,
    aplicando a regra par-ímpar (XOR) para tratar buracos como 'O', 'B', 'P'.
    """
    polys = []
    for pts in contours_pts:
        try:
            p = Polygon(pts).buffer(0)
            if p.is_valid and not p.is_empty:
                polys.append(p)
        except Exception:
            pass

    if not polys:
        return None

    # Ordenar por área decrescente; aplicar XOR (symmetric_difference) iterativamente
    # → equivale à regra even-odd: contornos internos tornam-se buracos
    polys.sort(key=lambda p: p.area, reverse=True)
    result = polys[0]
    for p in polys[1:]:
        result = result.symmetric_difference(p)
    return result.buffer(0)


def _iter_polygons(shape):
    """Itera sobre todos os Polygon de uma geometria (Polygon ou Multi/Collection)."""
    if shape is None or shape.is_empty:
        return
    if shape.geom_type == 'Polygon':
        yield shape
    elif hasattr(shape, 'geoms'):
        for g in shape.geoms:
            yield from _iter_polygons(g)


def _extrude_shape(shape, height: float) -> trimesh.Trimesh:
    """
    Extrusão de um Polygon, MultiPolygon ou GeometryCollection Shapely.
    Cada polígono (incluindo buracos via interiors) é extrudado via trimesh.
    """
    meshes = []
    for poly in _iter_polygons(shape):
        if poly.is_empty:
            continue
        try:
            m = trimesh.creation.extrude_polygon(poly, height)
            meshes.append(m)
        except Exception as e:
            print(f"[CQ model] extrude_polygon erro: {e}")

    if not meshes:
        raise ValueError("Nenhuma geometria extrudável gerada")
    return trimesh.util.concatenate(meshes) if len(meshes) > 1 else meshes[0]


# ── texto → Shapely ───────────────────────────────────────────────────────────

def text_to_shapely(texto: str, tamanho: float):
    """
    Renderiza texto completo como geometria Shapely (mm),
    horizontalmente centrado em x=0, verticalmente centrado em y=0.
    Usa regra even-odd para buracos internos de letras (O, B, D, P…).
    """
    font  = TTFont(FONT_PATH)
    upem  = font['head'].unitsPerEm
    cap_h = font['OS/2'].sCapHeight or upem
    scale = tamanho / cap_h

    cmap  = font.getBestCmap() or {}
    hmtx  = font['hmtx'].metrics

    all_polys = []
    x_cursor  = 0.0

    for char in texto:
        gname    = cmap.get(ord(char), '.notdef')
        adv      = hmtx.get(gname, (upem, 0))[0] * scale
        contours = _glyph_to_contours(gname, font, scale)
        glyph_shape = _contours_to_poly(contours)

        if glyph_shape is not None and not glyph_shape.is_empty:
            translated = shapely_translate(glyph_shape, xoff=x_cursor)
            all_polys.extend(_iter_polygons(translated))

        x_cursor += adv

    total_w = x_cursor
    shifted = [shapely_translate(p, xoff=-total_w / 2, yoff=-tamanho / 2)
               for p in all_polys]

    if not shifted:
        return MultiPolygon()

    merged = unary_union(shifted)
    return merged


def text_bbox(texto: str, tamanho: float) -> tuple:
    """Retorna (largura_real, altura_real) em mm."""
    shape = text_to_shapely(texto, tamanho)
    if shape is None or shape.is_empty:
        return tamanho * len(texto) * 0.9, tamanho  # fallback
    b = shape.bounds  # (minx, miny, maxx, maxy)
    return b[2] - b[0], b[3] - b[1]


def text_offset_shapely(texto: str, tamanho: float, tol: float):
    """Texto expandido por tol mm (equivalente ao offset(r=tol) do OpenSCAD)."""
    shape = text_to_shapely(texto, tamanho)
    return shape.buffer(tol, join_style='round', cap_style='round')


# ── Geometria principal ────────────────────────────────────────────────────────

def chapa_negativa(texto: str, tamanho: float, tolerancias: list, margem: float) -> trimesh.Trimesh:
    """
    Gera a chapa com cavidades subtraídas usando operações 2D no Shapely.
    Todas as subtrações ocorrem ANTES da extrusão → sem operações booleanas 3D.
    """
    tw, th = text_bbox(texto, tamanho)

    max_tol     = max(tolerancias)
    plate_w     = tw + 2 * max_tol + 2 * margem
    row_heights = [th + 2 * t + 2 * margem for t in tolerancias]
    n           = len(tolerancias)
    plate_d     = 2 * margem + sum(row_heights) + (n - 1) * GAP

    # Placa 2D — todas as subtrações (cavidades + rótulos) feitas aqui
    plate_2d = shapely_box(-plate_w / 2, -plate_d / 2, plate_w / 2, plate_d / 2)

    y_bot = -plate_d / 2 + margem
    for i, tol in enumerate(tolerancias):
        row_h  = row_heights[i]
        cav_cy = y_bot + row_h / 2

        # Subtração da cavidade do texto com o offset de tolerância
        cavity = text_offset_shapely(texto, tamanho, tol)
        cavity = shapely_translate(cavity, yoff=cav_cy)
        plate_2d = plate_2d.difference(cavity)

        # Rótulo gravado (through-hole, sempre visível)
        label_size  = max(1.5, margem * 0.7)
        label_text  = f"{tol}mm"
        label_shape = text_to_shapely(label_text, label_size)
        if not label_shape.is_empty:
            lb = label_shape.bounds          # (minx, miny, maxx, maxy)
            label_shape = shapely_translate(
                label_shape,
                xoff=-plate_w / 2 + margem * 0.4 - lb[0],
                yoff=cav_cy - (lb[3] + lb[1]) / 2,
            )
            plate_2d = plate_2d.difference(label_shape)

        y_bot += row_h + GAP

    return _extrude_shape(plate_2d, PLATE_THICKNESS)


def texto_positivo(texto: str, tamanho: float) -> trimesh.Trimesh:
    """Texto nominal sem offset — centrado na origem."""
    shape = text_to_shapely(texto, tamanho)
    return _extrude_shape(shape, TEXT_THICKNESS)


# ── Interface pública ──────────────────────────────────────────────────────────

def generate(params: dict, output_dir: str) -> dict:
    """
    Gera chapa_negativa.stl e texto_positivo.stl em output_dir.

    params esperados:
      texto:       str
      tamanho:     float (mm)
      tolerancias: list[float] ou JSON string
      margem:      float (mm)
    """
    import json as _json

    texto_val   = str(params.get("texto", "TESTE"))
    tamanho_val = float(params.get("tamanho", 10))
    margem_val  = float(params.get("margem", 2))

    tols_raw = params.get("tolerancias", "[0.2,0.4]")
    if isinstance(tols_raw, str):
        tols_val = _json.loads(tols_raw)
    else:
        tols_val = list(tols_raw)
    tols_val = [float(t) for t in tols_val]

    chapa    = chapa_negativa(texto_val, tamanho_val, tols_val, margem_val)
    positivo = texto_positivo(texto_val, tamanho_val)

    path_chapa    = os.path.join(output_dir, "chapa_negativa.stl")
    path_positivo = os.path.join(output_dir, "texto_positivo.stl")

    chapa.export(path_chapa)
    positivo.export(path_positivo)

    return {
        "chapa_negativa": path_chapa,
        "texto_positivo": path_positivo,
    }
