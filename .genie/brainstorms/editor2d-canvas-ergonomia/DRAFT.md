# Brainstorm: Editor 2D — Ergonomia do canvas (fila para depois)

## Contexto
Segunda metade da lista de ajustes levantada pelo usuário após o primeiro teste do Editor 2D
(feature commitada em `ea91b83`). Deliberadamente colocada em espera — primeiro brainstorm ativo
é [editor2d-navegacao-viewer](../editor2d-navegacao-viewer/DRAFT.md).

## Itens (ainda não refinados)
1. Lista de camadas: drag-and-drop para reordenar (subir/descer camada).
2. Limitar o canvas a 256×256mm (tamanho da mesa A1) — referência visual do espaço de impressão.
3. Ao selecionar um objeto: mostrar dimensões (largura×altura mm) no canto inferior esquerdo.
4. Ao redimensionar (arrastar âncora): mostrar tamanho em tempo real durante o gesto.
5. Cor do objeto refletida no canvas (hoje tudo preto, difícil diferenciar camadas/partes).
6. Seleção múltipla + alinhamento (horizontal esq/centro/dir/distribuído; vertical topo/centro/
   baixo/distribuído).
7. Atalhos de teclado: DEL exclui objeto selecionado; Ctrl+Z desfazer, Ctrl+Y refazer.

## Já resolvido (não faz parte deste brainstorm)
- Terminologia "Altura (mm)" → "Espessura (mm)" no painel de Partes — corrigido direto em
  `PartsPanel.tsx`, sem passar por wish.
- Bug de label "Adicionar texto" não mudava ao editar camada existente — corrigido direto em
  `Editor2D.tsx` (label e botão agora refletem modo edição vs. adição).

## WRS: ░░░░░░░░░░ 0/100 (não iniciado)
