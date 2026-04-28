# Teste de Tolerância de Texto (`teste_tolerancia_texto`)

Documenta a arquitetura, geometria e decisões de implementação do modelo de teste de tolerância dimensional para encaixes de texto 3D impresso.

---

## 1. Propósito

Gera dois objetos complementares para calibrar a folga ideal de encaixe entre texto impresso e cavidades em texto:

| Peça | Descrição |
|------|-----------|
| **Chapa Negativa** (`chapa_negativa`) | Placa sólida com cavidades em formato de texto. Cada cavidade tem o texto expandido por uma tolerância diferente (`offset`). |
| **Texto Positivo** (`texto_positivo`) | Peça de referência em tamanho original (sem offset). Serve para testar qual cavidade encaixa melhor. |

**Fluxo de uso:**
1. Imprimir ambas as peças
2. Tentar encaixar o texto positivo em cada cavidade da chapa
3. A cavidade que encaixar com folga ideal → anotada como tolerância correta para aquela impressora/material

---

## 2. Geometria

### 2.1 Chapa Negativa

```
┌──────────────────────────────────┐  ─── plate_thickness (3mm)
│  ┌────────────────────────────┐  │  ↑ margem
│  │  TESTE  (tol=0.2mm)        │  │
│  └────────────────────────────┘  │  ↓ gap (2mm)
│  ┌────────────────────────────┐  │
│  │  TESTE  (tol=0.4mm)        │  │
│  └────────────────────────────┘  │  ↓ margem
└──────────────────────────────────┘
← margem → ←── text_width ──→ ← margem →
```

- Cavidades empilhadas no **eixo Y** (profundidade), uma por tolerância
- Cada cavidade: `offset(r = tolerancia)` aplicado ao texto 2D antes da extrusão
- Rótulo `"0.2mm"` gravado em baixo relevo na face superior, à esquerda de cada cavidade
- Chapa centralizada na **origem XY** (viewer 3D correto)
- Largura determinada pela **maior tolerância** (todas as cavidades ficam centralizadas no mesmo X)

### 2.2 Texto Positivo

- Texto em tamanho original, **sem offset** — exatamente o tamanho nominal
- Extrusão de `text_thickness = 2mm`
- No viewer combinado ("all"): posicionado 10mm abaixo da borda inferior da chapa

---

## 3. Fórmulas Dimensionais

### Largura da chapa (`plate_w`)

```
plate_w = text_width + 2 × max(tolerancias) + 2 × margem
```

A largura é fixada pelo maior offset (maior tolerância). Todas as cavidades ficam centralizadas em X.

### Estimativa de largura do texto (`text_width`)

```
text_width = tamanho × n_chars × 0.9
```

O fator `0.9` foi medido empiricamente para `Liberation Sans:style=Regular` (a fonte padrão desta view):
- "TESTE" (5 chars, tamanho=10) → largura real medida via STL: **41.68mm**
- Fator real: 41.68 / 50 = **0.834** → `0.9` dá margem de segurança para chars mais largos (M, W)
- `n_chars` é calculado pelo frontend (`texto.trim().length`) e injetado via `-D n_chars=N`
- A fonte `fonts-liberation` está listada no `backend/Dockerfile` e está disponível em `/usr/share/fonts/`

> ⚠️ **Se trocar de fonte**: medir a largura real novamente via STL export e recalcular o fator.
> O processo está documentado em [FONTES_NO_OPENSCAD.md](./FONTES_NO_OPENSCAD.md).

### Altura de cada linha (`row_h`)

```
row_h(tol) = text_height + 2 × tol + 2 × margem
           = tamanho + 2 × tolerancia + 2 × margem
```

### Profundidade total da chapa (`plate_d`)

```
plate_d = 2 × margem
        + Σ row_h(tol_i)   para i = 0..n-1
        + (n - 1) × gap    (gap = 2mm entre linhas)
```

### Posição Y do centro de cada cavidade (`cav_y`)

Calculado recursivamente para evitar o bug `[0:-1]` do OpenSCAD 2021:

```openscad
function _row_bot(tols, mg, i) =
    i == 0 ? mg : _row_bot(tols, mg, i-1) + row_h(tols[i-1], mg) + gap;

function cav_y(tols, mg, i) = _row_bot(tols, mg, i) + row_h(tols[i], mg) / 2;
```

---

## 4. Parâmetros do Modelo

| Parâmetro | Tipo | Padrão | Descrição |
|-----------|------|--------|-----------|
| `texto` | string | `"TESTE"` | Texto a ser testado |
| `tamanho` | int (5–50mm) | `10` | Altura da fonte em mm |
| `tolerancias` | lista de floats | `[0.2, 0.4]` | Uma por cavidade. Cada valor expande o contorno do texto naquela cavidade. |
| `margem` | float (1–5mm) | `2` | Espaço entre as cavidades e as bordas da chapa |
| `n_chars` | int (injetado) | `5` | Número de caracteres — injetado pelo frontend para estimativa de largura |

### Parâmetros constantes (no .scad)

| Constante | Valor | Descrição |
|-----------|-------|-----------|
| `plate_thickness` | 3mm | Espessura da chapa |
| `text_thickness` | 2mm | Espessura do texto positivo |
| `gap` | 2mm | Espaço vertical entre cavidades |
| `separation` | 10mm | Distância da borda da chapa ao topo do texto positivo (view "all") |

---

## 5. Limitações do OpenSCAD 2021

Esta implementação contorna duas limitações do OpenSCAD 2021.01:

### 5.1 `textmetrics()` não existe

A função `textmetrics()` que retornaria o bounding box real do texto só foi adicionada no OpenSCAD 2022+. Por isso o cálculo de `text_width` usa o fator estimado `0.9` + `n_chars` injetado pelo frontend.

**Quando o OpenSCAD estável ≥ 2022 estiver disponível**, substituir por:

```openscad
// Substituição futura (OpenSCAD 2022+)
metrics    = textmetrics(texto, size=tamanho, font="Liberation Sans:style=Regular");
text_width = metrics.size.x;
// Remover: n_chars, fator 0.9, e a injeção -D n_chars=N no frontend
```

### 5.2 Range `[0 : i-1]` retorna `undef` quando `i=0`

Em OpenSCAD 2021, `[for (j=[0:-1]) ...]` não retorna lista vazia — retorna `undef`. Por isso `_row_bot` e derivados são implementados como funções recursivas em vez de usar `_sum([for(j=[0:i-1]) ...])`.

---

## 6. Dispatcher de Partes

O backend injeta `-D part="nome_da_parte"` ao chamar o OpenSCAD. O `.scad` renderiza apenas a parte solicitada:

```openscad
if      (part == "chapa_negativa")  chapa_negativa();
else if (part == "texto_positivo")  texto_positivo();
else                                // "all": ambas + texto posicionado abaixo
```

---

## 7. Frontend (`TesteToleranciaTexto.tsx`)

### Dimensões estimadas (espelho do model.scad)

O frontend calcula e exibe dimensões antes de gerar, usando as **mesmas fórmulas** do SCAD:

```typescript
const textWidth = tamanho * (texto.length || 1) * 0.9;
const maxTol    = Math.max(...tolerancias);
const plateW    = textWidth + 2 * maxTol + 2 * margem;
const rowH      = (tol: number) => tamanho + 2 * tol + 2 * margem;
const plateD    = 2 * margem
                + tolerancias.reduce((s, t) => s + rowH(t), 0)
                + Math.max(0, tolerancias.length - 1) * gap;
```

### Posicionamento do Texto Positivo no Viewer 3D

O Viewer3D não usa a view "all" do OpenSCAD — cada STL é carregado independentemente na origem. O offset é calculado no frontend e passado via `artOffset`:

```typescript
// Top do texto fica 10mm abaixo da borda inferior da chapa
// valign="center" → centro do texto em -(plateD/2 + 10 + tamanho/2)
const artYOffset: [number, number, number] = [0, -(plateD / 2 + 10 + tamanho / 2), 0];
```

---

## 8. Reutilização em Modelos Futuros

O padrão de **chapa com cavidades de tolerância** pode ser reutilizado para outros formatos além de texto:

- **Furos circulares**: ver `test_holes_vertical` — mesma arquitetura, geometria diferente
- **Formas customizadas**: substituir o `text()` + `offset()` por qualquer geometria 2D + `offset()`
- **Múltiplas geometrias por linha**: estender `row_h` para acomodar formas mais altas

### Template reutilizável (conceitual)

```openscad
// Para qualquer geometria 2D em módulo shape_2d():
module cavidade(tol) {
    offset(r = tol)
        shape_2d();           // ← substituir pela geometria desejada
}

// plate_w, plate_d, _row_bot, cav_y permanecem iguais
// Apenas shape_2d() e row_h() precisam ser adaptados
```
