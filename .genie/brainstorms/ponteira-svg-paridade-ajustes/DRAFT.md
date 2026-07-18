# Brainstorm: ponteira-svg-paridade-ajustes

## WRS: 100/100
Problem ✅ | Scope ✅ | Decisions ✅ | Risks ✅ | Criteria ✅

## Problem
`ponteira_lapis_svg` já tem, no `config.json`, os parâmetros de espessura da base, espessura da imagem, margem, diâmetro e orientação do furo — mas `PonteiraLapisSvg.tsx` nunca lê `config.sections`, só o array `parameters` (vazio), então nenhum desses controles aparece na UI e o usuário fica preso nos valores hardcoded do `model.scad`.

## Investigação
- `models/ponteira_lapis_texto/config.json`: seções "Ajustes Finos" (`letter_height`=1.2, `base_height`=12, `outline_margin`=2.3, spacing etc.) e "Furação" (`hole_orientation` default `FRONTBACK`, `hole_type`, `hole_diameter`=7.6).
- `models/ponteira_lapis_svg/config.json`: mesmas seções já existem (`letter_height`=1.2, `base_height`=10, `outline_margin`=2.6, `hole_diameter`=7.5, `hole_orientation` default `FRONTBACK` mas opções em ordem diferente) — porém `frontend/src/pages/PonteiraLapisSvg.tsx` só itera `modelConfig?.parameters` (vazio) e nunca `modelConfig?.sections`. As seções existem no config só "mortas".
- `PonteiraLapisTexto.tsx` já tem o padrão de accordion (`renderAccordionSection` + `renderParam`) que soluciona exatamente isso.
- "Posição do furo (vertical, horizontal)" = o próprio `hole_orientation` (select TOPBOTTOM/FRONTBACK), não um novo par hole_x/hole_y — a UI de texto já rotula as opções exatamente como "Horizontal (Passante)" / "Vertical (Chaveiro/Topper)".
- Não existe hoje nenhum modelo com um slider explícito de "espessura de parede" (grep em `models/**/config.json` só achou "parede" em textos descritivos de `cortador_bolacha`, não como parâmetro dedicado) — a nota do usuário sobre "paredes" é para a memória/glossário, não uma correção de código existente.

## Scope

### IN
- `PonteiraLapisSvg.tsx`: renderizar as seções "Ajustes Finos" e "Furação" do config (accordion, mesmo padrão visual/comportamental de `PonteiraLapisTexto.tsx`), incluindo os defaults dessas seções em `dynamicParams` (hoje só semeado a partir de `parameters` top-level).
- Igualar defaults compartilhados de `ponteira_lapis_svg` aos de `ponteira_lapis_texto`: `base_height` 10→12, `outline_margin` 2.6→2.3, `hole_diameter` 7.5→7.6, ordem das opções de `hole_orientation` igual à do texto.
- Mudar o default de `letter_height` (espessura da arte/letra) de 1.2 → 0.8mm em **ambos** os `config.json` (texto e svg), e sincronizar o valor no comentário/default do `model.scad` de cada um.
- Renomear no `config.json` de `ponteira_lapis_texto` os labels do eixo Z hoje chamados de "Altura" para "Espessura" (`letter_height`: "Altura da letra" → "Espessura da letra"; `base_height`: "Altura da base" → "Espessura da base"), alinhando com o padrão que `ponteira_lapis_svg` já usa.
- Memória de projeto: documentar a convenção largura=X, altura=Y, espessura=Z, incluindo a ressalva de que "paredes" (espessura de parede, ex. em cortadores) também pertence à família "espessura" mesmo quando é um offset no plano XY e não uma altura de extrusão.

### OUT
- Renomear/normalizar terminologia em outros modelos do repositório agora (fica só documentado na memória para uso futuro).
- Novos controles de posição X/Y do furo (`hole_x`/`hole_y`) — não pedido, "posição" = orientação.
- Trocar o color picker simples do SVG por `BambuColorPicker` com seleção de extrusora (não pedido).
- Extrair um componente compartilhado de renderização de parâmetros entre as duas páginas (duplicação pontual aceita para isolar risco).

## Decisions
| # | Decisão | Racional |
|---|----------|-----------|
| 1 | "Posição do furo" = `hole_orientation` (select existente) | O parênteses "(vertical, horizontal)" bate exatamente com os labels já usados em `hole_orientation` no texto |
| 2 | Não renomear o `id` dos parâmetros SCAD (`letter_height`, `base_height`), só o `name` exibido | Renomear `id` obrigaria alterar variável no `model.scad` e quebra sem ganho — o pedido é sobre terminologia visível ao usuário |
| 3 | Normalização de termos = memória de projeto + fix pontual nos 2 labels problemáticos do texto | Full rename cross-repo é escopo maior e não foi pedido; usuário disse explicitamente "coloque na memória global do projeto" |
| 4 | SVG ganha código de accordion próprio (não reaproveita componente do texto) | Baixo risco, YAGNI — extrair abstração agora seria prematuro para 2 usos |

## Risks & Assumptions
| # | Risco | Severidade | Mitigação |
|---|------|----------|------------|
| 1 | 3MFs em cache com defaults antigos não mudam retroativamente | Baixa | Comportamento esperado (cache é por hash de parâmetros) |
| 2 | Default literal no `model.scad` só importa para preview manual fora da API | Baixa | Sincronizar mesmo assim por higiene, mas não é bloqueante |
| 3 | Trocar `outline_margin`/`base_height` padrão do SVG muda a aparência de peças já testadas visualmente pelo usuário | Média | Comunicar a mudança de default explicitamente no resumo final |

## Success Criteria
- [ ] `ponteira_lapis_svg/config.json` e `ponteira_lapis_texto/config.json`: `letter_height.default == 0.8`
- [ ] `ponteira_lapis_svg/config.json`: `base_height.default == 12`, `outline_margin.default == 2.3`, `hole_diameter.default == 7.6`
- [ ] `PonteiraLapisSvg.tsx` renderiza sliders de espessura da base, espessura da arte, margem do contorno, e selects de orientação/formato do furo + slider de diâmetro — todos afetando o FormData enviado a `/api/generate/ponteira_lapis_svg`
- [ ] `ponteira_lapis_texto/config.json`: labels "Espessura da letra" / "Espessura da base" substituindo "Altura da letra" / "Altura da base"
- [ ] Teste manual via stack dev: gerar peça SVG variando espessura/diâmetro/orientação do furo e confirmar reflexo no 3MF
- [ ] Memória de projeto criada com a convenção largura/altura/espessura (X/Y/Z) e a ressalva sobre "paredes"
