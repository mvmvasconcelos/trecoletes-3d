"""
Teste de fumaça do formato de saída do lote (/api/generate_batch). Script
standalone, mesmo estilo de `test_editor_generico.py`: roda contra o backend
local já em execução (http://localhost:8000).

  1. Lote com 1 nome → `file` aponta para um .3mf com o nome do item.
  2. Lote com 2 nomes → `file` aponta para o .zip com um .3mf por nome.
"""

import io
import json
import sys
import time
import zipfile
from urllib.parse import unquote

import requests

API_BASE = "http://localhost:8000"
MODEL_ID = "ponteira_lapis_texto"


def run_batch(names: list[str]) -> str:
    rows = [{"nome": n} for n in names]
    resp = requests.post(f"{API_BASE}/api/generate_batch/{MODEL_ID}", data={"names": json.dumps(rows)}, timeout=60)
    resp.raise_for_status()
    job = resp.json()
    while job["status"] == "running":
        time.sleep(2)
        job = requests.get(f"{API_BASE}/api/batch_status/{job['batch_id']}", timeout=30).json()
    assert job["status"] == "done", job
    return job["file"]


def main() -> int:
    nonce = str(int(time.time()))  # evita cache de execuções anteriores

    url = run_batch([f"Ana {nonce}"])
    print(f"1 nome  → {url}")
    assert unquote(url).endswith(f"/Ana {nonce}.3mf"), url
    data = requests.get(f"{API_BASE}{url}", timeout=30).content
    assert "3D/3dmodel.model" in zipfile.ZipFile(io.BytesIO(data)).namelist()

    url = run_batch([f"Ana {nonce}", f"Bia {nonce}"])
    print(f"2 nomes → {url}")
    assert url.endswith(f"/{MODEL_ID}_batch.zip"), url
    data = requests.get(f"{API_BASE}{url}", timeout=30).content
    assert sorted(zipfile.ZipFile(io.BytesIO(data)).namelist()) == [f"Ana {nonce}.3mf", f"Bia {nonce}.3mf"]

    print("OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
