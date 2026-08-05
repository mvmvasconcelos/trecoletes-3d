"""
Compara a malha gerada por dois binários OpenSCAD (ex.: stable vs nightly)
para cada model.scad em models/, usando os parâmetros default do próprio
.scad (sem overrides -D). Fase 2 do plano de migração para OpenSCAD nightly:
sinaliza divergência geométrica antes de decidir promover o nightly.

Uso (dentro do container backend, onde os dois binários existem):
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

STABLE_BIN = "openscad"
NIGHTLY_BIN = "openscad-nightly"
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
        stable_stl = os.path.join(tmp, "stable.stl")
        nightly_stl = os.path.join(tmp, "nightly.stl")

        err_stable = render(STABLE_BIN, model_dir, stable_stl)
        err_nightly = render(NIGHTLY_BIN, model_dir, nightly_stl)

        if err_stable and err_nightly:
            return "SKIP (falha nos dois binários, não é regressão do nightly)"
        if err_stable:
            return f"FAIL (renderiza no nightly mas não no stable: {err_stable[:200]})"
        if err_nightly:
            return f"FAIL (renderiza no stable mas não no nightly: {err_nightly[:200]})"

        mesh_stable = trimesh.load(stable_stl)
        mesh_nightly = trimesh.load(nightly_stl)

        vol_stable, vol_nightly = abs(mesh_stable.volume), abs(mesh_nightly.volume)
        vol_diff = abs(vol_stable - vol_nightly) / max(vol_stable, 1e-9)

        bbox_stable = mesh_stable.bounding_box.extents
        bbox_nightly = mesh_nightly.bounding_box.extents
        bbox_diff = max(abs(a - b) for a, b in zip(bbox_stable, bbox_nightly))

        detail = (
            f"vol={vol_stable:.1f}->{vol_nightly:.1f}mm3 ({vol_diff:.1%}), "
            f"bbox_diff={bbox_diff:.2f}mm, "
            f"verts={len(mesh_stable.vertices)}->{len(mesh_nightly.vertices)}"
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
