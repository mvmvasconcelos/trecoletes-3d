# Wish: Editor 2D — Ergonomia do canvas

| Field | Value |
|-------|-------|
| **Status** | SHIPPED |
| **Slug** | `editor2d-canvas-ergonomia` |
| **Date** | 2026-07-13 |
| **Author** | Vinicius Vasconcelos |
| **Appetite** | Média — 6 grupos de execução, alto overlap de arquivos entre eles (a maioria toca `EditorCanvas.tsx`/`Editor2D.tsx`), sem mudança de backend |
| **Branch** | `wish/editor2d-canvas-ergonomia` |
| **Repos touched** | trecoletes-3d (frontend) |
| **Design** | [DESIGN.md](../../brainstorms/editor2d-canvas-ergonomia/DESIGN.md) |

## Summary

O canvas do Editor 2D hoje não dá noção do espaço de impressão real, renderiza tudo em preto,
só reordena camadas manualmente reatribuindo partes, só seleciona um objeto por vez e não tem
atalho de teclado pra excluir. Este wish entrega 6 melhorias de ergonomia: reorder de camadas por
drag-and-drop, guia visual 256×256mm, HUD de dimensões em mm, cor da parte refletida no canvas,
seleção múltipla com alinhamento, e atalho DEL/Backspace.

## Scope

### IN

- Lista de camadas (`LayerPanel.tsx`): drag-and-drop pra reordenar (a ordem já determina z-index).
- Guia visual 256×256mm (retângulo pontilhado, mesa A1) sempre visível, nunca bloqueia.
- HUD de dimensões (largura×altura em mm) ao selecionar 1 objeto, atualizado em tempo real durante
  resize; usa a convenção já existente "1 unidade = 1mm".
- Cor da parte refletida no preenchimento das formas no canvas; camada sem parte mantém o
  preenchimento original (preto para texto, cores por-path preservadas para imagem/SVG).
- Seleção múltipla (shift+clique + marquee, sempre somando à seleção) com toolbar de alinhamento
  axis-aligned (H: esquerda/centro/direita/distribuído; V: topo/centro/baixo/distribuído).
- Atalho DEL/Backspace exclui a seleção — com guarda obrigatória contra roubar foco de
  `<input>`/`<select>`/`<textarea>` existentes (texto, tamanho de fonte, margem de silhueta).

### OUT

- Desfazer/Refazer (Ctrl+Z/Ctrl+Y) — exige arquitetura de histórico própria; brainstorm futuro.
- Limite rígido de canvas (clamp de posição/tamanho) — a guia 256×256mm é só visual.
- Cor independente por camada, desacoplada da parte.
- Reordenar camadas por qualquer meio além de drag-and-drop.
- Alinhamento por bounding box rotacionado — sempre axis-aligned.

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Seleção múltipla (Grupo 5) executa primeiro, sozinha, numa wave própria | É a mudança mais transversal (`selectedId → selectedIds`) — todo outro grupo que toca seleção (HUD, DEL) já nasce sobre o modelo final, em vez de precisar retrofit depois |
| 2 | Grupos 1, 2 e 4 (reorder, guia, cor) rodam em waves sequenciais, não em paralelo, mesmo sem depends-on lógico entre eles | Todos tocam `EditorCanvas.tsx`/`Editor2D.tsx` (mesmos arquivos que o Grupo 5 acabou de mudar) — dispatch paralelo de subagents editando o mesmo arquivo ao mesmo tempo arrisca sobrescrita; sequencial elimina esse risco por completo, ao custo de um pouco mais de tempo de execução |
| 3 | HUD (Grupo 3) e atalho DEL (Grupo 6) declaram `depends-on: Grupo 5` | Ambos operam sobre `selectedIds` (plural) e as regras de gating (HUD só com seleção única) definidas na Approach do design — precisam do modelo de seleção final já pronto |
| 4 | Cor da parte (Grupo 4) sobrescreve o preenchimento por-path de SVGs multi-cor importados, uma vez atribuída a uma parte | Decisão já confirmada no design — a peça física sai numa cor de filamento só por parte |

## Success Criteria

- [x] Arrastar uma camada na lista muda sua posição; a forma correspondente muda de ordem visual (frente/trás) no canvas
- [x] Retângulo pontilhado 256×256mm sempre visível; posicionar/redimensionar objetos pra fora dele não é bloqueado
- [x] Selecionar um objeto mostra largura×altura em mm; arrastar uma âncora de resize atualiza os números em tempo real
- [x] Camada atribuída a uma parte renderiza no canvas com a cor configurada daquela parte; camada sem parte mantém o preenchimento original (preto para texto; cores originais por-path para imagem/SVG importado)
- [x] Shift+clique adiciona/remove da seleção; arrastar numa área vazia seleciona tudo dentro do retângulo; os dois métodos compõem (nunca substituem a seleção atual)
- [x] Com 2+ objetos selecionados, os botões de alinhamento (H: esq/centro/dir/distribuído; V: topo/centro/baixo/distribuído) reposicionam corretamente
- [x] DEL/Backspace com seleção ativa (e nenhum campo de texto focado) exclui a(s) camada(s)
- [x] Digitar Backspace dentro do campo de texto/tamanho de fonte/margem de silhueta corrige o campo normalmente e NÃO exclui a camada selecionada
- [x] Com 2+ camadas selecionadas: painel "Adicionar/Editar texto" volta ao modo "Adicionar", painel "Duplicar + silhueta" fica oculto, HUD de dimensões some — sem erro no console
- [x] `npm run build` e `npm run lint` limpos

## Execution Strategy

### Wave 1 (sequencial, sozinho)

| Group | Agent | Description |
|-------|-------|-------------|
| 5 | engineer | Seleção múltipla (shift+clique + marquee) + toolbar de alinhamento — fundação para os grupos 3 e 6 |

### Wave 2 (sequencial entre si, todos depois do Grupo 5)

| Group | Agent | Description |
|-------|-------|-------------|
| 1 | engineer | Reorder de camadas por drag-and-drop na lista |
| 2 | engineer | Guia visual 256×256mm no canvas |
| 4 | engineer | Cor da parte refletida no preenchimento das formas |

### Wave 3 (sequencial entre si, ambos depois do Grupo 5)

| Group | Agent | Description |
|-------|-------|-------------|
| 3 | engineer | HUD de dimensões (mm), ao vivo durante resize |
| 6 | engineer | Atalho DEL/Backspace com guarda contra inputs de texto |

Waves 2 e 3 não têm dependência lógica entre si nem com uma ordem interna específica — a
separação em waves reflete unicamente o risco de sobrescrita por tocar os mesmos arquivos (ver
Decisão 2), não uma dependência real de dados/comportamento. Cada grupo dentro de uma wave deve
ser executado e validado (build/lint) antes de começar o próximo da mesma wave.

## Execution Groups

### Group 5: Seleção múltipla + alinhamento

**Goal:** O editor suporta selecionar 2+ objetos (shift+clique e marquee) e alinhá-los, sem
quebrar nenhum consumidor existente de seleção única.

**Deliverables:**
1. `Editor2D.tsx`: `selectedId: string | null` vira `selectedIds: string[]`; `selectedLayer`
   derivado só é não-nulo quando `selectedIds.length === 1`.
2. `EditorCanvas.tsx`: `Stage` ganha `onMouseMove`/`onMouseUp` (hoje só tem `onMouseDown`,
   `EditorCanvas.tsx:36-39`, que limpa a seleção incondicionalmente em qualquer clique no target
   do Stage). O clear-on-click precisa ficar **condicional a não virar um arrasto**: no
   `onMouseDown` sobre o Stage, só decide entre "clique simples" (deseleciona, comportamento
   atual preservado) e "possível início de marquee" no `onMouseUp`, usando um limiar de >4px de
   distância percorrida entre down e up pra decidir qual dos dois foi. Isso evita que iniciar um
   novo marquee-drag sobre área vazia apague uma seleção multi-objeto já existente antes do
   limiar ser avaliado — ver Grupo 5 AC "soma à seleção atual", que exige isso mesmo ao encadear
   dois marquees seguidos. Marquee sempre ADICIONA à seleção atual (nunca substitui), compondo
   livremente com shift+clique. `Transformer.nodes()` recebe múltiplos nodes.
3. `LayerPanel.tsx`: `isSelected` vira checagem de pertencimento em `selectedIds`.
4. `Editor2D.tsx`: painel "Adicionar/Editar texto" (sync `useEffect` + `handleTextFieldChange` +
   rótulo "Editando"/"Adicionar") e painel "Duplicar + silhueta" só ficam ativos com exatamente 1
   camada selecionada (mesma regra de `selectedLayer` singular); com 0 ou 2+, texto volta pro modo
   "Adicionar" genérico e a silhueta fica oculta.
5. Novo componente `frontend/src/components/editor2d/AlignmentToolbar.tsx` (mesmo padrão de
   `PartsPanel.tsx` — painel próprio, não inline em `Editor2D.tsx`), visível só com 2+
   selecionados: horizontal esquerda/centro/direita/distribuído, vertical topo/centro/baixo/
   distribuído, sobre o bounding box axis-aligned de cada objeto selecionado.

**Acceptance Criteria:**
- [x] Shift+clique adiciona/remove um objeto da seleção sem afetar os demais já selecionados
- [x] Arrastar numa área vazia do canvas (>4px) seleciona todos os objetos que a caixa intersecta, somando à seleção atual
- [x] Um clique simples (sem arrasto) numa área vazia continua deselecionando tudo, como hoje
- [x] Com 2+ selecionados: painel de texto mostra "Adicionar texto" (não edita nenhuma camada), painel de silhueta fica oculto, nenhum erro no console
- [x] Com 2+ selecionados, os botões de alinhamento aparecem e reposicionam corretamente pelo bounding box axis-aligned
- [x] `Transformer` do Konva mostra as alças de todos os objetos selecionados simultaneamente

**Validation:**
```bash
docker compose exec -T frontend npm run build
docker compose exec -T frontend npm run lint
```
QA manual: montar 3+ camadas, testar shift+clique, marquee, clique simples pra deselecionar,
alinhar 2 e depois 3 objetos, confirmar que os painéis de texto/silhueta reagem certo ao trocar
entre 0/1/2+ selecionados.

**depends-on:** none

---

### Group 1: Reorder de camadas por drag-and-drop

**Goal:** Arrastar uma camada na lista muda sua ordem, refletindo no z-index do canvas.

**Deliverables:**
1. `LayerPanel.tsx`: cada linha da lista vira arrastável (drag handlers nativos ou uma lib leve
   já disponível no projeto, a critério da implementação); ao soltar, chama um callback novo
   (`onReorder`) com o novo índice. **Atenção:** a lista hoje renderiza
   `orderedLayers = [...layers].reverse()` (`LayerPanel.tsx:34`, topo da lista = topo da pilha
   visual), então o índice de drag na lista renderizada está invertido em relação ao array
   `layers` real — o índice recebido por `onReorder` precisa ser traduzido de volta
   (`layers.length - 1 - indexNaLista`) antes de aplicar no array original, senão arrastar pro
   fundo da lista move a camada pra FRENTE no array (o oposto do pretendido).
2. `Editor2D.tsx`: implementa `onReorder` reordenando o array `layers` via `setLayers` (já
   traduzido o índice conforme a nota acima) — o canvas já usa a ordem do array pra renderizar
   (`layers.map(...)` em `EditorCanvas.tsx`), então nenhuma mudança adicional é necessária lá.

**Acceptance Criteria:**
- [x] Arrastar a camada do topo da lista pro fundo faz ela desenhar atrás das outras no canvas (e vice-versa)
- [x] A seleção atual (Grupo 5) não muda ao reordenar

**Validation:**
```bash
docker compose exec -T frontend npm run build
docker compose exec -T frontend npm run lint
```
QA manual: 3 camadas sobrepostas, reordenar e confirmar mudança visual de frente/trás.

**depends-on:** Group 5 (wave sequencial, ver Decisão 2 — sem dependência de dados real)

---

### Group 2: Guia visual 256×256mm

**Goal:** Um retângulo pontilhado de 256×256mm sempre visível no canvas, como referência da mesa
A1 — nunca bloqueia posicionar/redimensionar.

**Deliverables:**
1. `EditorCanvas.tsx`: novo `<Rect>` Konva não-interativo (`listening={false}`, traço pontilhado,
   sem preenchimento), 256×256 unidades (= mm, convenção já estabelecida), centralizado no Stage.

**Acceptance Criteria:**
- [x] Guia sempre visível, em qualquer estado do editor
- [x] Não intercepta cliques (objetos atrás/sob a guia continuam selecionáveis)
- [x] Posicionar ou redimensionar um objeto pra fora da guia funciona normalmente (sem clamp)

**Validation:**
```bash
docker compose exec -T frontend npm run build
docker compose exec -T frontend npm run lint
```
QA manual: confirmar visualmente a guia e testar que mover/redimensionar objetos pra fora dela não é bloqueado.

**depends-on:** Group 5 (wave sequencial, ver Decisão 2 — sem dependência de dados real)

---

### Group 4: Cor da parte refletida no canvas

**Goal:** Uma camada atribuída a uma parte renderiza no canvas com a cor configurada daquela
parte, em vez do preenchimento fixo atual.

**Deliverables:**
1. `Editor2D.tsx`: passa `partSettings` (ou só o mapa `partId → color`) como nova prop pra
   `EditorCanvas`.
2. `EditorCanvas.tsx`: ao renderizar cada `<Path>`, se a camada tiver `partId` não-nulo, usa a cor
   da parte correspondente; senão mantém o `fill` original de cada shape (preto pra texto, cores
   por-path preservadas pra imagem/SVG importado).

**Acceptance Criteria:**
- [x] Camada atribuída a uma parte com cor azul configurada renderiza azul no canvas
- [x] Camada sem parte mantém as cores originais (preta pra texto; cores originais por-path pra SVG multi-cor importado)
- [x] Trocar a cor de uma parte no painel de Partes atualiza a cor no canvas imediatamente (sem precisar recarregar)

**Validation:**
```bash
docker compose exec -T frontend npm run build
docker compose exec -T frontend npm run lint
```
QA manual: atribuir camada a uma parte, mudar a cor da parte, confirmar atualização ao vivo no canvas; testar com um SVG multi-cor sem parte atribuída pra confirmar que as cores originais continuam.

**depends-on:** Group 5 (wave sequencial, ver Decisão 2 — sem dependência de dados real)

---

### Group 3: HUD de dimensões (mm)

**Goal:** Ao selecionar exatamente 1 objeto, mostrar largura×altura em mm; atualizar ao vivo
durante um redimensionamento.

**Deliverables:**
1. `Editor2D.tsx`/`EditorCanvas.tsx`: HUD (canto inferior esquerdo do canvas) mostrando
   `largura×altura mm`, derivado de `selectedLayer.transform` (só existe quando
   `selectedIds.length === 1`, ver Grupo 5); some quando 0 ou 2+ estão selecionados.
2. Durante o gesto de redimensionar (`onTransform` do `Transformer`, não só `onTransformEnd`), o
   HUD atualiza em tempo real, antes de soltar a âncora.

**Acceptance Criteria:**
- [x] Selecionar 1 objeto mostra o HUD com as dimensões corretas em mm
- [x] Arrastar uma âncora de resize atualiza os números do HUD continuamente durante o arrasto, não só ao soltar
- [x] HUD desaparece com 0 ou 2+ objetos selecionados

**Validation:**
```bash
docker compose exec -T frontend npm run build
docker compose exec -T frontend npm run lint
```
QA manual: selecionar 1 objeto, conferir números; redimensionar e observar atualização ao vivo; selecionar 2+ e confirmar que o HUD some.

**depends-on:** Group 5

---

### Group 6: Atalho DEL/Backspace

**Goal:** DEL/Backspace exclui a seleção atual, sem interferir em campos de texto existentes.

**Deliverables:**
1. `Editor2D.tsx`: `useEffect` com listener global de `keydown`; ao receber DEL/Backspace, ignora
   o evento se `document.activeElement` for `<input>`, `<select>` ou `<textarea>`; caso contrário,
   chama `deleteLayer` para cada id em `selectedIds`.

**Acceptance Criteria:**
- [x] Com uma seleção ativa e foco fora de qualquer campo de texto, DEL/Backspace exclui a(s) camada(s) selecionada(s)
- [x] Com foco no campo de texto/tamanho de fonte/margem de silhueta, Backspace edita o campo normalmente e NÃO exclui nenhuma camada
- [x] Sem seleção ativa, DEL/Backspace não faz nada (sem erro)

**Validation:**
```bash
docker compose exec -T frontend npm run build
docker compose exec -T frontend npm run lint
```
QA manual: testar DEL com seleção fora de campo de texto (exclui), e Backspace dentro do campo de texto/fonte/margem (não exclui, só edita o campo).

**depends-on:** Group 5

---

## QA Criteria

_What must be verified on dev after merge. The QA agent tests each criterion._

- [x] Fluxo completo: montar composição com 3+ camadas em 2+ partes, reordenar, selecionar múltiplas, alinhar, atribuir cores, redimensionar conferindo o HUD, excluir com DEL — sem erros no console
- [x] Integração: nada dos grupos 1-4/6 quebra o fluxo de geração 3D (Gerar 3D → modo preview) do wish `editor2d-navegacao-viewer`, já em produção
- [x] Regressão: fluxo de texto (`Adicionar/Editar texto`) e "Duplicar + silhueta" continuam funcionando normalmente com seleção única, como antes do Grupo 5

---

## Assumptions / Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Konva `Transformer` com múltiplos nodes é suportado nativamente, mas nunca foi exercitado neste código | Média | Validar durante a implementação do Grupo 5; comportamento documentado do Konva |
| DEL/Backspace global roubar teclas de campos de texto existentes | Alta | Guarda obrigatória checando `document.activeElement` (Grupo 6, Decisão já validada no design) |
| Estender seleção pra múltiplos ids sem mapear todo consumidor pode deixar painéis em estado inconsistente | Alta | Grupo 5 lista e implementa a regra pra cada consumidor explicitamente (ver Deliverables) |
| Grupos 1/2/4 e 3/6 tocam os mesmos arquivos que o Grupo 5 acabou de mudar | Média | Execução em waves sequenciais (Decisão 2), nunca em paralelo dentro da mesma wave |
| Cor da parte sobrescreve preenchimento multi-cor de SVG importado assim que uma camada ganha parte | Baixa (comportamento intencional) | Documentado nos Success Criteria e QA — não é regressão |

---

## Review Results

_Populated by `/review` after execution completes._

---

## Files to Create/Modify

```
frontend/src/pages/Editor2D.tsx                     (modify — selectedIds, HUD, cor por parte, atalho DEL, reorder callback)
frontend/src/components/editor2d/EditorCanvas.tsx   (modify — guia 256x256, multi-select/marquee, cor por parte, HUD live-resize)
frontend/src/components/editor2d/LayerPanel.tsx     (modify — drag-and-drop reorder, isSelected multi)
frontend/src/components/editor2d/AlignmentToolbar.tsx  (create — Grupo 5, painel de alinhamento H/V, mesmo padrão de PartsPanel.tsx)
```
