# Design: Paridade de ajustes finos entre ponteira-svg e ponteira-texto

| Field | Value |
|-------|-------|
| **Slug** | `ponteira-svg-paridade-ajustes` |
| **Date** | 2026-07-18 |
| **WRS** | 100/100 |

## Problem

`ponteira_lapis_svg` já define no `config.json` os parâmetros de espessura da base, espessura da imagem, margem, diâmetro e orientação do furo, mas `PonteiraLapisSvg.tsx` nunca lê `config.sections` (só o array `parameters`, que está vazio nesse modelo) — então nenhum desses controles chega à UI, e o usuário fica preso nos defaults hardcoded do `model.scad`, sem paridade com a experiência de `ponteira_lapis_texto`.

## Scope

### IN
- `PonteiraLapisSvg.tsx`: renderizar as seções "Ajustes Finos" (espessura da base, espessura da imagem, margem do contorno) e "Furação" (orientação, formato, diâmetro do furo) via accordion, no mesmo padrão visual/comportamental de `PonteiraLapisTexto.tsx`, incluindo a seed desses defaults em `dynamicParams` no load da config.
- Igualar defaults compartilhados de `ponteira_lapis_svg/config.json` aos de `ponteira_lapis_texto/config.json`: `base_height` 10→12, `outline_margin` 2.6→2.3, mesma ordem de opções em `hole_orientation` (Horizontal primeiro). `hole_diameter` já é 7.6 em ambos os `config.json` — não precisa mudar aqui.
- Mudar o default de `letter_height` (espessura da arte/letra) de 1.2mm → 0.8mm em **ambos** `models/ponteira_lapis_texto/config.json` e `models/ponteira_lapis_svg/config.json`.
- Sincronizar os valores hardcoded de cada `model.scad` com os novos defaults do `config.json` correspondente (higiene, já que o backend sempre sobrescreve via `-D` — mas os arquivos hoje estão desalinhados): `ponteira_lapis_texto/model.scad` tem `letter_height=1.4` (deve virar `0.8`); `ponteira_lapis_svg/model.scad` tem `letter_height=1.2`, `base_height=10`, `outline_margin=2.6`, `hole_diameter=7.5` (devem virar `0.8`, `12`, `2.3`, `7.6`, respectivamente).
- Renomear em `models/ponteira_lapis_texto/config.json` os labels do eixo Z hoje chamados "Altura" para "Espessura": `letter_height.name`: "Altura da letra" → "Espessura da letra"; `base_height.name`: "Altura da base" → "Espessura da base" (alinhando com o padrão que `ponteira_lapis_svg` já usa).
- Memória de projeto (auto-memory) documentando a convenção: largura = eixo X, altura = eixo Y, espessura = eixo Z — incluindo a ressalva de que "espessura de parede" (ex. cortadores) também pertence à família "espessura" mesmo sendo um offset no plano XY, não uma altura de extrusão.

### OUT
- Renomear/normalizar terminologia em outros modelos do repositório agora — fica documentado na memória para uso futuro, sem rename retroativo em massa.
- Novos controles de posição X/Y do furo (`hole_x`/`hole_y`) — "posição do furo (vertical, horizontal)" já é coberto pelo `hole_orientation` existente.
- Trocar o color picker simples do SVG por `BambuColorPicker` com seleção de extrusora.
- Extrair um componente compartilhado de renderização de parâmetros entre as duas páginas — duplicação pontual aceita para manter isolamento e baixo risco.
- Alterar `id` (nome de variável SCAD) de qualquer parâmetro — só os `name` (labels exibidos) mudam.

## Approach

Duas frentes independentes e de baixo acoplamento:

1. **Frontend (SVG)**: adaptar o padrão de accordion já usado em `PonteiraLapisTexto.tsx` (`renderAccordionSection` + `renderParam` para `range`/`select`) diretamente em `PonteiraLapisSvg.tsx`, iterando `modelConfig.sections` (exceto "Cores", que continua com os color pickers custom existentes). Os defaults dessas seções passam a ser semeados em `dynamicParams` junto com os defaults de `parameters` no `useEffect` de carga de config — replicando o helper `setDefaults` de `PonteiraLapisTexto.tsx`. O renderer inline atual da SVG (linhas 242-259) só trata `boolean`/`range` — precisa ganhar um branch `select` (copiado do `case 'select'` de `PonteiraLapisTexto.tsx`, sem os desvios especiais de `font_name`) para cobrir `hole_orientation`/`hole_type`.

   Alternativas consideradas:
   - *Extrair componente compartilhado* `ParamSection`/`renderParam` entre as duas páginas: rejeitado por ora (YAGNI) — duas páginas não justificam abstração ainda, e cada uma tem nuances (texto tem `FontPicker`/`BambuColorPicker` que a SVG não usa). Fica como candidato natural se um terceiro modelo precisar do mesmo padrão.
   - *Reescrever o config.json da SVG do zero*: rejeitado — o config já está estruturalmente correto, só falta o frontend consumi-lo.

2. **Config/defaults**: edição direta dos `config.json` e `model.scad` dos dois modelos — mudança de valores numéricos e de `name` (labels), sem alterar `id`/variáveis SCAD, minimizando risco de quebra.

3. **Memória**: novo arquivo de memória tipo `project` documentando a convenção de eixos, referenciável por `[[ponteira-svg-paridade-ajustes]]` em trabalhos futuros que tocarem parâmetros dimensionais de qualquer modelo.

## Decisions

| # | Decisão | Rationale |
|---|----------|-----------|
| 1 | "Posição do furo" = `hole_orientation` (select já existente, não um par hole_x/hole_y novo) | O parênteses "(vertical, horizontal)" do pedido bate exatamente com os labels já usados nas opções de `hole_orientation` no modelo texto |
| 2 | Não renomear `id` dos parâmetros SCAD, só o `name` exibido na UI | Renomear `id` obrigaria tocar `model.scad` e o backend genérico de `-D`, sem ganho — o pedido é sobre terminologia visível ao usuário |
| 3 | Normalização de termos = memória de projeto + fix pontual nos 2 labels problemáticos do texto, sem rename cross-repo agora | Full rename em todos os modelos é escopo maior, não pedido; usuário pediu explicitamente para "colocar na memória global do projeto" |
| 4 | SVG ganha lógica de accordion própria (duplicada), sem extrair componente compartilhado com o texto | Baixo risco, evita acoplar duas páginas com nuances distintas (FontPicker, BambuColorPicker) por uma abstração prematura |
| 5 | `base_height`, `outline_margin`, `hole_diameter` do SVG passam a copiar os valores do texto | Pedido explícito: "Utilize os valores padrões que já estão no ponteira-texto" |

## Risks & Assumptions

| # | Risco | Severidade | Mitigação |
|---|------|----------|------------|
| 1 | 3MFs em cache com defaults antigos não refletem a mudança retroativamente | Baixa | Comportamento esperado — cache é por hash de parâmetros, não precisa de ação |
| 2 | Default hardcoded no `model.scad` só importa para preview manual fora da API (backend sempre injeta `-D` a partir do config) | Baixa | Sincronizar mesmo assim por higiene/consistência, não bloqueia a entrega |
| 3 | Trocar `outline_margin`/`base_height` padrão do SVG (10→12, 2.6→2.3) muda a aparência de peças já testadas visualmente pelo usuário | Média | Reportar a mudança de default explicitamente no resumo final da execução |
| 4 | Assumir que "posição do furo" = orientação (não x/y) pode estar errado | Baixa | Documentado como Decisão #1 com o racional; fácil de corrigir depois caso o usuário aponte diferença ao revisar |

## Success Criteria

- [ ] `models/ponteira_lapis_svg/config.json` e `models/ponteira_lapis_texto/config.json`: `letter_height.default == 0.8`
- [ ] `models/ponteira_lapis_svg/config.json`: `base_height.default == 12`, `outline_margin.default == 2.3`, `hole_diameter.default == 7.6`
- [ ] `PonteiraLapisSvg.tsx` renderiza sliders de espessura da base, espessura da arte, margem do contorno, e selects de orientação/formato do furo + slider de diâmetro do furo — todos refletidos no `FormData` enviado a `/api/generate/ponteira_lapis_svg`
- [ ] `models/ponteira_lapis_texto/config.json`: labels "Espessura da letra" / "Espessura da base" substituem "Altura da letra" / "Altura da base"
- [ ] `models/ponteira_lapis_texto/model.scad`: `letter_height` hardcoded == 0.8; `models/ponteira_lapis_svg/model.scad`: `letter_height`, `base_height`, `outline_margin`, `hole_diameter` hardcoded == 0.8, 12, 2.3, 7.6 respectivamente
- [ ] Teste manual via stack dev (containers, nunca tooling direto no host): gerar peça SVG variando espessura da base/arte, diâmetro e orientação do furo, e confirmar reflexo visual no 3MF gerado
- [ ] Memória de projeto criada documentando a convenção largura=X / altura=Y / espessura=Z, incluindo a ressalva sobre "espessura de parede", e indexada em `MEMORY.md`

## Next Step

Run `/wish` to convert this design into an executable plan.
