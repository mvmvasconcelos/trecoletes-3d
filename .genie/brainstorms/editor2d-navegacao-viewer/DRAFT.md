# Brainstorm: Navegação Editor 2D ↔ Viewer3D

## Contexto
Hoje o Editor 2D (`/editor-2d`) embute seu próprio Viewer3D inline na mesma tela (painel direito),
junto com o canvas de edição e o painel de Partes — fica apertado (ver screenshot
/home/ifsul/screenshots/latest.png). Usuário quer separar essas responsabilidades em telas
diferentes, com fluxo pensado para se integrar ao restante do site (que já tem uma tela
por-modelo com Viewer3D, ex: ChaveiroSimples.tsx, TampaCaneta.tsx etc — 18 páginas seguem esse
padrão hoje via `Layout.tsx`).

## Fluxo alvo (descrito pelo usuário)
1. Usuário abre um modelo no site (rota de um gerador específico) → abre o Viewer3D já com o
   modelo padrão/atual daquele gerador.
2. Botão "Editor 2D" nessa tela → leva pro editor (camadas, partes, etc — tela dedicada, sem
   Viewer3D embutido).
3. Usuário edita, clica "Gerar 3D".
4. Volta para a tela do Viewer3D, agora mostrando o modelo recém-editado.

## WRS: █████░░░░░ 50/100
Problem ✅ | Scope ✅ | Decisions ░ | Risks ░ | Criteria ░

## Decisões confirmadas
- **Escopo**: este brainstorm define só o padrão de navegação, usando o Editor 2D standalone como
  primeiro caso de uso. Estender o botão "Editor 2D" aos outros 18 geradores fica fora (wish futuro).
- **Pré-carregamento**: fora de escopo. O editor sempre começa em branco; o botão é navegação pura,
  não populamento de camadas a partir de parâmetros de um modelo específico.
- **Retorno ao viewer**: troca in-place (mesma tela/rota), sem navegar para uma URL de resultado nova.
- **Ida e volta preservando estado**: usuário precisa poder ver o resultado 3D e VOLTAR para o
  editor para continuar editando, sem perder o que já tinha montado (camadas, partes, config).

## Decisão de arquitetura (confirmada)
`Editor2D.tsx` vira um único componente com um modo interno (`'edit' | 'preview'`, `useState`),
sem troca de rota via React Router — só alterna qual painel é mostrado (canvas+camadas+partes vs.
Viewer3D em tela cheia). Como o componente nunca desmonta, o estado de camadas/partes nunca se
perde entre os dois modos — sem precisar de Context, localStorage ou lifting state para um pai.
A URL continua `/editor-2d` o tempo todo. Isso também resolve o aperto de espaço: cada modo ocupa
a tela inteira. Alternativa considerada e descartada: rotas reais separadas (`/editor-2d` +
`/editor-2d/preview`) — funcionaria com o botão voltar do navegador, mas exige um Context/store
externo só para não perder o estado das camadas ao desmontar/remontar; complexidade desnecessária
para o ganho.

## Riscos identificados
- Se a navegação fosse feita via rota real (ex: `/editor-2d` ↔ `/editor-2d/preview` como rotas
  separadas do React Router), o componente do editor desmontaria/remontaria e o estado de
  camadas se perderia ao voltar — por isso a decisão acima evita rota real para o toggle
  edit/preview (ficando só como um `useState` interno).
- `stageSize`/`ResizeObserver` do canvas (Editor2D.tsx:83-98) precisa se comportar bem quando o
  canvas fica oculto (`display:none` ou desmontado) no modo preview e volta a aparecer — testar
  se o Konva Stage remede corretamente ao voltar pro modo edit.

## Critérios de aceite (rascunho)
- Modo "edit": mostra canvas + lista de camadas + painel de partes, SEM Viewer3D visível — layout
  usa o espaço inteiro da tela (resolve o aperto atual).
- Botão "Gerar 3D" chama o backend como hoje, e ao suceder alterna para o modo "preview" (mesmo
  componente, mesma sessão — sem perda de camadas/partes já configuradas).
- Modo "preview": mostra o Viewer3D em tela cheia (ou quase) com o resultado gerado, com um botão
  "Voltar para o Editor" que retorna ao modo "edit" com todas as camadas/partes exatamente como
  estavam antes de gerar.
- QA manual: montar composição, gerar, voltar pro editor, confirmar que camadas/partes/seleção
  não sumiram nem resetaram.
