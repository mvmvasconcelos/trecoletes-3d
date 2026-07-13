# Design: Editor 2D em Camadas → Geração 3D

| Field | Value |
|-------|-------|
| **Slug** | `editor-camadas-2d` |
| **Date** | 2026-07-10 |
| **WRS** | 100/100 |

## Problem

Compor texto e imagens em um modelo 3D hoje exige código novo por modelo (ex: `chaveiro_simples` só suporta 2 linhas fixas de texto hardcoded no `.scad`) — precisamos de um editor visual genérico que gere a composição sem trabalho de desenvolvimento por combinação.

## Scope

### IN
- Nova página "Editor 2D" no frontend, listada em `Home.tsx` na seção "Testes & Ferramentas"
- Canvas interativo com **Konva + react-konva**: adicionar, mover, redimensionar, rotacionar camadas
- Camada de texto: qualquer fonte já bundled no projeto, convertida para path vetorial via **opentype.js** (client-side) — texto passa a ser tratado como mais uma camada de path, igual a uma imagem importada
- Camada de imagem: upload de SVG/PNG, reaproveitando o endpoint já existente `POST /api/convert/png-to-svg` (potrace)
- Ferramenta "duplicar + aplicar silhueta/contorno": duplica uma camada (tipicamente texto) e gera uma nova camada com a geometria já expandida por uma margem (mesma ideia de um filtro "glow" a 0% de transparência num editor de imagens) — o cálculo do contorno acontece **inteiramente no browser** (lib de offset poligonal, ex.: Clipper), produzindo um path real e editável, não um parâmetro passado pro backend
- Painel de camadas com agrupamento: **no canvas 2D**, usuário atribui camadas a "partes" — só a estrutura (quais camadas formam qual parte), suportando até **4 partes fixas** — `scad_name` `part_1`..`part_4` no `bambu_parts_config.json` (hoje o sistema só tem `base`/`letters`), cada uma alimentada pelas variáveis escalares `part1_svg`/`part1_height`/`part1_active` (sem underscore entre "part" e o número — só um prefixo de nome de variável `-D`, namespace diferente do `scad_name`; sem variável de offset — o contorno já vem "assado" dentro do SVG exportado pelo editor)
- **Altura e cor/extrusora de cada parte NÃO ficam no canvas 2D** — vivem num painel lateral **sempre visível** assim que existem partes agrupadas (pré-preenchido com valores padrão sensatos), igual à `<aside>` de parâmetros em `ChaveiroSimplesSvg.tsx` (que já inclui `BambuColorPicker` e renderiza antes de qualquer clique em "Gerar"). O que É gated em "Gerar 3D" — reaproveitando literalmente o comportamento de `ChaveiroSimplesSvg.tsx` — é só o **mesh renderizado no `Viewer3D`** e o **botão de exportar**, ambos condicionados à resposta da geração (`tmfUrl`/URLs de STL só existem depois do clique)
- Novo modelo backend genérico `models/editor_generico/` com 4 slots de parte pré-registrados no `bambu_template/bambu_parts_config.json` (padrão estático já usado por todos os modelos); cada slot recebe suas próprias variáveis escalares via `-D` (`part1_svg`, `part1_height`, `part1_active`, ... até `part4_*`); o `model.scad` só faz `resize()` + `linear_extrude()` por slot — nenhuma chamada a `offset()` no motor 3D; a cor de cada slot é roteada pelo mecanismo `extruder_overrides` que já existe hoje; `Viewer3D` já expõe um prop genérico `extraMeshes: { url, color, offset? }[]` (`Viewer3D.tsx`) — mecanismo suficiente pra renderizar as até 4 partes sem precisar de props nomeadas por modelo
- Fluxo completo: montar composição + agrupar camadas em partes no canvas → painel de altura/cor por parte já visível (valores padrão) → clicar "Gerar 3D" → `Viewer3D` renderiza o mesh atualizado → ajustar um valor e clicar "Gerar" de novo recalcula o preview → botão "Exportar 3MF" aparece quando a resposta traz a URL do `.3mf` (mesmo padrão do "Baixar 3MF" já usado em todos os modelos)

### OUT (v1)
- Furo de argola / recursos específicos de chaveiro (iteração futura)
- Substituir ou migrar modelos existentes (`chaveiro_simples`, `cortador_bolacha`, etc.) — o editor é uma ferramenta nova e paralela
- Seleção de "modelo alvo" com parâmetros específicos por modelo (ex: posição de argola, formato de furação) — visão futura, fora deste incremento
- Undo/redo, templates salvos/reutilizáveis, suporte touch/mobile
- Efeitos avançados estilo Canva (sombras, gradientes, filtros, blend modes)

## Approach

Editor 2D genérico construído com Konva, desacoplado dos modelos existentes. **Toda a lógica 2D — incluindo geração de silhueta/contorno — vive no editor; o motor 3D só sabe fazer `resize()` + `linear_extrude()`.** Texto vira path via opentype.js e imagem vira path via potrace (ambos client-side ou já reaproveitados); a ferramenta "duplicar + silhueta" aplica uma expansão poligonal real (lib de offset, ex. Clipper) sobre esse path, gerando uma nova camada com geometria concreta — não um parâmetro que o backend interpreta depois. O resultado final exportado pro backend é sempre um SVG "achatado", pronto pra extrudar. O novo modelo backend (`editor_generico`) tem **4 slots de parte fixos e pré-registrados** (`part_1`..`part_4`) em vez de um dispatcher dinâmico — cada slot é um conjunto de variáveis escalares (`partN_svg`, `partN_height`, `partN_active`) injetadas via `-D`, evitando o problema de serializar um array dinâmico e heterogêneo (string+número) através da CLI do OpenSCAD. A peça nova de verdade é a UI de edição interativa (Konva), a conversão texto→path (opentype.js) e o cálculo de silhueta (Clipper) no browser; todo o resto — normalização de SVG, PNG→SVG via potrace, extrusor-por-parte do Bambu template (via `extruder_overrides`), fontes já servidas em `/static`, e o próprio fluxo pós-geração (`Viewer3D` + `BambuColorPicker` + botão de download, idêntico em todos os modelos hoje) — já existe e é reaproveitado. O canvas 2D cuida só de composição/layout (posição, tamanho, rotação, agrupamento em partes); altura e cor/extrusora por parte são parâmetros "físicos" que ficam num painel lateral sempre visível (pré-preenchido com defaults), na mesma coluna de parâmetros que hoje existe em `ChaveiroSimplesSvg.tsx` — não escondido atrás de um clique. Clicar "Gerar 3D" dispara a mesma chamada que gera o `.3mf` no backend; só o mesh do `Viewer3D` e o botão de exportar ficam condicionados à resposta (igual ao `tmfUrl &&` que já existe em todos os modelos).

**Alternativas consideradas:**
- **Fabric.js** em vez de Konva: tem `toSVG()`/`loadSVGFromString()` nativos, mas é imperativo e não se integra idiomaticamente ao React já usado em todo o projeto. Konva + react-konva venceu pelo encaixe direto com a stack atual e por `Layer`/`Transformer` já modelarem o conceito de camadas que o editor precisa.
- **Offset calculado no OpenSCAD (`offset()`) na geração**, como `chaveiro_simples` faz hoje: rejeitado. O objetivo explícito deste editor é que o motor 3D seja "burro" (só extrude o que recebe) e que toda decisão visual — incluindo o contorno — seja um objeto de camada visível e editável no 2D, igual a um filtro de "glow" num editor de imagens comum, não um efeito colateral invisível calculado no backend no momento da geração.
- **Motor 100% dinâmico** (gerar `config.json`+`model.scad` por request, ou passar um array `-D` de partes de tamanho variável): rejeitado para v1. `bambu_parts_config.json` é lido como arquivo estático por modelo (`_pack_bambu_3mf`) — não há hoje um caminho para registrar partes nomeadas livremente em tempo de request, e o `-D` do OpenSCAD nunca foi testado neste código com arrays aninhados mistos (string+número). 4 slots fixos resolve os dois problemas reaproveitando exatamente o padrão estático já usado por todos os outros modelos.

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Editor vive em "Testes & Ferramentas" na Home, não substitui nenhum modelo existente | Reduz risco de regressão; permite validar a ideia isoladamente antes de generalizar modelos já em produção |
| 2 | Base de canvas: Konva + react-konva | Encaixe nativo no React do projeto; `Transformer`/`Layer` já modelam drag/resize/rotate e camadas |
| 3 | Texto → vetor via opentype.js, client-side | Gera path a partir da fonte já bundled sem depender do OpenSCAD lidar com glifos; texto vira "só mais uma camada" |
| 4 | Cálculo de silhueta/contorno acontece **no editor, client-side**, via lib de offset poligonal (ex.: Clipper), e produz uma camada com geometria real (não um parâmetro `-D` interpretado depois) — o `model.scad` de `editor_generico` nunca chama `offset()` | O motor 3D deve ser "burro": só sabe extrudir o que recebe. Toda decisão visual (incluindo contorno) fica visível e editável como camada no 2D, igual a um filtro de glow num editor de imagens — não um efeito invisível calculado no backend na hora da geração |
| 5 | v1 usa um modelo backend fixo (`editor_generico`) com **4 slots de parte pré-registrados** (`part_1`..`part_4`), cada um com **apenas 2 variáveis escalares** via `-D` (`partN_svg`, `partN_height` — sem `partN_offset_mm`, já que o contorno vem pronto no SVG) mais `partN_active`, e cores roteadas pelo `extruder_overrides` já existente — não um array dinâmico nem geração de `config.json`/`.scad` por request. Slots com `partN_active=false` são **removidos de `parts_to_render` antes de chamar `_pack_bambu_3mf`** no handler do request, seguindo exatamente o padrão já usado para `verso_enable` em `generator.py` (linha ~1670: `if verso_enable == false: parts_to_render.remove("verso")`) — nunca é exportado STL vazio/degenerado para um slot inativo | `bambu_parts_config.json` só é lido como arquivo estático por modelo hoje (`_pack_bambu_3mf`); não há suporte a partes nomeadas livremente por request. 4 slots fixos reaproveita esse padrão estático e evita depender de um array `-D` misto (string+número) nunca testado neste código. Teto de 4 também casa com o limite prático de extrusoras Bambu (Risco #3). O filtro de `parts_to_render` reaproveita um mecanismo já existente e comprovado (`verso_enable`) para exatamente o mesmo problema — slot/parte opcional que não deve virar STL vazio no `.3mf` |
| 6 | Fontes: opentype.js busca o `.ttf` via HTTP do diretório já servido em `/static` (`backend/static/fonts/`, montado em `backend/app/main.py`), como `fetch(url).then(r=>r.arrayBuffer())` → `opentype.parse()`; OpenSCAD continua resolvendo a mesma fonte via `OPENSCAD_FONT_PATH`/`font_name` (fontconfig), sem depender de `use <arquivo.ttf>` literal | Esse diretório compartilhado **já existe** (é o que `chaveiro_simples` e a maioria dos modelos de texto já usam) — não é trabalho novo, só reuso explícito. Evita divergência entre a fonte mostrada no editor e a usada na geração final |
| 7 | Altura e cor/extrusora por parte **não** são propriedades do canvas 2D — vivem num painel lateral **sempre visível** (pré-preenchido com valores padrão), igual à `<aside>` de parâmetros de `ChaveiroSimplesSvg.tsx`. O que é gated em "Gerar 3D" é só o mesh no `Viewer3D` e o botão de exportar — reaproveitando literalmente esse comportamento, não um painel que aparece só depois do clique | Consistência de UX com o resto do produto — usuário já conhece esse fluxo (ajustar valor → gerar → exportar) de qualquer outro modelo. Mantém o canvas 2D focado só em composição/layout, sem misturar parâmetros físicos de impressão com a ferramenta visual |

## Risks & Assumptions

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| 1 | O que o usuário vê no canvas é a geometria final (não mais uma prévia aproximada) — qualquer imprecisão no cálculo de silhueta do editor vai direto pro `.3mf`, sem um "safety net" de recálculo no backend | Medium | Cobrir a lib de offset escolhida (Clipper) com casos de teste visuais antes de liberar; como o backend só extrude o que recebe, um bug de geometria é 100% responsabilidade do editor — não há mais dupla verificação |
| 2 | Fonte usada pelo editor (opentype.js) diverge da usada pelo OpenSCAD na geração final | Low | Ambos os lados consomem a mesma fonte de `backend/static/fonts/` (Decisão 6) — risco residual só se o arquivo for atualizado num lado e não no outro |
| 3 | Impressoras Bambu multicolor geralmente suportam até 4 extrusores; usuário pode tentar atribuir mais partes do que extrusoras disponíveis | Medium | UI limita a 4 partes (Decisão 5) — já reflete o teto físico, não é só um aviso |
| 4 | Libs de offset poligonal (ex.: Clipper) só entendem segmentos de reta, não curvas bezier — glifos via opentype.js e imagens via potrace são sempre curvas. Achatar (flatten) é precondição estrutural obrigatória para **todo** path antes do offset, não só uma otimização para paths complexos; e mesmo achatado, paths não curados/densos podem travar/demorar no browser — mesma classe de problema que o `offset()` do OpenSCAD já teve em `cortador_bolacha` (timeouts em geometria complexa), agora deslocado pro cliente | High | Reaproveitar o mesmo pré-processamento de simplify/flatten já usado em `svgProcessor.ts` (via paper.js, mantido só como utilitário headless de geometria, não como canvas interativo) em **todo** path antes de rodar a lib de offset — obrigatório para viabilizar o offset, e também reduz contagem de vértices/curvas antes da operação pesada |
| 5 | Konva, react-konva, opentype.js e uma lib de offset poligonal (ex.: Clipper/clipper-lib) são dependências novas (nenhuma presente em `frontend/package.json` hoje); opentype.js e Clipper não têm tipos TS oficiais garantidos | Medium | Medir impacto no bundle size; tipar manualmente ou usar pacotes de tipos da comunidade como parte do setup inicial |

## Success Criteria

- [ ] Usuário consegue adicionar uma camada de texto (fonte/tamanho configuráveis) e mover/redimensionar/rotacionar no canvas
- [ ] Usuário consegue duplicar essa camada e aplicar "silhueta/contorno", gerando uma nova camada com geometria expandida real (calculada no browser)
- [ ] Usuário consegue adicionar uma camada de imagem (upload PNG ou SVG)
- [ ] Usuário consegue agrupar camadas em partes no canvas (ex: texto+silhueta numa parte, imagem noutra); ao agrupar, o painel lateral de altura/cor por parte já aparece com valores padrão, sem precisar clicar em nada
- [ ] Clicar "Gerar 3D" renderiza o mesh atualizado no `Viewer3D`, usando os valores (padrão ou ajustados) do painel lateral — igual ao fluxo de qualquer outro modelo
- [ ] Ajustar altura/cor de uma parte no painel e clicar "Gerar" novamente atualiza o preview 3D
- [ ] Botão "Exportar 3MF" (visível quando a resposta da geração inclui a URL do `.3mf`) produz um arquivo válido que abre no Bambu Studio com as partes atribuídas aos extrusores corretos

## Next Step

Run `/wish` to convert this design into an executable plan.
