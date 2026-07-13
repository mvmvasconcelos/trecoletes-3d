"""
Teste de fumaça para o modelo backend `editor_generico` (Grupo 6 da wish
editor-camadas-2d). Segue o mesmo estilo de `test_api.py`: um script
standalone que faz POST contra um backend local já em execução
(http://localhost:8000) e inspeta a resposta.

Cenário: envia 4 SVGs (um por slot), mas ativa apenas as Partes 1 e 3
(part1_active=true, part2_active=false, part3_active=true,
part4_active=false). Depois:
  1. Confirma que a resposta contém uma URL de `.3mf` válida.
  2. Baixa o `.3mf` (é um .zip) e confirma que existem exatamente 2 STLs
     de partes dentro do pacote (part_1 e part_3), com os extrusores
     padrão declarados em bambu_parts_config.json (1 e 3).
  3. Confirma que as partes inativas (part_2, part_4) NÃO aparecem no
     3MF (nem model_settings.config nem 3dmodel.model as referenciam).
"""

import io
import re
import sys
import zipfile

import requests

API_BASE = "http://localhost:8000"
MODEL_ID = "editor_generico"
URL = f"{API_BASE}/api/generate_parametric/{MODEL_ID}"


def _square_svg(size_mm: float) -> bytes:
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="0 0 {size_mm} {size_mm}" width="{size_mm}mm" height="{size_mm}mm">'
        f'<rect x="0" y="0" width="{size_mm}" height="{size_mm}" /></svg>'
    )
    return svg.encode("utf-8")


def main() -> int:
    data = {
        "part1_active": "true",
        "part1_height": "3.0",
        "part2_active": "false",
        "part2_height": "2.0",
        "part3_active": "true",
        "part3_height": "1.5",
        "part4_active": "false",
        "part4_height": "2.0",
    }
    files = {
        "part1_svg": ("part1.svg", io.BytesIO(_square_svg(20)), "image/svg+xml"),
        "part2_svg": ("part2.svg", io.BytesIO(_square_svg(15)), "image/svg+xml"),
        "part3_svg": ("part3.svg", io.BytesIO(_square_svg(10)), "image/svg+xml"),
        "part4_svg": ("part4.svg", io.BytesIO(_square_svg(8)), "image/svg+xml"),
    }

    print(f"Enviando POST para {URL} (Parte 1 e Parte 3 ativas; Parte 2 e Parte 4 inativas)...")
    resp = requests.post(URL, data=data, files=files, timeout=120)
    print(f"Status Code: {resp.status_code}")
    if resp.status_code != 200:
        print("Response:", resp.text)
        return 1

    payload = resp.json()
    print("Response JSON:", payload)

    assert payload.get("success") is True, "Resposta não indica sucesso"

    files_out = payload.get("files", {})
    assert "3mf" in files_out, f"Resposta não contém URL de .3mf: {files_out}"
    assert "part_2" not in files_out, "STL da Parte 2 (inativa) não deveria estar na resposta"
    assert "part_4" not in files_out, "STL da Parte 4 (inativa) não deveria estar na resposta"
    assert "part_1" in files_out, "STL da Parte 1 (ativa) deveria estar na resposta"
    assert "part_3" in files_out, "STL da Parte 3 (ativa) deveria estar na resposta"
    print("[OK] Resposta contém STLs apenas das partes ativas (part_1, part_3).")

    mf_url = API_BASE + files_out["3mf"]
    print(f"Baixando 3MF: {mf_url}")
    mf_resp = requests.get(mf_url, timeout=60)
    assert mf_resp.status_code == 200, f"Falha ao baixar .3mf: {mf_resp.status_code}"

    zf = zipfile.ZipFile(io.BytesIO(mf_resp.content))
    names = zf.namelist()
    print("Conteúdo do .3mf:", names)

    settings_txt = zf.read("Metadata/model_settings.config").decode("utf-8")
    model3d_txt = zf.read("3D/3dmodel.model").decode("utf-8")
    object1_txt = zf.read("3D/Objects/object_1.model").decode("utf-8")

    # display_name vem de bambu_parts_config.json (Parte 1..Parte 4).
    # As partes ativas devem aparecer nos metadados...
    for expected_name in ("Parte 1", "Parte 3"):
        assert expected_name in settings_txt, f"'{expected_name}' não encontrado em model_settings.config"

    # ...e as inativas NÃO devem deixar rastro (nem objeto fantasma, nem STL vazio).
    for missing_name in ("Parte 2", "Parte 4"):
        assert missing_name not in settings_txt, (
            f"Parte inativa '{missing_name}' apareceu em model_settings.config (parte fantasma!)"
        )

    # Exatamente 2 malhas 3D no pacote (object_1.model contém um <object> por
    # parte renderizada; part_2/part_4 nunca chegam a virar objeto).
    object_ids_in_mesh_file = re.findall(r'<object id="(\d+)" type="model">', object1_txt)
    assert len(object_ids_in_mesh_file) == 2, (
        f"Esperado 2 objetos/malhas no 3MF, encontrado {len(object_ids_in_mesh_file)}: {object_ids_in_mesh_file}"
    )
    print(f"[OK] object_1.model contém exatamente {len(object_ids_in_mesh_file)} malhas (esperado 2).")

    # O assembly (3dmodel.model) referencia exatamente os mesmos 2 objectids
    # via <component objectid="...">.
    component_ids = re.findall(r'<component p:path="/3D/Objects/object_1\.model" objectid="(\d+)"', model3d_txt)
    assert sorted(component_ids) == sorted(object_ids_in_mesh_file), (
        f"Componentes montados ({component_ids}) não batem com as malhas geradas ({object_ids_in_mesh_file})"
    )
    print(f"[OK] 3dmodel.model monta exatamente as {len(component_ids)} partes ativas (sem parte fantasma).")

    # <part id="X" subtype="normal_part"> — deve haver exatamente 2 (uma por parte ativa).
    part_ids = re.findall(r'<part id="(\d+)" subtype="normal_part">', settings_txt)
    assert len(part_ids) == 2, f"Esperado 2 <part> em model_settings.config, encontrado {len(part_ids)}: {part_ids}"

    # Extrusores esperados: Parte 1 -> extruder 1, Parte 3 -> extruder 3 (default do
    # bambu_parts_config.json, sem overrides enviados neste teste).
    def _extruder_for(display_name: str) -> str:
        m = re.search(
            rf'<metadata key="name" value="{re.escape(display_name)}"/>\s*'
            rf'<metadata key="extruder" value="(\d+)"/>',
            settings_txt,
        )
        assert m, f"Não encontrei o extrusor de '{display_name}' em model_settings.config"
        return m.group(1)

    assert _extruder_for("Parte 1") == "1", "Parte 1 deveria estar no extrusor 1 (default)"
    assert _extruder_for("Parte 3") == "3", "Parte 3 deveria estar no extrusor 3 (default)"
    print("[OK] Partes ativas usam os extrusores padrão esperados (Parte 1 -> extrusor 1, Parte 3 -> extrusor 3).")

    print("\nTODOS OS TESTES PASSARAM.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
