# Wish: Ponteira SVG — paridade de ajustes finos com Ponteira Texto

| Field | Value |
|-------|-------|
| **Status** | SHIPPED |
| **Slug** | `ponteira-svg-paridade-ajustes` |
| **Date** | 2026-07-18 |
| **Author** | Vinicius Vasconcelos |
| **Appetite** | Pequena — 2 grupos de execução, sem overlap de arquivos entre eles, sem mudança de backend Python |
| **Branch** | `wish/ponteira-svg-paridade-ajustes` |
| **Repos touched** | trecoletes-3d (frontend + models) |
| **Design** | [DESIGN.md](../../brainstorms/ponteira-svg-paridade-ajustes/DESIGN.md) |

## Summary

`ponteira_lapis_svg/config.json` já define espessura da base, espessura da arte, margem, diâmetro
e orientação do furo nas seções "Ajustes Finos"/"Furação", mas `PonteiraLapisSvg.tsx` nunca lê
`config.sections` (só o array `parameters`, vazio nesse modelo) — então nenhum desses controles
chega à UI. Este wish entrega paridade real com `PonteiraLapisTexto.tsx` (accordion de seções),
alinha os defaults compartilhados entre os dois modelos (espessura da arte 0,8mm em ambos; demais
valores do SVG copiados do texto) e normaliza os labels do eixo Z ("Altura" → "Espessura") no
modelo texto. A convenção de nomenclatura de eixos (largura=X, altura=Y, espessura=Z) já foi
documentada na memória de projeto durante o brainstorm — não é uma entrega deste wish.

## Scope

### IN

- `PonteiraLapisSvg.tsx`: accordion "Ajustes Finos" (espessura da base, espessura da arte, margem
  do contorno) e "Furação" (orientação, formato, diâmetro do furo), no mesmo padrão de
  `PonteiraLapisTexto.tsx` (`renderAccordionSection`), com seed de `dynamicParams` a partir de
  `config.sections` (hoje só semeado de `config.parameters`, vazio) e um novo branch `select` no
  renderer inline da SVG (hoje só trata `boolean`/`range`).
- `ponteira_lapis_svg/config.json`: `base_height` 10→12, `outline_margin` 2.6→2.3 (alinhados ao
  texto; `hole_diameter` já é 7.6 em ambos, sem mudança de config.json), e reordenar as opções de
  `hole_orientation` para bater com o texto (Horizontal/`FRONTBACK` primeiro, hoje a SVG lista
  Vertical/`TOPBOTTOM` primeiro — só ordem de exibição, o default `FRONTBACK` já é igual nos dois).
- `letter_height.default` 1.2→0.8 em `ponteira_lapis_texto/config.json` **e**
  `ponteira_lapis_svg/config.json`.
- `ponteira_lapis_texto/config.json`: labels "Altura da letra"/"Altura da base" → "Espessura da
  letra"/"Espessura da base".
- Sincronizar os valores hardcoded de `model.scad` com os novos defaults de `config.json`:
  `ponteira_lapis_texto/model.scad` (`letter_height` 1.4→0.8); `ponteira_lapis_svg/model.scad`
  (`letter_height` 1.2→0.8, `base_height` 10→12, `outline_margin` 2.6→2.3, `hole_diameter`
  7.5→7.6).

### OUT

- Renomear/normalizar terminologia em outros modelos do repositório além de
  `ponteira_lapis_texto`/`ponteira_lapis_svg` — a convenção fica documentada na memória de projeto
  para uso futuro, sem rename retroativo em massa.
- Novos controles de posição X/Y do furo (`hole_x`/`hole_y`) — "posição do furo (vertical,
  horizontal)" já é coberto pelo `hole_orientation` existente.
- Trocar o color picker simples da SVG por `BambuColorPicker` com seleção de extrusora.
- Extrair um componente compartilhado de renderização de parâmetros entre `PonteiraLapisSvg.tsx` e
  `PonteiraLapisTexto.tsx` — duplicação pontual aceita para isolar risco.
- Alterar `id` (nome de variável SCAD) de qualquer parâmetro — só `name` (labels exibidos) e
  valores numéricos de default mudam.

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | "Posição do furo" = `hole_orientation` (select já existente), não um novo par `hole_x`/`hole_y` | Labels de `hole_orientation` já são "Horizontal (Passante)"/"Vertical (Chaveiro/Topper)", batendo exatamente com o parênteses do pedido original |
| 2 | Não renomear `id` dos parâmetros SCAD, só `name`/valores de default | Renomear `id` exigiria tocar `model.scad` e o backend genérico de `-D` sem ganho — o pedido é sobre terminologia visível e valores, não estrutura interna |
| 3 | Normalização de termos = memória de projeto (já feita no brainstorm) + fix pontual nos 2 labels do texto | Full rename cross-repo é escopo maior, não pedido; usuário pediu explicitamente "colocar na memória global do projeto" |
| 4 | SVG ganha lógica de accordion própria (duplicada), sem extrair componente compartilhado | Baixo risco — evita acoplar duas páginas com nuances distintas (`FontPicker`, `BambuColorPicker`) por uma abstração prematura para 2 usos |
| 5 | Grupos 1 (frontend) e 2 (config/scad) rodam em paralelo, mesma wave | Não compartilham nenhum arquivo — accordion da SVG funciona independente dos valores numéricos exatos de default |

## Success Criteria

- [x] `ponteira_lapis_svg/config.json` e `ponteira_lapis_texto/config.json`: `letter_height.default == 0.8`
- [x] `ponteira_lapis_svg/config.json`: `base_height.default == 12`, `outline_margin.default == 2.3`
- [x] `PonteiraLapisSvg.tsx` renderiza sliders de espessura da base, espessura da arte, margem do
      contorno, e selects de orientação/formato do furo + slider de diâmetro do furo — todos
      refletidos no `FormData` enviado a `/api/generate/ponteira_lapis_svg`
- [x] `ponteira_lapis_texto/config.json`: labels "Espessura da letra"/"Espessura da base"
      substituem "Altura da letra"/"Altura da base"
- [x] `ponteira_lapis_texto/model.scad`: `letter_height` hardcoded == 0.8, `hole_diameter`
      hardcoded == 7.6; `ponteira_lapis_svg/model.scad`:
      `letter_height`/`base_height`/`outline_margin`/`hole_diameter` hardcoded == 0.8/12/2.3/7.6
- [x] `ponteira_lapis_svg/config.json`: opções de `hole_orientation` na mesma ordem do texto
      (Horizontal/`FRONTBACK` primeiro)
- [x] `docker compose exec -T frontend npm run build` e `npm run lint` limpos
- [x] Teste manual via stack dev: gerar uma peça SVG variando espessura da base/arte, diâmetro e
      orientação do furo, e confirmar reflexo visual no 3MF gerado

## Execution Strategy

### Wave 1 (paralelo, sem overlap de arquivos)

| Group | Agent | Description |
|-------|-------|-------------|
| 1 | engineer | `PonteiraLapisSvg.tsx`: accordion de Ajustes Finos/Furação + branch `select` |
| 2 | engineer | `config.json`/`model.scad` dos dois modelos: defaults alinhados + labels normalizados |

## Execution Groups

### Group 1: Accordion de Ajustes Finos/Furação na SVG

**Goal:** `PonteiraLapisSvg.tsx` expõe os mesmos controles de espessura/furo que
`PonteiraLapisTexto.tsx`, lendo `config.sections` (hoje ignorado).

**Deliverables:**
1. `PonteiraLapisSvg.tsx`: no `useEffect` de carga de config (linha ~54-73), semear
   `dynamicParams` também a partir de `res.data.sections[].parameters` (não só
   `res.data.parameters`), replicando o helper `setDefaults` de `PonteiraLapisTexto.tsx`
   (`PonteiraLapisTexto.tsx:57-60`). **Atenção:** isso também semeia `base_color`/`letters_color`
   (seção "Cores") em `dynamicParams`, que não são a fonte de verdade da cor hoje — a UI usa o
   state local `modelColor`/`artColor` (`PonteiraLapisSvg.tsx:262-272`), não conectado a
   `dynamicParams`. Ao renderizar as seções, pule "Cores" no loop do accordion (como já previsto
   no Deliverable 2) para não duplicar UI — os dois campos de cor semeados em `dynamicParams`
   ficam órfãos (nunca editados, sempre enviados com o default do config) e não devem ser
   removidos do seed nem conectados aos color pickers custom neste wish (fora de escopo, ver
   Scope OUT).
2. `PonteiraLapisSvg.tsx`: adaptar `renderAccordionSection`/estado `openSections` de
   `PonteiraLapisTexto.tsx` (`PonteiraLapisTexto.tsx:39,75,232-251`) para renderizar as seções do
   config exceto "Cores" (que continua com os color pickers custom já existentes na SVG,
   `PonteiraLapisSvg.tsx:262-272`).
3. `PonteiraLapisSvg.tsx`: o renderer inline de parâmetro (`PonteiraLapisSvg.tsx:242-259`) ganha um
   branch `case 'select'` (copiado do `case 'select'` de `PonteiraLapisTexto.tsx:192-210`, sem o
   desvio especial de `font_name`) para cobrir `hole_orientation`/`hole_type`.
4. Confirmar que os novos campos semeados em `dynamicParams` continuam fluindo para o `FormData`
   de `handleGenerateClick` (`PonteiraLapisSvg.tsx:169-171`) sem mudança adicional — esse loop já
   itera todo `dynamicParams`.

**Acceptance Criteria:**
- [x] Ao carregar a página, o accordion "Ajustes Finos" mostra sliders de espessura da base,
      espessura da arte e margem do contorno com os defaults do `config.json`
- [x] O accordion "Furação" mostra select de orientação, select de formato e slider de diâmetro do
      furo, todos funcionais
- [x] Mudar qualquer um desses controles e clicar "Gerar Peças 3D" envia o valor correspondente no
      `FormData` (confirmar via network tab ou log do backend)
- [x] Seção "Cores" continua funcionando exatamente como antes (color pickers custom, sem
      regressão)

**Validation:**
```bash
docker compose exec -T frontend npm run build
docker compose exec -T frontend npm run lint
```
QA manual: carregar `/ponteira-lapis-svg`, subir um SVG, abrir os accordions, variar espessura da
base/arte e furo, gerar e conferir no Viewer3D/3MF resultante.

**depends-on:** none

---

### Group 2: Defaults e labels — config.json/model.scad

**Goal:** Os dois modelos compartilham os mesmos valores padrão de espessura/margem/furo (exceto
onde já divergiam por design) e usam terminologia consistente ("Espessura" para dimensões em Z).

**Deliverables:**
1. `models/ponteira_lapis_texto/config.json`: `letter_height.default` 1.2→0.8;
   `letter_height.name` "Altura da letra"→"Espessura da letra"; `base_height.name` "Altura da
   base"→"Espessura da base".
2. `models/ponteira_lapis_svg/config.json`: `letter_height.default` 1.2→0.8; `base_height.default`
   10→12; `outline_margin.default` 2.6→2.3 (`hole_diameter` já é 7.6, sem mudança).
3. `models/ponteira_lapis_texto/model.scad`: `letter_height = 1.4` → `letter_height = 0.8`
   (linha ~11); `hole_diameter = 7.8` → `hole_diameter = 7.6` (linha ~40, hoje desalinhado do
   `config.json`, que já é 7.6 — hygiene fix dentro do mesmo arquivo já tocado por este grupo).
4. `models/ponteira_lapis_svg/model.scad`: `letter_height = 1.2` → `0.8`, `base_height = 10` →
   `12`, `outline_margin = 2.6` → `2.3`, `hole_diameter = 7.5` → `7.6` (linhas ~7-14).

**Acceptance Criteria:**
- [x] `jq '.sections[].parameters[] | select(.id=="letter_height") | .default' models/ponteira_lapis_texto/config.json` retorna `0.8`
- [x] `jq '.sections[].parameters[] | select(.id=="letter_height") | .default' models/ponteira_lapis_svg/config.json` retorna `0.8`
- [x] `jq '.sections[].parameters[] | select(.id=="base_height") | .default' models/ponteira_lapis_svg/config.json` retorna `12`
- [x] `jq '.sections[].parameters[] | select(.id=="outline_margin") | .default' models/ponteira_lapis_svg/config.json` retorna `2.3`
- [x] `jq '.sections[].parameters[] | select(.id=="hole_orientation") | .options[0].value' models/ponteira_lapis_svg/config.json` retorna `"FRONTBACK"` (mesma ordem do texto)
- [x] `grep -q 'letter_height.*=.*0.8' models/ponteira_lapis_texto/model.scad`, `grep -q 'hole_diameter.*=.*7.6' models/ponteira_lapis_texto/model.scad`, e o mesmo padrão para os 4 valores do `model.scad` da SVG
- [x] Nenhuma referência a "Altura da letra"/"Altura da base" resta em
      `models/ponteira_lapis_texto/config.json`

**Validation:**
```bash
python3 -c "import json; json.load(open('models/ponteira_lapis_texto/config.json'))" && echo "texto config OK"
python3 -c "import json; json.load(open('models/ponteira_lapis_svg/config.json'))" && echo "svg config OK"
docker compose exec -T backend openscad -o /tmp/test_texto.stl -D 'part="base"' /models/ponteira_lapis_texto/model.scad
docker compose exec -T backend sh -c "echo '<svg viewBox=\"0 0 10 10\"><rect width=\"10\" height=\"10\"/></svg>' > /tmp/smoke.svg && openscad -o /tmp/test_svg.stl -D 'part=\"base\"' -D 'svg_linhas_path=\"/tmp/smoke.svg\"' /models/ponteira_lapis_svg/model.scad"
```
(os comandos `openscad` confirmam que os `model.scad` editados continuam sintaticamente válidos e
renderizam sem erro, usando um SVG placeholder mínimo só para a checagem sintática; o teste
funcional completo com SVG real fica no QA manual do Grupo 1)

**depends-on:** none

---

## QA Criteria

_What must be verified on dev after merge. The QA agent tests each criterion._

- [x] Fluxo completo: em `/ponteira-lapis-svg`, subir um SVG, abrir "Ajustes Finos"/"Furação",
      variar espessura da base, espessura da arte, diâmetro e orientação do furo, gerar e conferir
      que o 3MF resultante reflete os valores escolhidos
- [x] Integração: `/ponteira-lapis-texto` continua gerando normalmente com os novos defaults
      (espessura da letra 0,8mm) e os novos labels "Espessura da letra"/"Espessura da base"
      aparecem corretamente na UI
- [x] Regressão: seção "Cores" da SVG (color pickers custom) e o fluxo de upload/preview de
      SVG/PNG continuam funcionando sem mudança de comportamento

---

## Assumptions / Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| 3MFs em cache com defaults antigos não refletem a mudança retroativamente | Baixa | Comportamento esperado — cache é por hash de parâmetros, não exige ação |
| Trocar `outline_margin`/`base_height` padrão da SVG (10→12, 2.6→2.3) muda a aparência de peças já testadas visualmente pelo usuário | Média | Reportar a mudança de default explicitamente no fechamento do wish |
| Accordion novo na SVG pode introduzir bug de estado (`openSections`) não presente antes | Baixa | Reaproveitar exatamente o padrão já validado em produção em `PonteiraLapisTexto.tsx` |

---

## Review Results

**Plan review (pré-`/wish`, sobre o DESIGN.md):** FIX-FIRST → 3 gaps corrigidos inline (hole_diameter
já era 7.6 no config.json da SVG, faltava critério de sucesso para sync do model.scad, faltava
mencionar o novo branch `select`) → SHIP na repescagem.

**Plan review (pré-`/work`, sobre o WISH.md):** FIX-FIRST → 1 gap HIGH (reorder de opções de
`hole_orientation` ausente do escopo) + 1 MEDIUM (`hole_diameter=7.8` hardcoded no `model.scad` do
texto, desalinhado do próprio config.json) corrigidos → SHIP na repescagem.

**Execution review — Grupo 1 (accordion SVG):** SHIP, sem gaps. Build/lint limpos, smoke test real
contra o backend (`POST /api/generate/ponteira_lapis_svg` com parâmetros alterados → HTTP 200),
FontPicker/font_name confirmados ausentes no novo branch `select`.

**Execution review — Grupo 2 (defaults/labels):** SHIP, sem gaps. Todos os `jq`/`grep` de aceite
verificados por um reviewer independente; ambos `model.scad` renderizam via OpenSCAD sem erro;
diff isolado exatamente aos 4 arquivos esperados.

**Execution review final (wish completo):** SHIP, sem gaps CRITICAL/HIGH/MEDIUM/LOW. Confirmado:
diff bate exatamente com "Files to Create/Modify"; nenhum item de Scope OUT vazou para o código
(`hole_x`/`hole_y`, `BambuColorPicker`, componente compartilhado, rename de `id`); `PonteiraLapisTexto.tsx`
permanece intocado (rename de label herdado automaticamente via `p.name` genérico); invalidação de
cache dos 3MF confirmada como automática (hash por parâmetros). Usuário testou manualmente e
confirmou funcionamento.

---

## Files to Create/Modify

```
frontend/src/pages/PonteiraLapisSvg.tsx
models/ponteira_lapis_texto/config.json
models/ponteira_lapis_texto/model.scad
models/ponteira_lapis_svg/config.json
models/ponteira_lapis_svg/model.scad
```
