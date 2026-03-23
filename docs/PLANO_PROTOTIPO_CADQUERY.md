# Plano: Protótipo CadQuery — Teste de Tolerância de Texto

Plano detalhado e **agent-ready** para implementar `teste_tolerancia_texto` usando **CadQuery + Shapely** como engine alternativo ao OpenSCAD. Tudo executado dentro do container Docker. Nenhum comando é executado localmente.

---

## Contexto e Motivação

| | OpenSCAD 2021 (atual) | CadQuery + Shapely (proposto) |
|---|---|---|
| Largura do texto | Estimada (`n_chars × 0.9`) | Exata via fonttools BoundsPen |
| Integração Python | Subprocess externo | Importação direta (in-process) |
| Offset de contorno | `offset(r=tol)` nativo | `shapely.buffer(tol)` |
| Exportação STL | Via OpenSCAD subprocess | Via `cadquery.exporters` |
| Exportação 3MF | Via trimesh fallback | Via trimesh fallback (mesma lógica) |
| `n_chars` injetado | Necessário | Eliminado |

---

## Arquitetura da Solução

O protótipo usa uma **abordagem híbrida**:

- **fonttools** (já instalado) → extrai contornos de glifo como beziers
- **Shapely** (a adicionar) → cria polígono 2D do texto e aplica `buffer(tol)` para o offset
- **CadQuery** (a adicionar) → extrusão 3D dos polígonos e operações booleanas (subtração da cavidade)
- **trimesh** (já instalado) → exportação STL + empacotamento 3MF (reusa lógica já existente no backend)

O motivo de usar Shapely para o offset (e não `cq.Wire.offset2D`) é que o offset de wires compostos (texto com buracos internos, como "O", "B", "P") é instável no kernel OCCT — Shapely é mais robusto para esse caso.

---

## Estrutura de Arquivos a Criar

```
backend/
  requirements.txt              ← adicionar cadquery e shapely
  Dockerfile                    ← adicionar libGL (dep do CadQuery)
  app/
    api/
      generator.py              ← adicionar rota /generate_cq/{model_id}
models/
  teste_tolerancia_texto_cq/    ← nova pasta (original intocada)
    config.json
    model.py
```

O modelo original em `models/teste_tolerancia_texto/` **não é tocado em nenhum momento**.

---

## Fase 0 — Preparação do Ambiente

### Passo 0.1 — Atualizar `requirements.txt`

Adicionar ao final de `backend/requirements.txt`:

```
cadquery==2.4.0
shapely==2.0.6
```

> **Por que essas versões?**
> - `cadquery==2.4.0` é a última versão estável com wheels pré-compilados para Python 3.11 Linux x86_64. Instala `cadquery-ocp` automaticamente.
> - `shapely==2.0.6` tem wheel pré-compilado (sem necessidade de GEOS local).

### Passo 0.2 — Atualizar `Dockerfile`

CadQuery precisa de `libGL.so.1` (renderização OCC) que não está na imagem slim. Adicionar ao `apt-get install`:

```dockerfile
FROM python:3.11-slim

RUN apt-get update && \
    apt-get install -y openscad libgl1 libglu1-mesa && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
```

> Apenas duas libs extras — a imagem continua sendo `slim`.

### Passo 0.3 — Rebuild do container

```bash
docker-compose up --build -d
```

**Critério de aceitação:** container sobe sem erros. Build pode demorar ~5 min na primeira vez (download do wheel cadquery-ocp ~400MB).

### Passo 0.4 — Verificar instalação das dependências

Executar **dentro do container**:

```bash
docker exec trecoletes_backend python3 -c "
import cadquery as cq
import shapely
from fonttools.ttLib import TTFont
print('cadquery:', cq.__version__)
print('shapely:', shapely.__version__)
print('OK')
"
```

**Critério de aceitação:** imprime `OK` sem erros de importação.

### Passo 0.5 — Localizar a fonte Liberation Sans no container

```bash
docker exec trecoletes_backend find /usr/share/fonts -name "LiberationSans-Regular.ttf" 2>/dev/null
```

**Critério de aceitação:** retorna um caminho, ex: `/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf`.

Se não encontrado, instalar via apt:
```bash
# Apenas se o passo 0.5 retornar vazio — adicionar ao Dockerfile:
apt-get install -y fonts-liberation
```

### Passo 0.6 — Testar exportação mínima CadQuery

```bash
docker exec trecoletes_backend python3 -c "
import cadquery as cq
from cadquery import exporters
box = cq.Workplane('XY').box(10, 10, 5)
exporters.export(box, '/tmp/test_box.stl')
import os; print('STL size:', os.path.getsize('/tmp/test_box.stl'), 'bytes')
"
```

**Critério de aceitação:** imprime tamanho > 0 bytes.

---

## Fase 1 — Implementar `models/teste_tolerancia_texto_cq/config.json`

Criar o arquivo com conteúdo idêntico ao original, mas com `id` diferente e `engine` declarado:

```json
{
    "id": "teste_tolerancia_texto_cq",
    "title": { "pt": "Teste de Tolerância Texto (CQ)", "en": "Text Tolerance Test (CQ)" },
    "engine": "cadquery",
    "output_format": "3mf",
    "parts": ["chapa_negativa", "texto_positivo"],
    "text_to_svg": false,
    "parameters": [
        { "id": "texto",      "name": "Texto",           "type": "text",  "default": "TESTE" },
        { "id": "tamanho",    "name": "Tamanho do Texto", "type": "range", "min": 5, "max": 50, "step": 1, "default": 10, "unit": "mm" },
        { "id": "tolerancias","name": "Tolerâncias",      "type": "holes_list", "default": [0.2, 0.4] },
        { "id": "margem",     "name": "Margem",           "type": "range", "min": 1, "max": 5, "step": 0.5, "default": 2, "unit": "mm" }
    ]
}
```

---

## Fase 2 — Implementar `models/teste_tolerancia_texto_cq/model.py`

### Estrutura completa do arquivo

```python
"""
Gerador CadQuery para teste_tolerancia_texto_cq.
Substitui model.scad — não usa subprocess OpenSCAD.

Dependências (já instaladas no container):
  - cadquery==2.4.0
  - shapely==2.0.6
  - fonttools==4.53.0  (já presente)
  - trimesh==4.4.1     (já presente, usado pelo backend para 3MF)

Interface pública:
  generate(params: dict, output_dir: str) -> dict[str, str]
  Retorna {"chapa_negativa": "/path/chapa_negativa.stl",
           "texto_positivo": "/path/texto_positivo.stl"}
"""

import os
import cadquery as cq
from cadquery import exporters
from fonttools.ttLib import TTFont
from fonttools.pens.pointPen import SegmentToPointPen
from fonttools.pens.recordingPen import RecordingPen
from shapely.geometry import Polygon, MultiPolygon
from shapely.ops import unary_union
import numpy as np

# ── Constantes ────────────────────────────────────────────────────────────────
PLATE_THICKNESS = 3.0
TEXT_THICKNESS  = 2.0
GAP             = 2.0       # espaço entre linhas de cavidades (mm)
SEPARATION      = 10.0      # distância chapa → topo texto positivo (view "all")
FONT_PATH       = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"


# ── Helpers: texto → polígono Shapely ────────────────────────────────────────

def _glyph_to_shapely(glyph_name: str, font: TTFont, scale: float) -> list[Polygon]:
    """
    Extrai o contorno de um glifo como lista de Polygons Shapely.
    Retorna lista vazia para glifos sem contorno (espaço, .notdef vazio).
    """
    pen = RecordingPen()
    glyph_set = font.getGlyphSet()
    if glyph_name not in glyph_set:
        return []
    glyph_set[glyph_name].draw(pen)

    contours: list[list[tuple]] = []
    current: list[tuple] = []

    for op, args in pen.value:
        if op == "moveTo":
            current = [args[0]]
        elif op == "lineTo":
            current.append(args[0])
        elif op in ("qCurveTo", "curveTo"):
            # Aproximar bezier com 8 pontos de amostragem
            pts = [current[-1]] + list(args)
            for t in np.linspace(0, 1, 8)[1:]:
                current.append(_bezier_point(pts, t))
        elif op == "endPath" or op == "closePath":
            if len(current) >= 3:
                contours.append([(x * scale, y * scale) for x, y in current])
            current = []

    # Separar contornos externos (CCW = positivo) de buracos (CW = negativo)
    # Shapely infere automaticamente pela orientation
    polys = []
    for pts in contours:
        try:
            p = Polygon(pts)
            if p.is_valid and not p.is_empty:
                polys.append(p)
        except Exception:
            pass

    return polys


def _bezier_point(pts: list, t: float) -> tuple:
    """De Casteljau recursivo — funciona para qualquer grau."""
    if len(pts) == 1:
        return pts[0]
    return tuple(
        (1 - t) * a + t * b
        for a, b in zip(_bezier_point(pts[:-1], t), _bezier_point(pts[1:], t))
    )


def text_to_shapely(texto: str, tamanho: float) -> MultiPolygon:
    """
    Renderiza o texto completo como um MultiPolygon Shapely em coordenadas mm,
    horizontalmente centrado em x=0, verticalmente centrado em y=0.
    """
    font = TTFont(FONT_PATH)
    upem  = font['head'].unitsPerEm
    # Usar capHeight para escala consistente com OpenSCAD (tamanho = altura da letra maiúscula)
    cap_h = font['OS/2'].sCapHeight or upem
    scale = tamanho / cap_h

    cmap  = font.getBestCmap() or {}
    hmtx  = font['hmtx'].metrics

    all_polys: list[Polygon] = []
    x_cursor = 0.0

    for char in texto:
        gname = cmap.get(ord(char), '.notdef')
        adv   = hmtx.get(gname, (upem, 0))[0] * scale
        polys = _glyph_to_shapely(gname, font, scale)
        for p in polys:
            all_polys.append(p.translate(x_cursor, 0))
        x_cursor += adv

    total_w = x_cursor
    # Centralizar em x=0
    shifted = [p.translate(-total_w / 2, -tamanho / 2) for p in all_polys]

    if not shifted:
        return MultiPolygon()

    merged = unary_union(shifted)
    if merged.geom_type == 'Polygon':
        return MultiPolygon([merged])
    return merged


def text_bbox(texto: str, tamanho: float) -> tuple[float, float]:
    """Retorna (largura_real, altura_real) em mm, usando bounds do Shapely."""
    mp = text_to_shapely(texto, tamanho)
    if mp.is_empty:
        return tamanho * len(texto) * 0.9, tamanho  # fallback
    b = mp.bounds  # (minx, miny, maxx, maxy)
    return b[2] - b[0], b[3] - b[1]


def text_offset_shapely(texto: str, tamanho: float, tol: float) -> MultiPolygon:
    """
    Retorna o texto expandido por `tol` mm (equivalente ao offset(r=tol) do OpenSCAD).
    join_style=1 = round, mitre_limit irrelevante.
    """
    mp = text_to_shapely(texto, tamanho)
    return mp.buffer(tol, join_style=1, cap_style=1)


# ── Helpers: Shapely → CadQuery Face ──────────────────────────────────────────

def shapely_poly_to_cq_face(poly: Polygon) -> cq.Face:
    """
    Converte um Shapely Polygon (com possíveis buracos) para uma cq.Face.
    Exterior = wire externo. Interiors = wires de buraco.
    """
    def pts_to_wire(coords) -> cq.Wire:
        pts = [cq.Vector(x, y, 0) for x, y in coords[:-1]]  # remover ponto repetido final
        edges = [cq.Edge.makeLine(pts[i], pts[(i + 1) % len(pts)]) for i in range(len(pts))]
        return cq.Wire.assembleEdges(edges)

    outer = pts_to_wire(list(poly.exterior.coords))
    holes = [pts_to_wire(list(interior.coords)) for interior in poly.interiors]
    return cq.Face.makeFromWires(outer, holes)


def shapely_to_cq_solid(shape: MultiPolygon | Polygon, height: float, z_base: float = 0.0) -> cq.Solid:
    """
    Extrusão de um MultiPolygon Shapely em `height` mm a partir de `z_base`.
    Retorna um cq.Solid (pode ser CompSolid para múltiplos polígonos).
    """
    polys = list(shape.geoms) if shape.geom_type == 'MultiPolygon' else [shape]
    solids = []
    for poly in polys:
        face = shapely_poly_to_cq_face(poly)
        wp = (cq.Workplane("XY")
              .add(face)
              .wires()
              .toPending()
              .extrude(height))
        solids.append(wp.val())

    if not solids:
        raise ValueError("Nenhum sólido gerado a partir do polígono Shapely")
    if len(solids) == 1:
        solid = solids[0]
    else:
        solid = solids[0]
        for s in solids[1:]:
            solid = solid.fuse(s)

    return cq.Workplane("XY").add(solid).translate((0, 0, z_base))


# ── Geometria principal ────────────────────────────────────────────────────────

def chapa_negativa(texto: str, tamanho: float, tolerancias: list, margem: float) -> cq.Workplane:
    tw, th = text_bbox(texto, tamanho)

    max_tol   = max(tolerancias)
    plate_w   = tw + 2 * max_tol + 2 * margem
    row_heights = [th + 2 * t + 2 * margem for t in tolerancias]
    n         = len(tolerancias)
    plate_d   = 2 * margem + sum(row_heights) + (n - 1) * GAP

    # Placa base centrada na origem XY
    chapa = (cq.Workplane("XY")
             .box(plate_w, plate_d, PLATE_THICKNESS, centered=(True, True, False)))

    # Cavidades empilhadas em Y
    y_bot = -plate_d / 2 + margem
    for i, tol in enumerate(tolerancias):
        row_h = row_heights[i]
        cav_cy = y_bot + row_h / 2

        # Texto com offset = tolerância como sólido de corte
        offset_shape = text_offset_shapely(texto, tamanho, tol)
        cav_height   = PLATE_THICKNESS + 2.0
        cav_solid    = shapely_to_cq_solid(offset_shape, cav_height, z_base=0.0)
        cav_solid    = cav_solid.translate((0, cav_cy, PLATE_THICKNESS / 2 - cav_height / 2))

        chapa = chapa.cut(cav_solid)

        # Rótulo gravado na face superior
        label_size = max(1.5, margem * 0.7)
        label_text = f"{tol}mm"
        label_solid = (cq.Workplane("XY")
                       .text(label_text, fontsize=label_size, distance=0.52,
                             font="Liberation Sans")
                       .translate((-plate_w / 2 + margem * 0.4, cav_cy,
                                   PLATE_THICKNESS - 0.01)))
        chapa = chapa.cut(label_solid)

        y_bot += row_h + GAP

    return chapa


def texto_positivo(texto: str, tamanho: float) -> cq.Workplane:
    """Texto sem offset — tamanho nominal, centrado na origem."""
    return (cq.Workplane("XY")
            .text(texto, fontsize=tamanho, distance=TEXT_THICKNESS,
                  font="Liberation Sans"))


# ── Interface pública chamada pelo backend ─────────────────────────────────────

def generate(params: dict, output_dir: str) -> dict[str, str]:
    """
    Gera chapa_negativa.stl e texto_positivo.stl em output_dir.
    Retorna dict com caminhos para os dois arquivos.

    params esperados:
      texto:       str
      tamanho:     float (mm)
      tolerancias: list[float] — vem como JSON string do FormData, parsear aqui
      margem:      float (mm)
    """
    import json as _json

    texto_val   = str(params.get("texto", "TESTE"))
    tamanho_val = float(params.get("tamanho", 10))
    margem_val  = float(params.get("margem", 2))

    tols_raw    = params.get("tolerancias", "[0.2,0.4]")
    if isinstance(tols_raw, str):
        tols_val = _json.loads(tols_raw)
    else:
        tols_val = list(tols_raw)
    tols_val = [float(t) for t in tols_val]

    chapa    = chapa_negativa(texto_val, tamanho_val, tols_val, margem_val)
    positivo = texto_positivo(texto_val, tamanho_val)

    path_chapa    = os.path.join(output_dir, "chapa_negativa.stl")
    path_positivo = os.path.join(output_dir, "texto_positivo.stl")

    exporters.export(chapa,    path_chapa)
    exporters.export(positivo, path_positivo)

    return {
        "chapa_negativa":  path_chapa,
        "texto_positivo":  path_positivo,
    }
```

### Passo 2.1 — Testar `model.py` isoladamente no container

Após criar o arquivo, validar sem nenhuma chamada HTTP:

```bash
docker exec trecoletes_backend python3 -c "
import sys, json, os, time
sys.path.insert(0, '/models/teste_tolerancia_texto_cq')
import model as m

os.makedirs('/tmp/cq_test', exist_ok=True)
t0 = time.time()
result = m.generate({
    'texto': 'TESTE',
    'tamanho': '10',
    'tolerancias': '[0.2, 0.4]',
    'margem': '2'
}, '/tmp/cq_test')
elapsed = time.time() - t0

for k, v in result.items():
    print(f'{k}: {os.path.getsize(v)} bytes')
print(f'Tempo: {elapsed:.1f}s')
"
```

**Critério de aceitação:**
- Imprime tamanho em bytes > 0 para cada parte
- Sem exceções
- Tempo < 60s (primeira chamada inclui JIT do OCC kernel)

---

## Fase 3 — Integração com o Backend FastAPI

### Passo 3.1 — Adicionar rota `generate_cq` em `generator.py`

Adicionar **ao final** de `backend/app/api/generator.py`, antes do último bloco `generate_parametric`:

```python
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

    # Gerar partes (os STLs são salvos com nome {part}.stl no output_dir)
    # model.generate() retorna {"chapa_negativa": "/path/chapa_negativa.stl", ...}
    try:
        raw_paths = mod.generate(params, job_dir)
    except Exception as e:
        import traceback
        print(f"[CQ ERROR] {traceback.format_exc()}", flush=True)
        return JSONResponse(status_code=500, content={"error": str(e)})

    # Renomear arquivos para o padrão {model_id}_{part}.stl esperado pelo _pack_bambu_3mf
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

    # Empacotar 3MF via trimesh fallback (sem Bambu template para o protótipo)
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
```

### Passo 3.2 — Testar a rota HTTP no container

```bash
docker exec trecoletes_backend python3 -c "
import urllib.request, urllib.parse, json

data = urllib.parse.urlencode({
    'texto': 'TESTE',
    'tamanho': '10',
    'tolerancias': '[0.2, 0.4]',
    'margem': '2'
}).encode()

req = urllib.request.Request(
    'http://localhost:8000/api/generate_cq/teste_tolerancia_texto_cq',
    data=data,
    method='POST'
)
with urllib.request.urlopen(req) as r:
    print(json.loads(r.read()))
"
```

**Critério de aceitação:**
- `success: true`
- `files` contém `chapa_negativa`, `texto_positivo` e `3mf`
- `from_cache: false` na primeira chamada, `true` na segunda com os mesmos parâmetros

---

## Fase 4 — Validação e Comparação

### Passo 4.1 — Medir dimensões: CadQuery vs OpenSCAD

```bash
docker exec trecoletes_backend python3 -c "
import trimesh, json, urllib.request, urllib.parse

def get_stl_bounds(url_path):
    full = 'http://localhost:8000' + url_path
    import urllib.request as r
    with r.urlopen(full) as resp:
        import tempfile, os
        with tempfile.NamedTemporaryFile(suffix='.stl', delete=False) as f:
            f.write(resp.read())
            fname = f.name
    mesh = trimesh.load(fname)
    os.unlink(fname)
    b = mesh.bounds
    return {'w': round(b[1][0]-b[0][0],2), 'd': round(b[1][1]-b[0][1],2), 'h': round(b[1][2]-b[0][2],2)}

# Gerar com CadQuery
data = urllib.parse.urlencode({'texto':'TESTE','tamanho':'10','tolerancias':'[0.2,0.4]','margem':'2'}).encode()
with urllib.request.urlopen(urllib.request.Request('http://localhost:8000/api/generate_cq/teste_tolerancia_texto_cq', data=data, method='POST')) as r:
    cq_resp = json.loads(r.read())

# Gerar com OpenSCAD
with urllib.request.urlopen(urllib.request.Request('http://localhost:8000/api/generate_parametric/teste_tolerancia_texto', data=data, method='POST')) as r:
    scad_resp = json.loads(r.read())

print('=== chapa_negativa ===')
print('CadQuery :', get_stl_bounds(cq_resp['files']['chapa_negativa']))
print('OpenSCAD :', get_stl_bounds(scad_resp['files']['chapa_negativa']))
"
```

**Critério de aceitação:** Dimensão W (largura) e D (profundidade) diferem em ≤ 1mm. H (espessura) = 3.0mm exatos em ambos.

> A largura do CadQuery será diferente da do OpenSCAD pois usa medida real vs fator 0.9 — isso é **esperado e desejável**.

### Passo 4.2 — Comparar tempo de geração

O comando do Passo 4.1 já imprime os tempos. Registrar e comparar:

| | OpenSCAD (subprocess) | CadQuery (in-process) |
|--|--|--|
| Tempo 1ª chamada | ? s | ? s |
| Tempo 2ª chamada (cache) | ~0s | ~0s |

### Passo 4.3 — Validar o 3MF no Bambu Studio

1. Baixar o `.3mf` gerado via `http://localhost:8000/static/generated/{job_id}/teste_tolerancia_texto_cq_all.3mf`
2. Abrir no Bambu Studio
3. Verificar: duas peças separadas, dimensões corretas, sem geometria corrompida

**Critério de aceitação:** abre sem erros, peças visíveis e corretamente posicionadas.

---

## Fase 5 — Decisão

| Resultado | Ação |
|---|---|
| ✅ Dimensões corretas + 3MF válido + tempo aceitável | Migrar `teste_tolerancia_texto` para CadQuery; documentar como padrão |
| ⚠️ Correto mas lento (>30s) | Manter CadQuery apenas para cálculo de bbox como pré-passo do OpenSCAD |
| ❌ Geometria inválida no `shapely_to_cq_solid` | Investigar: provavelmente wire de texto com self-intersections; aplicar `poly.buffer(0)` antes da conversão |
| ❌ `libGL` não encontrado mesmo após Dockerfile | Mudar de `python:3.11-slim` para `python:3.11` no Dockerfile |
| ❌ `cadquery` incompatível com Python 3.11 | Tentar `cadquery-nightly`; ou usar abordagem alternativa shapely+trimesh sem CadQuery |

---

## Riscos Conhecidos e Mitigações Concretas

| Risco | Causa | Mitigação concreta |
|-------|-------|-------------------|
| Wire de texto com buracos inválido | Letras com counter (O, B, P) geram CW/CCW mistos | Aplicar `shapely.buffer(0)` antes de converter para normalizar orientação |
| `cq.Wire.assembleEdges` falha com muitos vértices | Arestas não-contíguas | Usar `Workplane.polyline().close()` em vez de montar arestas manualmente |
| Docker build falha no wheel CadQuery (~400MB) | Timeout ou memória | Aumentar `docker build --memory` ou usar `--platform linux/amd64` explicitamente |
| `RecordingPen` não resolve composites (glyphs compostos) | Fonts com glyphs que referenciam sub-glyphs | Usar `glyph_set[name].draw(pen)` (já resolvido automaticamente pelo fonttools) |

---

## Artefatos Esperados ao Final

- [ ] `backend/requirements.txt` — com cadquery e shapely adicionados
- [ ] `backend/Dockerfile` — com libgl1 e libglu1-mesa
- [ ] `models/teste_tolerancia_texto_cq/config.json`
- [ ] `models/teste_tolerancia_texto_cq/model.py` — implementação completa
- [ ] `backend/app/api/generator.py` — rota `/generate_cq/` adicionada
- [ ] Tabela comparativa dimensões SCAD vs CadQuery preenchida
- [ ] Decisão documentada
