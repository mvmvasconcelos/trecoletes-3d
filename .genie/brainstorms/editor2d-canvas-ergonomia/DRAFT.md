# Brainstorm: Editor 2D — Ergonomia do canvas

## Contexto
Segunda leva de ajustes levantada pelo usuário após o primeiro teste real do Editor 2D. Primeiro
pacote (navegação edit/preview + bugs de geração) já commitado (`04d7218`). Este cobre a
ergonomia de edição dentro do canvas em si.

## WRS: ██████████ 100/100
Problem ✅ | Scope ✅ | Decisions ✅ | Risks ✅ | Criteria ✅

## Problem
O canvas do Editor 2D hoje não dá noção do espaço de impressão real, não mostra dimensões dos
objetos, renderiza tudo em preto (difícil diferenciar camadas/partes), só permite mover uma
camada por vez na lista, só seleciona um objeto por vez, e não tem atalho de teclado pra excluir.

## Decisões confirmadas
1. **Limite 256×256mm**: só uma referência visual (retângulo pontilhado sobreposto ao canvas,
   representando a mesa A1) — não bloqueia posicionar/redimensionar objetos pra fora dela.
2. **Cor no canvas**: reflete a cor já configurada na Parte à qual a camada está atribuída (painel
   direito, "Partes"). Camada sem parte atribuída continua com o preenchimento padrão atual
   (preto). Não é um novo dado — reusa o que já existe no `PartSettingsMap`.
3. **Desfazer/Refazer (Ctrl+Z/Ctrl+Y)**: fora de escopo. É uma feature bem maior (exige histórico
   de estado de todo o editor), tratada como um brainstorm próprio, futuro. Atalho de **DEL**
   (excluir seleção) continua neste pacote — é só um listener de teclado, sem histórico.
4. **Seleção múltipla**: shift+clique (adiciona/remove da seleção) E arrastar uma caixa de seleção
   (marquee) numa área vazia do canvas. As duas formas coexistem.
5. **Alinhamento**: opera sobre o bounding box AXIS-ALIGNED de cada objeto selecionado (não a
   caixa rotacionada) — mais simples e previsível, mesmo para objetos girados.

## Escopo

### IN
1. Lista de camadas: drag-and-drop pra reordenar — a ordem da lista já determina a ordem de
   renderização no canvas (z-index), então reordenar a lista reordena visualmente.
2. Guia visual de 256×256mm (retângulo pontilhado) sempre visível no canvas.
3. HUD de dimensões: ao selecionar um objeto, mostra largura×altura em mm; ao arrastar uma âncora
   de redimensionar, os números atualizam em tempo real durante o gesto.
4. Cor da parte refletida no preenchimento das formas no canvas (decisão 2).
5. Seleção múltipla via shift+clique e marquee; toolbar de alinhamento (horizontal
   esquerda/centro/direita/distribuído; vertical topo/centro/baixo/distribuído) ativa com 2+
   objetos selecionados.
6. Atalho de teclado DEL/Backspace: exclui a(s) camada(s) selecionada(s).

### OUT
- Desfazer/Refazer (decisão 3) — brainstorm futuro separado.
- Limite rígido de canvas (clamp) — decisão 1 rejeitou essa opção.
- Cor independente por camada (decisão 2 rejeitou essa opção) — reusa cor da parte.
- Qualquer forma de reordenar camadas além de drag-and-drop (ex: botões "mover pro topo").
- Alinhamento por bounding box rotacionado (decisão 5) — sempre axis-aligned.

## Riscos
| # | Risco | Severidade | Mitigação |
|---|-------|-----------|-----------|
| 1 | Konva `Transformer` hoje só recebe 1 node por vez (`EditorCanvas.tsx`); multi-seleção exige passar múltiplos nodes — Konva suporta isso nativamente, mas não foi exercitado neste código ainda | Média | Verificar durante implementação; Konva's Transformer aceita array de nodes nativamente, comportamento documentado |
| 2 | Distinguir "clique simples pra deselecionar" de "arrastar pra marquee" no mesmo `onMouseDown` do Stage | Baixa | Usar um limiar de distância de arrasto (ex: >4px de movimento vira marquee, senão é um clique) |
| 3 | Cor-por-parte exige passar `partSettings`/cor resolvida para dentro de `EditorCanvas`, hoje ele só recebe `layers` | Baixa | Prop dril simples — mecânico, sem risco de design |

## Critérios de aceite (rascunho)
- [ ] Arrastar uma camada na lista muda sua posição; a forma correspondente muda de ordem visual (frente/trás) no canvas
- [ ] Retângulo pontilhado 256×256mm sempre visível; posicionar/redimensionar objetos pra fora dele não é bloqueado
- [ ] Selecionar um objeto mostra largura×altura em mm; arrastar uma âncora de resize atualiza os números em tempo real
- [ ] Camada atribuída a uma parte renderiza no canvas com a cor configurada daquela parte; camada sem parte continua preta
- [ ] Shift+clique adiciona/remove da seleção; arrastar numa área vazia seleciona tudo dentro do retângulo
- [ ] Com 2+ objetos selecionados, os botões de alinhamento (H: esq/centro/dir/distribuído; V: topo/centro/baixo/distribuído) reposicionam corretamente
- [ ] DEL/Backspace com seleção ativa exclui a(s) camada(s)
- [ ] `npm run build` e `npm run lint` limpos
