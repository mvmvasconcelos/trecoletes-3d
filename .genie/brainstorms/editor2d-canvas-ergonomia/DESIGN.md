# Design: Editor 2D — Ergonomia do canvas

| Field | Value |
|-------|-------|
| **Slug** | `editor2d-canvas-ergonomia` |
| **Date** | 2026-07-13 |
| **WRS** | 100/100 |

## Problem

O canvas do Editor 2D não dá noção do espaço de impressão real, não mostra dimensões dos objetos,
renderiza tudo em preto (difícil diferenciar camadas/partes), só permite mover uma camada por vez
na lista, só seleciona um objeto por vez, e não tem atalho de teclado pra excluir — juntos, esses
gaps tornam a edição de composições com várias camadas/partes lenta e propensa a erro.

## Scope

### IN
1. Lista de camadas (`LayerPanel.tsx`): drag-and-drop pra reordenar — a ordem da lista já
   determina a ordem de renderização (z-index) no canvas, então reordenar a lista reordena
   visualmente sem lógica extra de camada.
2. Guia visual de 256×256mm (retângulo pontilhado, representando a mesa A1) sempre visível no
   canvas — puramente decorativo/informativo, nunca bloqueia posicionar ou redimensionar. Mesma
   convenção "1 unidade = 1mm" da entrega 3. Esperado (não é bug): como o `IMPORT_FIT_RATIO`
   (`Editor2D.tsx:38`) escala novos imports pra ~60% da dimensão do Stage em pixels — tipicamente
   bem maior que 256 numa janela normal — a maioria das camadas recém-importadas já nasce maior
   que a guia. Isso é aceitável porque a guia nunca bloqueia (decisão 1); é só um lembrete visual.
3. HUD de dimensões: ao selecionar um objeto (só quando exatamente 1 está selecionado — ver
   Approach), mostra largura×altura em mm (canto inferior esquerdo); ao arrastar uma âncora do
   `Transformer`, os números atualizam em tempo real durante o gesto. Usa a convenção "1 unidade
   do canvas = 1mm" já estabelecida no app (`lib/serializePartToSvg.ts`, seção "Editor units vs.
   real-world millimeters") — sem novo fator de conversão.
4. Cor da parte refletida no preenchimento das formas no canvas: uma camada atribuída a uma parte
   renderiza com a cor já configurada para aquela parte (`PartSettingsMap`, painel direito),
   sobrescrevendo o(s) `fill` original(is) de suas shapes; camada sem parte mantém o
   preenchimento atual de cada shape (preto para texto — `textToPath.ts`'s `TEXT_FILL_COLOR`;
   cores originais preservadas por shape para imagem/SVG importado — `svgImport.ts:47-51`).
5. Seleção múltipla via shift+clique (adiciona/remove da seleção) e marquee (arrastar numa área
   vazia do canvas seleciona tudo que intersecta o retângulo); toolbar de alinhamento (horizontal
   esquerda/centro/direita/distribuído; vertical topo/centro/baixo/distribuído) ativa com 2+
   objetos selecionados, operando sobre o bounding box axis-aligned de cada objeto.
6. Atalho de teclado DEL/Backspace: exclui a(s) camada(s) selecionada(s) (sem histórico de
   desfazer — ver OUT).

### OUT
- Desfazer/Refazer (Ctrl+Z/Ctrl+Y) — feature bem maior (exige histórico de estado de todo o
  editor: camadas, transformações, texto, partes), tratada como brainstorm próprio no futuro.
- Limite rígido de canvas (clamp de posição/tamanho pra dentro de 256×256mm) — decisão explícita
  por só referência visual, não bloqueio.
- Cor independente por camada, desacoplada da parte — reusa a cor que já existe no `PartSettingsMap`
  em vez de introduzir um novo conceito de dado.
- Reordenar camadas por qualquer meio além de drag-and-drop (ex: botões "mover pro topo/fundo").
- Alinhamento por bounding box rotacionado — sempre axis-aligned, mesmo para objetos girados.

## Approach

Seis entregas relativamente independentes dentro do mesmo cluster de componentes
(`EditorCanvas.tsx`, `LayerPanel.tsx`, `Editor2D.tsx`) — sem mudança de arquitetura, sem tocar
backend. Cada uma vira seu próprio grupo de execução no `/wish` (padrão já usado no wish original
de 7 grupos), permitindo implementar e revisar cada uma isoladamente:
- Reorder de camadas: `layers` já é um array — só precisa de drag handlers no `LayerPanel.tsx`
  reordenando esse array via `setLayers`; o canvas já respeita a ordem do array pro z-index.
- Guia 256×256mm: um `<Rect>` Konva extra, não-interativo (`listening={false}`), desenhado no
  centro do Stage.
- HUD de dimensões: deriva de `selectedLayer.transform` (width/height × scaleX/scaleY já
  disponíveis) mais o tamanho reportado ao vivo pelos callbacks `onTransform`/`onTransformEnd` já
  existentes no `Transformer`.
- Cor por parte: passa `partSettings` (ou só o mapa `partId → color`) como prop nova pra
  `EditorCanvas`, resolve a cor no lugar do `fill` fixo de cada `<Path>`.
- Seleção múltipla + alinhamento: estende `selectedId: string | null` pra
  `selectedIds: string[]`, adiciona shift+clique e marquee-select no `Stage` (novos handlers
  `onMouseMove`/`onMouseUp` — hoje o `Stage` só tem `onMouseDown`, `EditorCanvas.tsx:36-39` —
  clique simples segue deselecionando no `onMouseDown` como hoje; um limiar de arrasto >4px
  detectado até o `onMouseUp` decide se virou marquee, sem mudar o comportamento de clique
  simples). Shift+clique e marquee compõem: marquee sempre ADICIONA à seleção atual, nunca
  substitui — assim shift+clique + marquee-drag combinam livremente. `Transformer.nodes()` recebe
  múltiplos nodes (suportado nativamente pelo Konva), toolbar de alinhamento calcula bounds e
  reposiciona. Essa mudança tem efeito cascata em todo consumidor hoje escrito pra um único
  `selectedId`/`selectedLayer` — ver lista abaixo, nenhum é deixado implícito:
  - `LayerPanel.tsx:39` (`isSelected = layer.id === selectedId`) → vira checagem de
    pertencimento no array `selectedIds`.
  - `Editor2D.tsx:265` (`selectedLayer` derivado, singular) → só existe/é não-nulo quando
    `selectedIds.length === 1`; com 0 ou 2+ selecionados, é `null`.
  - `Editor2D.tsx:336-343` (sync do modo de edição de texto) e `Editor2D.tsx:383-390`
    (`handleTextFieldChange`, edição ao vivo) → o painel "Adicionar/Editar texto" e a edição ao
    vivo só ficam ativos quando exatamente 1 camada de texto está selecionada (mesma regra do
    `selectedLayer` singular acima); com 2+ selecionadas, o painel volta pro modo "Adicionar"
    (rótulo genérico, não edita nenhuma das selecionadas).
  - `Editor2D.tsx:529,572` (rótulo "Editando texto"/"Adicionar texto" e botão) → mesma regra,
    segue `selectedLayer?.type === 'text'` (que agora só é não-nulo com seleção única).
  - `Editor2D.tsx:598-637` (painel "Duplicar + silhueta") → só visível/habilitado com exatamente
    1 camada selecionada, mesma regra.
  - HUD de dimensões (entrega 3, acima) → só mostra número com exatamente 1 objeto selecionado;
    com 2+ fica oculto nesta primeira versão (mostrar bbox combinado fica de fora, sem pedido
    explícito do usuário pra isso).
- Atalho DEL: um `useEffect` com `keydown` global no `Editor2D.tsx`, chamando o `deleteLayer` já
  existente para cada id selecionado — **com uma guarda obrigatória**: ignora o evento se
  `document.activeElement` for um `<input>`, `<select>` ou `<textarea>` (cobre os 3 campos de
  texto já existentes que recebem foco com uma camada selecionada: conteúdo do texto
  `Editor2D.tsx:534`, tamanho da fonte `:552`, margem da silhueta `:610`) — sem essa guarda,
  apertar Backspace pra corrigir uma dessas caixas de texto apagaria a camada inteira.

**Alternativa considerada e descartada para desfazer/refazer:** incluir aqui mesmo, dado que
"parece" só um atalho de teclado a mais. Descartada porque exige uma arquitetura de histórico
(snapshots ou command pattern) que nenhuma das outras 6 entregas precisa — misturar inflaria o
escopo e o risco desta wish sem necessidade; vira seu próprio brainstorm.

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Guia 256×256mm é só visual, nunca bloqueia | Simplicidade — clamp exigiria lógica de posição/resize em todo drag/transform; usuário só pediu "noção visual" |
| 2 | Cor no canvas reflete a cor da PARTE, não um novo dado por camada | Reusa o `PartSettingsMap` já existente; evita introduzir um segundo conceito de "cor" que poderia divergir da cor de impressão real. Efeito colateral intencional: isso sobrescreve o preenchimento por-path que `svgImport.ts` hoje preserva de SVGs multi-cor importados (`svgImport.ts:47-51`) — uma vez atribuída a uma parte, a camada renderiza inteira na cor daquela parte, porque a peça física realmente sai numa cor de filamento só por parte (mesma regra já usada em `extraMeshes` do Viewer3D). Camada sem parte mantém as cores originais do import. |
| 3 | Desfazer/Refazer sai deste pacote | Arquitetura de histórico é um problema à parte, com escopo e risco próprios — não é um "atalho a mais" |
| 4 | Seleção múltipla suporta shift+clique E marquee | Cobre os dois padrões de interação mais comuns (Figma-like); nenhum dos dois é redundante com o outro |
| 5 | Alinhamento usa bounding box axis-aligned | Simples e previsível mesmo com objetos rotacionados; alinhar por bounds rotacionados é ambíguo/mais complexo sem ganho claro pedido pelo usuário |

## Risks & Assumptions

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| 1 | Konva `Transformer` hoje só recebe 1 node (`transformer.nodes([selectedNode])` em `EditorCanvas.tsx`) — multi-seleção exige passar vários nodes; Konva suporta isso nativamente mas nunca foi exercitado neste código | Média | Verificar/validar durante implementação; comportamento documentado do Konva, não uma lacuna arquitetural |
| 2 | Marquee-select exige expandir o modelo de eventos do `Stage` — hoje só existe `onMouseDown` (`EditorCanvas.tsx:36-39`); marquee precisa também de `onMouseMove` (desenhar o retângulo/medir distância) e `onMouseUp` (decidir se foi clique ou arrasto e computar a interseção final) | Média | `onMouseDown` continua deselecionando como hoje quando não é um drag; um limiar de >4px até o `onMouseUp` decide se virou marquee — ver Approach para os detalhes de como isso não muda o comportamento de clique simples existente |
| 3 | Cor-por-parte exige passar `partSettings`/cor resolvida pra dentro de `EditorCanvas`, que hoje só recebe `layers` | Baixa | Prop drilling mecânico — sem risco de design |
| 4 | DEL/Backspace global pode roubar teclas de campos de texto já existentes (conteúdo do texto, tamanho da fonte, margem da silhueta) | Alta | Guarda obrigatória no handler: ignora o evento se `document.activeElement` for `<input>`/`<select>`/`<textarea>` (ver Approach) |
| 5 | Estender seleção pra múltiplos ids sem mapear todo consumidor de `selectedId`/`selectedLayer` pode deixar o painel de texto, o painel de silhueta ou o HUD em estado inconsistente/crashando quando 0 ou 2+ camadas estão selecionadas | Alta | Lista explícita de todo consumidor e a regra pra cada um documentada no Approach — nenhum fica implícito |

## Success Criteria

- [ ] Arrastar uma camada na lista muda sua posição; a forma correspondente muda de ordem visual (frente/trás) no canvas
- [ ] Retângulo pontilhado 256×256mm sempre visível; posicionar/redimensionar objetos pra fora dele não é bloqueado
- [ ] Selecionar um objeto mostra largura×altura em mm; arrastar uma âncora de resize atualiza os números em tempo real
- [ ] Camada atribuída a uma parte renderiza no canvas com a cor configurada daquela parte; camada sem parte mantém o preenchimento original (preto para texto; cores originais por-path para imagem/SVG importado)
- [ ] Shift+clique adiciona/remove da seleção; arrastar numa área vazia seleciona tudo dentro do retângulo
- [ ] Com 2+ objetos selecionados, os botões de alinhamento (H: esq/centro/dir/distribuído; V: topo/centro/baixo/distribuído) reposicionam corretamente
- [ ] DEL/Backspace com seleção ativa (e nenhum campo de texto focado) exclui a(s) camada(s)
- [ ] Digitar Backspace dentro do campo de texto/tamanho de fonte/margem de silhueta corrige o campo normalmente e NÃO exclui a camada selecionada
- [ ] Com 2+ camadas selecionadas: painel "Adicionar/Editar texto" volta ao modo "Adicionar" (não edita nenhuma das selecionadas), painel "Duplicar + silhueta" fica oculto/desabilitado, HUD de dimensões some — nada quebra/loga erro no console
- [ ] `npm run build` e `npm run lint` limpos (via `docker compose exec -T frontend`)

## Next Step

Run `/wish` to convert this design into an executable plan.
