# Brainstorm: Editor 2D — Ajustes pós-primeiro-teste

## Contexto
Feature Editor 2D (canvas Konva, camadas texto/imagem, silhueta client-side, 4 partes multicolor)
commitada em `ea91b83`. Primeiro teste real do usuário no browser: layout básico ok (sem mais o bug
de crescimento infinito), fluxo funciona ponta-a-ponta. Usuário quer levantar uma lista de ajustes
e refinamentos — não é feature nova, é iteração sobre o que já está em produção.

Screenshot de referência: /home/ifsul/screenshots/latest.png — mostra canvas central com 2 camadas
de texto ("Texto" + silhueta duplicada, "Mais um!"), painel direito "Partes (Geração 3D)" com
Parte 1/2/3 (altura + cor + extrusora), preview 3D à direita.

## WRS: ██░░░░░░░░ 0/100
Problem ░ | Scope ░ | Decisions ░ | Risks ░ | Criteria ░

## Correção da minha observação inicial
Fundo dourado/mustard no preview 3D = build plate decorativa (referência visual da mesa da
impressora), não é bug de cor. Não confundir com cor das partes.

## Itens levantados pelo usuário (lista bruta, ainda não categorizados/priorizados)

1. **Navegação Editor↔Viewer**: hoje Editor 2D e Viewer3D dividem a mesma tela (apertado). Ideia:
   telas separadas. Fluxo alvo: abrir um modelo no site → abre Viewer3D com o modelo padrão →
   botão "Editor 2D" → abre editor, faz edições → "Gerar 3D" → volta pro Viewer3D com o modelo editado.
2. Lista de camadas (painel esquerdo): permitir drag-and-drop para reordenar (subir/descer camada).
3. Limitar o canvas a 256×256mm (tamanho da mesa A1) — referência visual do espaço de impressão.
4. Ao selecionar um objeto no canvas: mostrar dimensões (largura×altura mm) no canto inferior esquerdo.
5. Ao arrastar a âncora de redimensionar: mostrar o tamanho em tempo real durante o gesto.
6. Cor do objeto deve refletir no canvas (hoje tudo renderiza preto, difícil diferenciar camadas/partes).
7. Seleção múltipla de objetos + alinhamento: horizontal (esquerda/centro/direita/distribuído),
   vertical (topo/centro/baixo/distribuído).
8. Terminologia no painel "Partes": campo hoje chamado "Altura (mm)" é na verdade **espessura**
   (eixo Z). Convenção correta: Z=espessura, Y=altura, X=largura.
9. Bug de UX: ao clicar numa camada de texto existente na lista, o input é preenchido com o texto
   dela, mas o label acima continua "Adicionar texto" — confuso, parece que não dá pra editar.
   Sintoma de uma questão maior: usuário pede avaliação de UI/UX geral do editor.
10. Meta (não é item do wish): usuário pediu para eu verificar se existe subagente/skill
    especializado em UI/UX e adicionar ao Claude Code para uso futuro.
11. Atalhos de teclado no canvas: DEL para excluir objeto selecionado; Ctrl+Z desfazer, Ctrl+Y refazer.

## Observação de decomposição (scope-size)
Item 1 (navegação/arquitetura de telas) é um subsistema bem diferente dos itens 2,3,4,5,6,7,9,11
(ergonomia de edição dentro do canvas do Editor 2D). Item 8 é um fix trivial de copy. Item 10 é
uma pergunta de tooling, não uma feature — respondida fora do brainstorm.
Proposta: separar em 2 brainstorms (navegação vs. ergonomia do canvas) + resolver 8 e o bug
específico de 9 como fixes diretos, sem precisar de wish completo.

## Status final (revisão 2026-07-16)
Todos os itens já foram entregues antes mesmo de retomar este brainstorm — a decomposição proposta
acima já tinha acontecido em rodadas anteriores da sessão, só faltava o housekeeping dos wishes:

- **Item 1** (navegação): crystalizou em `editor2d-navegacao-viewer` (toggle `mode: edit|preview`
  dentro da mesma tela/rota, não telas/rotas separadas — decisão registrada no próprio wish).
  Shipped em `6fb8fcb`, wish marcado SHIPPED nesta sessão.
- **Itens 2,3,4,5,6,7,11 (DEL)**: crystalizaram em `editor2d-canvas-ergonomia`. Shipped em
  `5204ca5`, wish marcado SHIPPED nesta sessão.
- **Item 8** (Altura→Espessura): já corrigido — `PartsPanel.tsx:51` usa "Espessura (mm)".
- **Item 9** (label preso em "Adicionar texto"): já corrigido — `Editor2D.tsx:653` alterna
  "Editando texto"/"Adicionar texto" conforme `selectedLayer?.type`.
- **Item 10** (subagente de UI/UX): respondido diretamente ao usuário, sem crystalizar wish — ver
  conversa. Não existe um subagente dedicado de revisão de UI/UX no momento; o mais próximo é a
  skill `frontend-design`, focada em direção visual/estética, não em auditoria de usabilidade.
- **Ctrl+Z/Ctrl+Y** (parte do item 11): permanece OUT de escopo em `editor2d-canvas-ergonomia`
  ("exige arquitetura de histórico própria; brainstorm futuro") — único item genuinamente em
  aberto deste brainstorm, se o usuário quiser retomar.

Nenhum item novo a brainstormar aqui agora. Arquivo mantido como registro histórico da sessão de
feedback pós-teste.
