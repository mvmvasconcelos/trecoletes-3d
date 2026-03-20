import hashlib
import os
import re
import shutil
import subprocess
import time
import json
import uuid
import zipfile
import threading
import trimesh
from concurrent.futures import ThreadPoolExecutor, as_completed
from fastapi import APIRouter, UploadFile, Form, Request
from fastapi.responses import JSONResponse
from app.api._svg_normalize import normalize_svg_to_origin
from fontTools.ttLib import TTFont


def _compute_char_positions(text: str, font_path: str, size_mm: float, spacing: float = 1.0, word_spacing: float = 1.0) -> list[float]:
    """
    Retorna lista de posições X (mm) do início de cada caractere, centradas em 0.
    Usa os advance widths reais da fonte para posicionamento preciso.
    word_spacing escala apenas o avanço do caractere espaço (' '), independente de spacing.
    """
    font = TTFont(font_path)
    cap_h: int = font['OS/2'].sCapHeight or font['head'].unitsPerEm
    scale = size_mm / cap_h
    cmap = font.getBestCmap() or {}
    hmtx = font['hmtx'].metrics

    advs: list[float] = []
    for char in text:
        gname = cmap.get(ord(char), '.notdef')
        if gname not in hmtx:
            gname = '.notdef'
        factor = word_spacing if char == ' ' else spacing
        advs.append(hmtx[gname][0] * scale * factor)

    total_w = sum(advs)
    start_x = -total_w / 2
    positions: list[float] = []
    x = start_x
    for adv in advs:
        positions.append(round(x, 4))
        x += adv
    return positions


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
    font_family = font_name_val.split(":")[0].lower()

    try:
        candidates = [
            f for f in os.listdir(model_dir)
            if f.lower().endswith(".ttf") and font_family in f.lower()
        ]
    except OSError:
        candidates = []

    if not candidates:
        return args  # sem TTF disponível, fallback para text() padrão
    ttf_path = os.path.join(model_dir, candidates[0])

    max_line_w = 0.0  # largura máxima entre todas as linhas (sem outline_margin)

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
            positions = _compute_char_positions(text_val, ttf_path, size_mm, spacing, word_spacing)
            xs_str = "[" + ",".join(f"{x}" for x in positions) + "]"
            args.extend(["-D", f'{chars_param}="{text_val}"'])
            args.extend(["-D", f'{xs_param}={xs_str}'])
            print(f"[CHAR_POS] {line_key}='{text_val}' xs={xs_str}", flush=True)

            # Largura total desta linha (soma dos advances)
            font = TTFont(ttf_path)
            cap_h: int = font['OS/2'].sCapHeight or font['head'].unitsPerEm
            scale = size_mm / cap_h
            cmap = font.getBestCmap() or {}
            hmtx = font['hmtx'].metrics
            line_w = sum(
                hmtx.get(cmap.get(ord(ch), '.notdef'), hmtx.get('.notdef', (0,)))[0]
                * scale * (word_spacing if ch == ' ' else spacing)
                for ch in text_val
            )
            max_line_w = max(max_line_w, line_w)
        except Exception as exc:
            print(f"[CHAR_POS] Erro para '{line_key}': {exc}", flush=True)

    # ── Largura máxima ────────────────────────────────────────────────────
    try:
        max_width = float(params.get("max_width", 0))
        outline_margin = float(params.get("outline_margin", 2.3))
    except ValueError:
        max_width, outline_margin = 0.0, 2.3

    if max_width > 0 and max_line_w > 0:
        natural_w = max_line_w + 2 * outline_margin
        if natural_w > max_width:
            scale_x = max_width / natural_w
            args.extend(["-D", f"scale_x={round(scale_x, 6)}"])
            print(f"[MAX_WIDTH] natural={natural_w:.2f}mm > max={max_width}mm → scale_x={scale_x:.4f}", flush=True)

    return args


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
    parts_to_render = model_config.get("parts", ["carimbo_base", "carimbo_arte", "cortador"])

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
    linhas_bytes = normalize_svg_viewbox(linhas_bytes_raw)
    linhas_bytes = normalize_svg_to_origin(linhas_bytes)
    print(f"[DEBUG linhas.svg after normalize first 400]: {linhas_bytes[:400].decode('utf-8','ignore')}", flush=True)

    linhas_path = os.path.join(job_dir, "linhas.svg")
    with open(linhas_path, "wb") as f:
        f.write(linhas_bytes)

    silhueta_path = os.path.join(job_dir, "silhueta.svg")
    with open(silhueta_path, "wb") as f:
        f.write(silhueta_bytes_raw)

    # Monta os argumentos -D base para o OpenSCAD (sem a parte — injetada por worker)
    scad_variables_base = [
        "-D", f'svg_linhas_path="{linhas_path}"',
        "-D", f'svg_silhueta_path="{silhueta_path}"',
    ]
    for key, value in text_params:
        scad_variables_base.extend(["-D", _to_scad_assignment(key, value)])

    font_path = os.path.join(MODELS_DIR, model_id)

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

    # Hash determinístico para cache
    hasher = hashlib.md5()
    hasher.update(model_id.encode())
    for k, v in text_params:
        hasher.update(f"{k}={v}".encode())
    job_id = hasher.hexdigest()[:16]

    job_dir = os.path.join(GENERATED_DIR, job_id)
    font_path = os.path.join(MODELS_DIR, model_id)

    # ── Fluxo multipart 3MF ───────────────────────────────────────────────
    if output_format == "3mf" and parts_to_render:
        mf_filename = f"{model_id}_all.3mf"
        mf_filepath = os.path.join(job_dir, mf_filename)

        if os.path.exists(mf_filepath):
            print(f"[CACHE HIT parametric 3mf] job_id={job_id}", flush=True)
            cached_urls = {p: f"/static/generated/{job_id}/{model_id}_{p}.stl" for p in parts_to_render}
            cached_urls["3mf"] = f"/static/generated/{job_id}/{mf_filename}"
            return {"success": True, "job_id": job_id, "files": cached_urls, "from_cache": True}

        _cleanup_old_jobs()
        os.makedirs(job_dir, exist_ok=True)

        scad_args_base = []
        for key, value in text_params:
            scad_args_base.extend(["-D", _to_scad_assignment(key, value)])

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

        ov = {}
        for k, v in text_params:
            if k == "extrusor_base":
                try: ov["base"] = int(v)
                except ValueError: pass
            elif k == "extrusor_letras":
                try: ov["letters"] = int(v)
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

        return {"success": True, "job_id": job_id, "files": generated_urls, "from_cache": False}

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
    font_path = os.path.join(MODELS_DIR, model_id)

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
                ov["letters"] = int(item["extrusor_letras"])
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
            scad_args = ["-D", _to_scad_assignment("text_line_1", name),
                         "-D", 'text_line_2=""']
            for k, v in base_params.items():
                scad_args.extend(["-D", _to_scad_assignment(k, v)])

            # Injeta posições de caracteres para este nome
            if model_config.get("text_to_svg"):
                scad_args = _inject_char_positions(
                    scad_args,
                    {"text_line_1": name, "text_line_2": "", **base_params},
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

                    # Desambigua nomes iguais: Miguel.3mf, Miguel_2.3mf ...
                    arc_base = safe_name
                    count = arc_name_count.get(arc_base, 0) + 1
                    arc_name_count[arc_base] = count
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
