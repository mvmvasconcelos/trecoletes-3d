# DRAFT — Editor 2D em Camadas → Geração 3D

## Contexto já mapeado (código existente)

- **Pipeline SVG→3D já existe**: `frontend/src/svgProcessor.ts` (paper.js) normaliza/engrossa/extrai silhueta de SVG; `backend/app/api/_svg_normalize.py` normaliza coordenadas; modelos como `cortador_bolacha` fazem `resize()` + `linear_extrude()` no OpenSCAD a partir de SVGs injetados (`svg_linhas_path`, `svg_silhueta_path`).
- **PNG→SVG já existe**: endpoint `POST /api/convert/png-to-svg` via potrace.
- **Multi-cor/Bambu já existe**: sistema de `part` dispatcher no `.scad` + `bambu_template/bambu_parts_config.json` mapeia cada parte a um extrusor/cor.
- **O que NÃO existe**: edição interativa (clicar/arrastar/redimensionar/rotacionar), conceito de camadas, ferramenta de texto no canvas, texto-para-path vetorial.
- **Texto hoje é um caminho separado**: `chaveiro_simples` (e similares) calculam posição de glifo por caractere no backend e injetam em `text()` nativo do OpenSCAD — por isso só suporta 2 linhas hardcoded, sem generalização de N linhas/camadas.
- **Peça técnica que falta**: texto→contorno vetorial no browser. Abordagem padrão: **opentype.js** (extrai path SVG de qualquer fonte carregada, roda 100% client-side, sem depender do OpenSCAD lidar com glifos). Depois disso, texto vira "mais uma camada de path SVG", igual a uma imagem importada.

## WRS
```
WRS: ██████████ 100/100
 Problem ✅ | Scope ✅ | Decisions ✅ | Risks ✅ | Criteria ✅
```

## Problem
A geração de modelos com texto/arte é hardcoded por modelo no OpenSCAD (ex: chaveiro_simples só suporta 2 linhas fixas de texto, cada uma com fonte/tamanho codados manualmente). Adicionar flexibilidade (mais linhas, combinar texto+imagem, reordenar elementos) hoje exige mudar código Python/SCAD por modelo. Queremos um editor 2D visual e genérico (canvas com camadas: imagem e texto, arrastar/redimensionar/rotacionar) que gera camadas vetoriais agrupadas em "partes" (altura + cor) e aciona um pipeline de extrusão 3D generalizado.

## Scope

### IN
- Nova página "Editor 2D" no frontend, listada em Home.tsx na seção "Testes & Ferramentas"
- Canvas interativo com Konva + react-konva: adicionar, mover, redimensionar, rotacionar camadas
- Camada de texto: qualquer fonte já bundled no projeto, convertida para path vetorial via opentype.js (client-side)
- Camada de imagem: upload de SVG/PNG (reaproveita `POST /api/convert/png-to-svg` já existente)
- Ferramenta "duplicar + aplicar silhueta/contorno": duplica uma camada e gera uma nova camada com geometria expandida real — cálculo acontece **no browser** (lib de offset poligonal, ex.: Clipper), igual a um filtro de glow a 0% de transparência num editor de imagens. O motor 3D nunca chama `offset()` — só extrude o que recebe. **(Correção pós-review: decisão original era calcular o offset no OpenSCAD; usuário pediu inversão — offset é responsabilidade do 2D, motor 3D só extrude.)**
- Painel de camadas com agrupamento: usuário atribui camadas a "partes" (cada parte = 1 altura de extrusão + 1 cor/extrusora), até 4 partes fixas (`part_1`..`part_4`, não mais fixo em `base`/`letters`)
- Backend: novo modelo genérico (`models/editor_generico/`) com 4 slots de parte pré-registrados no `bambu_template/bambu_parts_config.json` (padrão estático já usado por todos os modelos); cada slot recebe variáveis escalares próprias via `-D` (`partN_svg`, `partN_height`, `partN_offset_mm`, `partN_active`), cor roteada via `extruder_overrides` já existente — não um array dinâmico (o `-D` do OpenSCAD nunca foi testado com arrays mistos string+número neste código, e `bambu_parts_config.json` só é lido como arquivo estático por modelo)
- Fluxo: montar no editor → "Gerar 3D" → escolher altura/cor por parte → download `.3mf`

### OUT (v1)
- Furo de argola / recursos específicos de chaveiro (fica para iteração futura)
- Substituir modelos existentes (chaveiro_simples, cortador_bolacha, etc.) — o editor é uma ferramenta nova e paralela, não uma migração
- Seleção de "modelo alvo" com parâmetros específicos por modelo (ex: posição de argola) — mencionado pelo usuário como visão futura, não neste incremento
- Histórico de undo/redo, templates salvos/reutilizáveis, suporte touch/mobile
- Efeitos avançados estilo Canva (sombras, gradientes, filtros)

## Decisions
1. **Localização**: nova ferramenta em "Testes & Ferramentas" na Home, não substitui nenhum modelo existente.
2. **Lib de canvas**: Konva + react-konva — encaixe nativo no React já usado no projeto; `Transformer` e `Layer` do Konva batem com o conceito de camadas do editor.
3. **Texto → vetor**: opentype.js roda no browser, gera path a partir da fonte já bundled — mesmo texto pode virar camada normal (igual a uma imagem importada).
4. **Offset/contorno**: a operação "duplicar + offset" marca a camada, mas o cálculo geométrico real do offset acontece no OpenSCAD (`offset()`) no momento da geração — não em JS no browser. Reaproveita o comportamento já validado em `chaveiro_simples` (`offset(r = outline_margin) base_2d()`), evita adicionar uma lib de geometria pesada (ex.: Clipper) só para isso, e mantém preview vs. resultado final consistentes com o padrão atual do projeto.
5. **Engine de geração**: v1 usa um único modelo genérico novo (`models/editor_generico/`) com **4 slots de parte fixos e pré-registrados** (`part_1`..`part_4`), cada um com variáveis escalares próprias via `-D`, em vez de array dinâmico ou geração de `config.json`/`model.scad` por request. Mantém compatibilidade com a arquitetura atual (modelo = pasta + `bambu_parts_config.json` estático) e evita depender de um array `-D` misto (string+número) nunca testado no código.
6. **Fontes**: opentype.js busca o `.ttf` via HTTP do diretório já servido em `/static` (`backend/static/fonts/`, montado em `backend/app/main.py`) — esse diretório compartilhado **já existe** (é o que `chaveiro_simples` e a maioria dos modelos de texto já usam), não é trabalho novo. OpenSCAD continua resolvendo a mesma fonte via `OPENSCAD_FONT_PATH`/`font_name`.

## Risks
1. **Fidelidade do preview de offset**: o preview no canvas (se houver) é aproximado; o resultado real só é conhecido após gerar no backend. Mitigação: deixar claro na UI que é uma prévia, igual ao preview 2D que já existe hoje noutros modelos.
2. **Fontes divergentes**: risco residual baixo já que ambos os lados consomem o mesmo diretório `/static` (Decisão 6) — só diverge se o arquivo for atualizado num lado e não no outro.
3. **Limite de partes/extrusoras**: impressoras Bambu multicolor geralmente suportam até 4 extrusores. Mitigação: teto de 4 partes já embutido na Decisão 5, não é só um aviso de UI.
4. **Timeout do `offset()` em geometria não curada**: `cortador_bolacha` já enfrentou timeouts (~300s) com SVGs importados complexos, mitigados com `simplify(25)`/`flatten(8)` no `svgProcessor.ts`. Composições livres do editor (texto opentype.js + imagens potrace) são menos curadas que os SVGs de hoje. Mitigação: reaproveitar o mesmo pré-processamento de simplify/flatten antes de exportar qualquer path do editor.
5. **Dependências novas**: Konva, react-konva e opentype.js não estão em `frontend/package.json` hoje; opentype.js não tem tipos TS oficiais. Mitigação: medir impacto no bundle e tipar manualmente como parte do setup inicial.

## Criteria
- [ ] Usuário consegue adicionar uma camada de texto (fonte/tamanho configuráveis), mover/redimensionar/rotacionar no canvas
- [ ] Usuário consegue duplicar essa camada e marcá-la como "offset" (contorno)
- [ ] Usuário consegue adicionar uma camada de imagem (upload PNG ou SVG)
- [ ] Usuário consegue agrupar as camadas em partes (ex: texto+offset numa parte, imagem noutra), cada parte com altura e cor independentes
- [ ] Clicar "Gerar 3D" produz um `.3mf` válido que abre no Bambu Studio com as partes atribuídas aos extrusores corretos

## Approach
Editor 2D genérico (Konva) desacoplado dos modelos existentes, com um novo backend/model (`editor_generico`) que generaliza o dispatcher de partes fixo (`base`/`letters`) para uma lista dinâmica de N partes. Reaproveita ao máximo o pipeline já existente (PNG→SVG via potrace, normalização de SVG, `offset()` nativo do OpenSCAD, sistema de extrusor por parte do Bambu template) — a peça nova é a UI de edição interativa (Konva) e a conversão texto→path (opentype.js) no browser.

Alternativa considerada: gerar `config.json` + `model.scad` dinamicamente por request (motor 100% genérico, sem modelo fixo no catálogo). Rejeitada para v1 por complexidade desproporcional — foge do padrão atual de "modelo = pasta com config.json + scad" e dificulta debug/manutenção; pode ser revisitado depois se o editor precisar suportar geometrias muito mais livres.
