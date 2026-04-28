# Engine Python: Teste de Tolerância de Texto (CQ)

Documentação do modelo `teste_tolerancia_texto_cq`, que usa um engine Python puro
(Shapely + fonttools + trimesh) em vez de OpenSCAD headless.

> **Nota sobre o nome:** O modelo foi originalmente planejado com CadQuery, mas a
> implementação final usa apenas Shapely + trimesh, que são mais simples, sem
> dependências nativas extras e já estavam instalados. O `"engine": "cadquery"` no
> `config.json` é um rótulo legado que não altera o comportamento.
> CadQuery **não está instalado** no container e não é usado.

---

## Motivação

O modelo OpenSCAD equivalente (`teste_tolerancia_texto`) tem duas limitações:

| Limitação | OpenSCAD 2021 | Engine Python |
|---|---|---|
| Largura do texto | Estimada com fator 0.9 (imprecisa) | Exata via fonttools |
| Booleanas 2D + 3D | Subprocess externo complexo | Operações Shapely in-process |
| `n_chars` injetado | Necessário (workaround) | Eliminado |
| Offset de tolerância | `offset(r=tol)` nativo | `shapely.buffer(tol)` (mais robusto para letras com buracos) |

---

## Arquitetura

Toda a geometria é construída **em 2D (Shapely)** antes da extrusão. Isso evita
operações booleanas 3D caras e instáveis.

```
fonttools (RecordingPen)
    → contornos de glifo (Bézier quadrática/cúbica amostrados com N=16)
    → Shapely Polygon por glifo (regra even-odd para tratar buracos de "O", "B"…)
    → geometria 2D do texto completo (unary_union)

Shapely
    → text_bbox() — largura/altura exatas
    → text_offset_shapely() — buffer(tol) para as cavidades

chapa_negativa():
    → cria placa 2D (shapely_box)
    → subtrai cada cavidade (texto com offset + rótulo gravado)
    → extrusão via trimesh.creation.extrude_polygon

texto_positivo():
    → texto sem offset → extrusão

trimesh
    → exporta chapa_negativa.stl e texto_positivo.stl
    → backend empacota em .3mf com _pack_bambu_3mf()
```

---

## Interface Pública (`model.py`)

```python
generate(params: dict, output_dir: str) -> dict[str, str]
```

| Parâmetro | Tipo | Descrição |
|---|---|---|
| `texto` | `str` | Texto a ser renderizado (ex: `"TESTE"`) |
| `tamanho` | `float` | Altura da letra maiúscula em mm |
| `tolerancias` | `list[float]` ou JSON string | Uma tolerância por cavidade |
| `margem` | `float` | Espaço entre bordas da chapa e conteúdo (mm) |

Retorna `{"chapa_negativa": "/path/chapa_negativa.stl", "texto_positivo": "/path/texto_positivo.stl"}`.

---

## Fonte Usada

A fonte está hardcoded em `model.py`:
```python
FONT_PATH = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"
```

Instalada via `fonts-liberation` no Docker. Para usar outra fonte, trocar este caminho.

---

## Como o Backend Invoca o Engine Python

O endpoint `/api/generate_parametric/teste_tolerancia_texto_cq` detecta a presença
de `model.py` (em vez de `model.scad`) e chama `generate(params, output_dir)` diretamente
via `importlib`, sem subprocess.

---

## Estrutura de Arquivos

```
models/teste_tolerancia_texto_cq/
├── config.json    ← UI + parâmetros (mesmo formato dos modelos OpenSCAD)
└── model.py       ← engine Python (Shapely + fonttools + trimesh)
```

O modelo OpenSCAD original em `models/teste_tolerancia_texto/` não foi modificado.
