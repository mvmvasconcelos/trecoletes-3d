"""
Empacota os STLs ja renderizados (mesa_base.stl + mesa_N_emblem.stl) em um
unico .3mf usando um layout em GRADE explicito (linhas x colunas), em vez do
shelf-packing generico de _assemble_batch_3mf (que usa uma prancheta de
223x223mm conservadora, pequena demais para caber 3 colunas da plaqueta de
70mm de largura). Aqui usamos o tamanho real da mesa da Bambu Lab A1
(256x256mm), validado fisicamente pelo usuario encaixando 6 pecas em grade
3x2 no Bambu Studio.

Reaproveita os mesmos helpers de XML 3MF que o resto da plataforma usa
(_xml_object_1_model, _xml_batch_3dmodel, _xml_batch_model_settings).

Rodar dentro do container backend (cwd /app):
docker compose exec backend sh -c "cd /app && python3 /models/plaqueta_mesa_qrcode/_reference/pack_3mf_grid.py --cols 3 1 2 3 4 5 6"
"""
import argparse
import json
import os
import sys
import zipfile

import trimesh

from app.api.generator import (
    MODELS_DIR,
    _xml_object_1_model,
    _xml_batch_3dmodel,
    _xml_batch_model_settings,
)

MODEL_ID = "plaqueta_mesa_qrcode"
MODEL_DIR = f"/models/{MODEL_ID}"
OUT_DIR = os.path.join(MODEL_DIR, "_reference", "output")
PARTS = ["base", "emblem"]

BED_W = 256.0
BED_H = 256.0
GAP = 8.0  # mm entre pecas


def grid_positions(n: int, cols: int, item_w: float, item_h: float):
    rows = -(-n // cols)  # ceil
    total_w = cols * item_w + (cols - 1) * GAP
    total_h = rows * item_h + (rows - 1) * GAP
    off_x = (BED_W - total_w) / 2.0
    off_y = (BED_H - total_h) / 2.0
    positions = []
    for i in range(n):
        col = i % cols
        row = i // cols
        # off_x/off_y marcam a borda esquerda/inferior da grade; como a malha
        # (base.stl) ja e centrada na propria origem, translate() usa o
        # CENTRO do item, entao somamos item_w/2 e item_h/2 pra compensar.
        x = off_x + item_w / 2 + col * (item_w + GAP)
        # linha 0 no topo da grade (maior Y), igual ao layout que o usuario testou
        y = off_y + item_h / 2 + (rows - 1 - row) * (item_h + GAP)
        positions.append((x, y))
    return positions, total_w, total_h


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cols", type=int, default=3)
    parser.add_argument("mesa_numeros", nargs="+", type=int)
    args = parser.parse_args()

    base_path = os.path.join(OUT_DIR, "mesa_base.stl")
    base_mesh = trimesh.load(base_path)
    item_w = float(base_mesh.bounds[1][0] - base_mesh.bounds[0][0])
    item_h = float(base_mesh.bounds[1][1] - base_mesh.bounds[0][1])

    positions, total_w, total_h = grid_positions(len(args.mesa_numeros), args.cols, item_w, item_h)
    print(f"grade {args.cols} colunas, ocupando {total_w:.1f}x{total_h:.1f}mm de uma mesa {BED_W:.0f}x{BED_H:.0f}mm")

    template_dir = os.path.join(MODELS_DIR, MODEL_ID, "bambu_template")
    with open(os.path.join(template_dir, "bambu_parts_config.json"), "r", encoding="utf-8") as fh:
        bambu_cfg = json.load(fh)
    part_defs = {p["scad_name"]: p for p in bambu_cfg["parts"]}

    all_mesh_entries = []
    all_part_cfgs = []
    obj_id = 1
    total_faces = 0

    for n, (px, py) in zip(args.mesa_numeros, positions):
        emblem_path = os.path.join(OUT_DIR, f"mesa_{n}_emblem.stl")
        if not os.path.exists(emblem_path):
            raise FileNotFoundError(f"Falta {emblem_path} -- rode render_test.py {n} primeiro")

        part_meshes = {"base": trimesh.load(base_path), "emblem": trimesh.load(emblem_path)}
        combined = trimesh.util.concatenate(list(part_meshes.values()))
        z_min = float(combined.bounds[0][2])

        for part in PARTS:
            mesh = part_meshes[part].copy()
            mesh.apply_translation([px, py, -z_min])
            defn = part_defs.get(part, {})
            fc = len(mesh.faces)
            total_faces += fc
            all_mesh_entries.append((obj_id, mesh))
            all_part_cfgs.append({
                "object_id": obj_id,
                "display_name": f"Mesa {n} - {defn.get('display_name', part)}",
                "extruder": defn.get("extruder", 1),
                "face_count": fc,
            })
            obj_id += 1

    obj1_xml = _xml_object_1_model(all_mesh_entries)
    model3d_xml = _xml_batch_3dmodel(all_part_cfgs)
    settings_xml = _xml_batch_model_settings(all_part_cfgs, total_faces, MODEL_ID, len(args.mesa_numeros))

    output_path = os.path.join(
        OUT_DIR, f"mesas_grid_{args.mesa_numeros[0]}a{args.mesa_numeros[-1]}.3mf"
    )
    static_dir = os.path.join(template_dir, "static")
    dynamic_entries = {
        "3D/Objects/object_1.model",
        "3D/3dmodel.model",
        "Metadata/model_settings.config",
    }
    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, _dirs, files in os.walk(static_dir):
            for fname in files:
                abs_p = os.path.join(root, fname)
                arc_p = os.path.relpath(abs_p, static_dir).replace("\\", "/")
                if arc_p in dynamic_entries:
                    continue
                zf.write(abs_p, arc_p)
        zf.writestr("3D/Objects/object_1.model", obj1_xml)
        zf.writestr("3D/3dmodel.model", model3d_xml)
        zf.writestr("Metadata/model_settings.config", settings_xml)

    print(f"3MF gerado: {output_path}")


if __name__ == "__main__":
    main()
