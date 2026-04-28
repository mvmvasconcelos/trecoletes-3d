# Fontes no OpenSCAD: Guia e Melhores Práticas

Este documento resume as descobertas cruciais sobre lidar com fontes customizadas dentro do OpenSCAD headless em ambiente Docker/Linux.

---

## Arquitetura Atual de Fontes

O projeto suporta dois tipos de fonte:

| Tipo | Onde ficam | Como são usadas no SCAD |
|---|---|---|
| **Bundled** (embutidas no modelo) | `models/<modelo>/FonteName.ttf` | Requer `use <FonteName.ttf>` no topo do SCAD |
| **Google Fonts** (download sob demanda) | `backend/static/fonts/` | Não requer `use <>` — basta passar `font_name` como parâmetro |

O backend sempre define `OPENSCAD_FONT_PATH` apontando para **ambos** os diretórios ao chamar o OpenSCAD:

```python
font_path = f"{FONTS_DIR}:{os.path.join(MODELS_DIR, model_id)}"
env["OPENSCAD_FONT_PATH"] = font_path
```

Google Fonts são baixadas automaticamente pela função `ensure_font_downloaded()` em `backend/app/api/fonts.py` antes de cada geração.

---

## 1. Usar Sempre `.ttf` (Nunca `.otf`)

Apesar do OpenSCAD conseguir processar `.otf`, a geração de malha vetorial 3D falha silenciosamente — ele substitui a fonte pelo fallback do sistema (DejaVu Sans).

**Sempre converta e armazene fontes no formato `.ttf`.** O Fontconfig em Linux/Docker integra arquivos `.ttf` nativamente sem perdas.

---

## 2. `OPENSCAD_FONT_PATH` é Obrigatório no Headless

Quando o OpenSCAD roda por linha de comando (sem GUI), ele não descobre fontes ao redor do arquivo `.scad` automaticamente. A variável de ambiente `OPENSCAD_FONT_PATH` deve apontar para o(s) diretório(s) que contêm os `.ttf`.

O backend já faz isso automaticamente — não é necessária nenhuma ação manual.

---

## 3. Nome da Fonte: Metadado Interno, Não Nome de Arquivo

O OpenSCAD nunca busca pelo nome do arquivo (`minha_fonte.ttf`). Ele busca pelo **metadado de família registrado no arquivo**, verificável com:

```bash
fc-query arquivo.ttf | grep "family:"
```

No `config.json` e no `model.scad`, o nome da fonte deve ser o metadado exato, **sempre com `:style=`**:

```openscad
// Errado
font="Chewy"
// Certo
font="Chewy:style=Regular"
```

---

## 4. O Hífen no Nome da Fonte é um Delimitador do FontConfig

Este é o bug mais silencioso. O FontConfig usa `-` como separador interno (ex: `Arial-12`). Se a fonte tiver hífen real no nome (ex: `"TAN - NIMBUS"`), o FontConfig interpreta tudo após o hífen como tamanho de fonte e ignora a família silenciosamente, usando Arial como fallback.

**Solução 1 — Escapar com `\\-` no SCAD:**

```openscad
// Falha silenciosamente
font="TAN - NIMBUS:style=Regular"

// Funciona
font="TAN \\- NIMBUS:style=Regular"
```

**Solução 2 — Editar os metadados da fonte (recomendada para fontes fixas):**

Usando [Aspose Font Metadata Editor](https://products.aspose.app/font/metadata/ttf) ou FontForge, remova o hífen direto no metadado da família:
- Antes: `Family: TAN - NIMBUS` → gera conflito
- Depois: `Family: TANNIMBUS` → funciona sem nenhum escape

Esta é a abordagem mais limpa para fontes que fazem parte da biblioteca fixa do projeto (fontes bundled).

---

## 5. Fontes Google Fonts no `config.json`

O valor de `font_name` no `config.json` deve usar o formato FontConfig completo. O backend extrai a família antes do `:` para fazer o download, e passa o valor completo para o OpenSCAD:

```json
{
  "id": "font_name",
  "type": "select",
  "options": [
    { "value": "Chewy:style=Regular",   "label": "Chewy" },
    { "value": "Bangers:style=Regular", "label": "Bangers" },
    { "value": "Pacifico:style=Regular","label": "Pacifico" }
  ]
}
```

Fontes Google Fonts não precisam de `use <>` no SCAD — o download e o `OPENSCAD_FONT_PATH` cuidam do registro automaticamente.
