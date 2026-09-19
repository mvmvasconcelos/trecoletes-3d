"""
Compara a malha gerada por dois binários OpenSCAD para cada model.scad em
models/, usando os parâmetros default do próprio .scad (sem overrides -D).
Sinaliza divergência geométrica entre os dois binários comparados.

O backend usa só `openscad-nightly` em produção (é o único engine instalado
na imagem). Este script serve para comparar duas versões do nightly (ex.:
antes/depois de bumpar OPENSCAD_NIGHTLY_DATE no Dockerfile) — aponte BIN_A/
BIN_B abaixo para os dois binários que quer comparar.

Uso (dentro do container backend):
    python compare_openscad_backends.py
    python compare_openscad_backends.py tampa_bic ponteira_lapis_texto
"""
import os
import subprocess
import sys
import tempfile

import trimesh

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.environ.get("MODELS_DIR", os.path.abspath(os.path.join(BASE_DIR, "..", "models")))
FONTS_DIR = os.path.join(BASE_DIR, "static", "fonts")

BIN_A = "openscad-nightly"
BIN_B = "openscad-nightly"
TIMEOUT = 300

# Tolerância: motores diferentes trianguem diferente, então comparamos
# volume/bbox (propriedades físicas), não contagem bruta de vértices/facetas.
VOLUME_TOLERANCE = 0.05  # 5%
BBOX_TOLERANCE_MM = 0.5


def render(binary: str, model_dir: str, out_path: str) -> str | None:
    scad_path = os.path.join(model_dir, "model.scad")
    env = os.environ.copy()
    env["OPENSCAD_FONT_PATH"] = f"{FONTS_DIR}:{model_dir}"
    try:
        subprocess.run(
            [binary, "-o", out_path, scad_path],
            check=True, capture_output=True, text=True, env=env, timeout=TIMEOUT,
        )
    except Exception as exc:
        return str(exc)
    return None


def compare_model(model_id: str) -> str:
    model_dir = os.path.join(MODELS_DIR, model_id)
    if not os.path.isfile(os.path.join(model_dir, "model.scad")):
        return "SKIP (sem model.scad)"

    with tempfile.TemporaryDirectory() as tmp:
        a_stl = os.path.join(tmp, "a.stl")
        b_stl = os.path.join(tmp, "b.stl")

        err_a = render(BIN_A, model_dir, a_stl)
        err_b = render(BIN_B, model_dir, b_stl)

        if err_a and err_b:
            return "SKIP (falha nos dois binários)"
        if err_a:
            return f"FAIL (renderiza em BIN_B mas não em BIN_A: {err_a[:200]})"
        if err_b:
            return f"FAIL (renderiza em BIN_A mas não em BIN_B: {err_b[:200]})"

        mesh_a = trimesh.load(a_stl)
        mesh_b = trimesh.load(b_stl)

        vol_a, vol_b = abs(mesh_a.volume), abs(mesh_b.volume)
        vol_diff = abs(vol_a - vol_b) / max(vol_a, 1e-9)

        bbox_a = mesh_a.bounding_box.extents
        bbox_b = mesh_b.bounding_box.extents
        bbox_diff = max(abs(x - y) for x, y in zip(bbox_a, bbox_b))

        detail = (
            f"vol={vol_a:.1f}->{vol_b:.1f}mm3 ({vol_diff:.1%}), "
            f"bbox_diff={bbox_diff:.2f}mm, "
            f"verts={len(mesh_a.vertices)}->{len(mesh_b.vertices)}"
        )

        if vol_diff > VOLUME_TOLERANCE or bbox_diff > BBOX_TOLERANCE_MM:
            return f"DIVERGENCE ({detail})"
        return f"OK ({detail})"


def main():
    requested = sys.argv[1:] or sorted(
        d for d in os.listdir(MODELS_DIR) if os.path.isdir(os.path.join(MODELS_DIR, d))
    )
    results = {model_id: compare_model(model_id) for model_id in requested}

    for model_id, result in results.items():
        print(f"{model_id}: {result}")

    divergent = [m for m, r in results.items() if r.startswith(("DIVERGENCE", "FAIL"))]
    if divergent:
        print(f"\n{len(divergent)} modelo(s) com divergência/falha: {divergent}")
        sys.exit(1)
    print("\nTodos os modelos comparados OK.")


if __name__ == "__main__":
    main()
