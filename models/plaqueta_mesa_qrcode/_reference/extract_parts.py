"""
Extrai partes estaticas (base, pecas do logo, texto "Faca seu pedido") do
3MF de referencia "Plaqueta QRCode.3mf" como STL individuais, centrados na
propria origem local (mesma convencao usada pelo Bambu Studio neste arquivo).

QR code e "Texto Mesa" NAO sao extraidos aqui -- sao gerados parametricamente
por mesa no model.scad (matriz do QR muda, e o numero da mesa muda).

Rodar dentro do container backend (tem lxml/python, sem dependencia nova):
docker compose exec backend python3 /models/plaqueta_mesa_qrcode/_reference/extract_parts.py
"""
import xml.etree.ElementTree as ET
import os

NS = "{http://schemas.microsoft.com/3dmanufacturing/core/2015/02}"
SRC = "/models/plaqueta_mesa_qrcode/_reference/extracted_3mf/3D/Objects/object_56.model"
OUT_DIR = "/models/plaqueta_mesa_qrcode"

# id -> nome do arquivo de saida (so as partes estaticas que vamos reaproveitar)
PARTS = {
    "1": "base.stl",
    "2": "logo1.stl",
    "3": "logo2.stl",
    "4": "logo3.stl",
    "5": "logo4.stl",
    "8": "texto_faca_pedido.stl",
}


def write_ascii_stl(path: str, vertices: list, triangles: list) -> None:
    name = os.path.splitext(os.path.basename(path))[0]
    with open(path, "w") as f:
        f.write(f"solid {name}\n")
        for v1, v2, v3 in triangles:
            p1, p2, p3 = vertices[v1], vertices[v2], vertices[v3]
            ux, uy, uz = (p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2])
            vx, vy, vz = (p3[0] - p1[0], p3[1] - p1[1], p3[2] - p1[2])
            nx, ny, nz = (uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx)
            length = (nx ** 2 + ny ** 2 + nz ** 2) ** 0.5
            if length > 0:
                nx, ny, nz = nx / length, ny / length, nz / length
            f.write(f"facet normal {nx:.6f} {ny:.6f} {nz:.6f}\n")
            f.write("outer loop\n")
            for p in (p1, p2, p3):
                f.write(f"vertex {p[0]:.6f} {p[1]:.6f} {p[2]:.6f}\n")
            f.write("endloop\nendfacet\n")
        f.write(f"endsolid {name}\n")


def main():
    tree = ET.parse(SRC)
    root = tree.getroot()
    for obj in root.iter(f"{NS}object"):
        obj_id = obj.get("id")
        if obj_id not in PARTS:
            continue
        vertices = [
            (float(v.get("x")), float(v.get("y")), float(v.get("z")))
            for v in obj.iter(f"{NS}vertex")
        ]
        triangles = [
            (int(t.get("v1")), int(t.get("v2")), int(t.get("v3")))
            for t in obj.iter(f"{NS}triangle")
        ]
        out_path = os.path.join(OUT_DIR, PARTS[obj_id])
        write_ascii_stl(out_path, vertices, triangles)
        print(f"object {obj_id} -> {out_path} ({len(vertices)} verts, {len(triangles)} tris)")


if __name__ == "__main__":
    main()
