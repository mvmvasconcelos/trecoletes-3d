"""
Empacota os STLs ja renderizados (mesa_base.stl + mesa_N_emblem.stl) em um
unico .3mf com os objetos posicionados corretamente (layout em prancheta) e
com os extrusores/cores configurados via bambu_template/, reaproveitando a
mesma funcao que o restante da plataforma usa para geracao em lote
(_assemble_batch_3mf, em backend/app/api/generator.py).

Rodar dentro do container backend (cwd /app, onde o pacote "app" existe):
docker compose exec backend sh -c "cd /app && python3 /models/plaqueta_mesa_qrcode/_reference/pack_3mf.py 1 2 3 4"
"""
import os
import sys

from app.api.generator import _assemble_batch_3mf

MODEL_ID = "plaqueta_mesa_qrcode"
MODEL_DIR = f"/models/{MODEL_ID}"
OUT_DIR = os.path.join(MODEL_DIR, "_reference", "output")
PARTS = ["base", "emblem"]


def main():
    mesa_numeros = [int(a) for a in sys.argv[1:]] or [1, 2, 3, 4]

    base_path = os.path.join(OUT_DIR, "mesa_base.stl")
    render_tasks = []
    results = {}
    for n in mesa_numeros:
        key = str(n)
        emblem_path = os.path.join(OUT_DIR, f"mesa_{n}_emblem.stl")
        if not os.path.exists(emblem_path):
            raise FileNotFoundError(f"Falta {emblem_path} -- rode render_test.py primeiro")
        results[key] = {"base": base_path, "emblem": emblem_path}
        render_tasks.append((f"Mesa {n}", key, key, False))

    output_path = os.path.join(OUT_DIR, f"mesas_{mesa_numeros[0]}a{mesa_numeros[-1]}.3mf")
    _assemble_batch_3mf(MODEL_ID, render_tasks, results, PARTS, OUT_DIR, output_path)
    print(f"3MF gerado: {output_path}")


if __name__ == "__main__":
    main()
