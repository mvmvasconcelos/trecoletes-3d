#!/usr/bin/env python3
"""Converte um arquivo STL (ASCII ou binary) para um arquivo OpenSCAD contendo
um polyhedron(points = [...], faces = [...]).

Uso: ajuste os caminhos `INPUT` e `OUTPUT` abaixo ou execute como módulo.
"""
from __future__ import annotations
import struct
from pathlib import Path
from typing import List, Tuple

INPUT = Path("converted/plaqueta.stl")
OUTPUT = Path("converted/plaqueta_embedded.scad")


def read_stl(filename: Path) -> Tuple[List[Tuple[float, float, float]], List[Tuple[int, int, int]]]:
    data = filename.read_bytes()
    # tenta interpretar como binary STL
    if len(data) < 84:
        raise ValueError("Arquivo STL muito pequeno")

    header = data[:80]
    num_triangles = struct.unpack_from('<I', data, 80)[0]
    expected_size = 84 + num_triangles * 50
    if expected_size == len(data):
        # binary
        verts: List[Tuple[float, float, float]] = []
        faces: List[Tuple[int, int, int]] = []
        idx_map = {}
        offset = 84
        for i in range(num_triangles):
            # normal: 3 floats
            # then 3 vertices * 3 floats
            # then attribute (2 bytes)
            nx, ny, nz = struct.unpack_from('<3f', data, offset)
            offset += 12
            tri_idx = []
            for v in range(3):
                x, y, z = struct.unpack_from('<3f', data, offset)
                offset += 12
                key = (round(x, 6), round(y, 6), round(z, 6))
                if key not in idx_map:
                    idx_map[key] = len(verts)
                    verts.append((x, y, z))
                tri_idx.append(idx_map[key])
            faces.append((tri_idx[0], tri_idx[1], tri_idx[2]))
            offset += 2  # attribute byte count
        return verts, faces

    # se não for binary, tenta ASCII
    text = data.decode('utf-8', errors='ignore')
    verts: List[Tuple[float, float, float]] = []
    faces: List[Tuple[int, int, int]] = []
    idx_map = {}
    current = []
    for line in text.splitlines():
        line = line.strip()
        if line.lower().startswith('vertex'):
            parts = line.split()
            try:
                x, y, z = float(parts[1]), float(parts[2]), float(parts[3])
            except Exception:
                continue
            key = (round(x, 6), round(y, 6), round(z, 6))
            if key not in idx_map:
                idx_map[key] = len(verts)
                verts.append((x, y, z))
            current.append(idx_map[key])
            if len(current) == 3:
                faces.append((current[0], current[1], current[2]))
                current = []
    if not verts or not faces:
        raise ValueError("Falha ao parsear STL (nem ASCII nem binary detectado)")
    return verts, faces


def write_scad(points: List[Tuple[float, float, float]], faces: List[Tuple[int, int, int]], out: Path) -> None:
    with out.open('w', encoding='utf8') as f:
        f.write('// Gerado por scripts/stl_to_scad.py\n')
        f.write('// Pontos: %d  Faces: %d\n\n' % (len(points), len(faces)))
        f.write('polyhedron(\n')
        f.write('  points = [\n')
        for (x, y, z) in points:
            f.write('    [%r, %r, %r],\n' % (x, y, z))
        f.write('  ],\n')
        f.write('  faces = [\n')
        for (a, b, c) in faces:
            f.write('    [%d, %d, %d],\n' % (a, b, c))
        f.write('  ]\n')
        f.write(');\n')


def main() -> int:
    if not INPUT.exists():
        print(f"Arquivo de entrada não encontrado: {INPUT}")
        return 2
    print(f"Lendo {INPUT}...")
    pts, fcs = read_stl(INPUT)
    print(f"Vertices: {len(pts)}  Faces: {len(fcs)}")
    print(f"Escrevendo {OUTPUT}...")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    write_scad(pts, fcs, OUTPUT)
    print("Concluído.")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
