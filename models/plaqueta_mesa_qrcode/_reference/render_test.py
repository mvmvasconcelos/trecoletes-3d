"""
Prova de conceito: renderiza base + emblema (logo + textos + QR) para uma ou
mais mesas, chamando o OpenSCAD direto via CLI (sem passar pelo FastAPI ainda
-- isso e so para validar o layout/geometria antes de formalizar como modelo
da plataforma com config.json + bambu_template).

A base nao depende do numero da mesa, entao e renderizada uma unica vez
(mesa_base.stl) e reaproveitada para todas as mesas pedidas.

Rodar dentro do container backend:
docker compose exec backend python3 /models/plaqueta_mesa_qrcode/_reference/render_test.py 1 2 3 4
"""
import json
import os
import subprocess
import sys

import qrcode

MODEL_DIR = "/models/plaqueta_mesa_qrcode"
OUT_DIR = os.path.join(MODEL_DIR, "_reference", "output")
BASE_URL = "https://alemaosorvetes.mandarpedido.com/self-checkout/"


def qr_dark_cells(url: str):
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=1, border=0)
    qr.add_data(url)
    qr.make(fit=True)
    matrix = qr.get_matrix()
    cells = [[r, c] for r, row in enumerate(matrix) for c, dark in enumerate(row) if dark]
    return len(matrix), cells


def render(extra_args: list, part: str, out_path: str):
    cmd = [
        "openscad",
        "-o", out_path,
        *extra_args,
        "-D", f'part="{part}"',
        os.path.join(MODEL_DIR, "model.scad"),
    ]
    env = os.environ.copy()
    env["OPENSCAD_FONT_PATH"] = MODEL_DIR
    result = subprocess.run(cmd, capture_output=True, text=True, env=env, timeout=120)
    if result.returncode != 0:
        print(f"--- ERRO ao renderizar '{part}' ({out_path}) ---")
        print(result.stdout)
        print(result.stderr)
        sys.exit(1)
    print(f"{part} -> {out_path}")


def main():
    mesa_numeros = [int(a) for a in sys.argv[1:]] or [32]
    os.makedirs(OUT_DIR, exist_ok=True)

    render([], "base", os.path.join(OUT_DIR, "mesa_base.stl"))

    for mesa_numero in mesa_numeros:
        url = BASE_URL + str(mesa_numero)
        module_count, cells = qr_dark_cells(url)
        print(f"mesa {mesa_numero}: url={url} qr_module_count={module_count} dark_cells={len(cells)}")

        extra_args = [
            "-D", f"mesa_numero={mesa_numero}",
            "-D", f"qr_module_count={module_count}",
            "-D", f"qr_dark_cells={json.dumps(cells)}",
        ]
        render(extra_args, "emblem", os.path.join(OUT_DIR, f"mesa_{mesa_numero}_emblem.stl"))


if __name__ == "__main__":
    main()
