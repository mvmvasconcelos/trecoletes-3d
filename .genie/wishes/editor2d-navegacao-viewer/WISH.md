# Wish: Editor 2D — navegação em modo edit/preview (sem Viewer3D embutido)

| Field | Value |
|-------|-------|
| **Status** | DRAFT |
| **Slug** | `editor2d-navegacao-viewer` |
| **Date** | 2026-07-13 |
| **Author** | Vinicius Vasconcelos |
| **Appetite** | Pequena — 1 grupo de execução, 1 arquivo principal (`Editor2D.tsx`), sem novas dependências nem mudança de rota |
| **Branch** | `wish/editor2d-navegacao-viewer` |
| **Repos touched** | trecoletes-3d (frontend) |
| **Design** | [DESIGN.md](../../brainstorms/editor2d-navegacao-viewer/DESIGN.md) |

## Summary

Hoje o Editor 2D (`/editor-2d`) mostra o canvas de edição, os painéis de camadas/partes e o
Viewer3D todos espremidos na mesma tela. Este wish adiciona um estado interno `mode: 'edit' |
'preview'` ao `Editor2D.tsx` para alternar entre uma tela cheia de edição e uma tela cheia de
visualização do resultado 3D, sem trocar de rota e sem perder o estado de camadas/partes ao ir e
voltar.

## Scope

### IN

- `Editor2D.tsx` ganha `useState<'edit' | 'preview'>('edit')`.
- Modo `edit`: canvas + lista de camadas + painel de partes ocupando toda a área `<main>` do
  `Layout` (abaixo do header), sem o Viewer3D visível.
- Modo `preview`: Viewer3D ocupando a mesma área `<main>`, com o botão "Exportar 3MF" existente
  ainda disponível, mais um botão "Voltar para o Editor".
- Botão "Gerar 3D": ao suceder, alterna automaticamente de `edit` para `preview`.
- Botão "Voltar para o Editor" (novo): alterna de `preview` de volta para `edit`.
- Painéis de canvas e de Viewer3D permanecem **ambos montados o tempo todo**; a troca de modo
  alterna visibilidade via CSS (não via unmount condicional do JSX).
- Novo `useEffect` chaveado em `mode`: ao entrar em `edit`, força uma nova medição
  (`measure()`) do container do canvas, já que elementos ocultos via CSS podem reportar
  tamanho 0 enquanto escondidos e o `ResizeObserver` sozinho (`Editor2D.tsx:83-98`, hoje com
  deps `[]`) não cobre esse caso.
- Nenhuma troca de rota via React Router — URL continua `/editor-2d` o tempo todo.

### OUT

- Estender o botão "Editor 2D" aos outros 18 geradores existentes (ChaveiroSimples, TampaCaneta
  etc.) — fica para um wish futuro.
- Pré-carregar o editor com o SVG/parâmetros de um modelo específico ao entrar vindo de um
  gerador — o editor sempre começa em branco.
- Rota/URL de resultado dedicada e persistência de resultados por id (compartilhar link,
  histórico do navegador).
- Qualquer item de ergonomia do canvas (reorder de camadas por drag-and-drop, limite de canvas
  256×256mm, dimensões em tempo real ao selecionar/redimensionar, seleção múltipla + alinhamento,
  cor da parte refletida no canvas, atalhos de teclado DEL/Ctrl+Z/Ctrl+Y) — coberto em brainstorm
  separado, `editor2d-canvas-ergonomia` (ainda em `.genie/brainstorms/`, não crystalizado).

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Toggle `mode` interno via `useState`, sem rota nova | Elimina por construção o risco de perda de estado — o componente nunca desmonta |
| 2 | Canvas e Viewer3D ficam sempre montados; visibilidade via CSS, não unmount condicional | Evita que o `ResizeObserver` do canvas perca a referência ao remontar, e evita reinicializar o contexto WebGL/recarregar STL do Viewer3D a cada troca de modo |
| 3 | Escopo restrito ao Editor 2D standalone (sem tocar os outros 18 geradores) | Cada gerador tem sua própria estrutura de página; estender o padrão a eles é decisão e trabalho separados |
| 4 | Editor sempre começa em branco (sem pré-carregar modelo) | Cada gerador tem um formato de parâmetros próprio; converter isso em camadas editáveis é um problema à parte |
| 5 | Retorno ao viewer é in-place (mesma tela), sem rota de resultado dedicada | Simplicidade — não há necessidade hoje de compartilhar/persistir um link de resultado |

## Success Criteria

- [ ] Modo `edit` ocupa toda a área `<main>` do `Layout` (abaixo do header) com canvas + camadas + partes, sem Viewer3D visível
- [ ] Clicar "Gerar 3D" chama o backend como hoje e, ao suceder, alterna automaticamente para o modo `preview`
- [ ] Modo `preview` mostra o Viewer3D nessa mesma área `<main>`, com o botão "Exportar 3MF" ainda disponível
- [ ] Botão "Voltar para o Editor" no modo `preview` retorna ao modo `edit` com todas as camadas, partes e seleção exatamente como estavam antes de gerar
- [ ] Ao voltar para `edit`, o canvas Konva preenche corretamente o container (sem `stageSize` congelado no tamanho anterior)
- [ ] QA manual: montar composição com múltiplas camadas/partes, gerar, voltar, confirmar que nada foi perdido ou resetado
- [ ] `npm run build` e `npm run lint` limpos (via `docker compose exec -T frontend`)

## Execution Strategy

### Wave 1 (sequential)

| Group | Agent | Description |
|-------|-------|-------------|
| 1 | engineer | Implementar o toggle `mode` edit/preview em `Editor2D.tsx`, reestruturar o layout para ocupar tela cheia em cada modo, e corrigir a remedição do canvas ao voltar para `edit` |

Wish pequena e de arquivo único — não há paralelismo real a explorar; um único grupo sequencial
cobre todo o escopo.

## Execution Groups

### Group 1: Toggle edit/preview no Editor 2D

**Goal:** `Editor2D.tsx` alterna entre uma tela cheia de edição e uma tela cheia de visualização
3D via estado interno, sem perder camadas/partes e sem trocar de rota.

**Deliverables:**
1. `useState<'edit' | 'preview'>('edit')` adicionado a `Editor2D.tsx`.
2. Layout reestruturado: hoje `<main>` tem 4 painéis lado a lado — ferramentas (`<aside
   className="w-80">`, linha 456), canvas (`<section className="flex-1">`, linha 611), partes
   (`<aside className="w-72">`, linha 627) e viewer (`<section className="w-[420px]">`, linha
   662, largura fixa). Em `edit`: ferramentas + canvas + partes visíveis ocupando toda a largura
   de `<main>`, viewer oculto. Em `preview`: ferramentas + canvas + partes ocultos, viewer visível
   E com a largura trocada de fixa (`w-[420px]`) para `flex-1` (ou equivalente), ocupando toda a
   largura de `<main>` — não só reaparecendo na coluna estreita atual.
3. Handler de sucesso de "Gerar 3D" (`handleGenerate`) passa a setar `mode` para `'preview'` após
   a geração ter sucesso.
4. Novo botão "Voltar para o Editor" no modo `preview`, que seta `mode` de volta para `'edit'`.
5. Os 4 painéis (ferramentas, canvas, partes, viewer) deixam de ser incondicionalmente
   renderizados lado a lado — todos ficam sempre no JSX (nenhum desmonta), alternando uma classe
   CSS de visibilidade (`hidden`, Tailwind) conforme `mode`: ferramentas/canvas/partes visíveis só
   em `edit`, viewer visível só em `preview`. Nenhuma prop nova em `Viewer3D.tsx` é necessária —
   o toggle acontece no `<section>` que já o envolve em `Editor2D.tsx` (linha 662).
6. Novo `useEffect` com dependência em `mode`: ao entrar em `'edit'`, chama `measure()` do
   `canvasContainerRef` novamente (reaproveitando a função já existente no efeito do
   `ResizeObserver`, linhas 83-98) para garantir que `stageSize` reflita o tamanho real do
   container mesmo se ele esteve oculto.

**Acceptance Criteria:**
- [ ] Estando em `edit`, ferramentas + canvas + partes ocupam toda a área `<main>` abaixo do header — Viewer3D oculto (não só estreito, oculto de fato)
- [ ] Clicar "Gerar 3D" com sucesso troca automaticamente para `preview`; ferramentas/canvas/partes ficam ocultos e o Viewer3D passa a ocupar a largura inteira de `<main>` (troca de `w-[420px]` fixo para `flex-1`), com o botão "Exportar 3MF" disponível (quando a resposta trouxer `tmfUrl`, mesmo padrão já existente)
- [ ] Clicar "Voltar para o Editor" troca de volta para `edit`, preservando `layers`, `partSettings`, `selectedId` exatamente como estavam
- [ ] Redimensionar a janela (ou o painel) em `edit`, ir para `preview` e voltar para `edit`: o canvas Konva preenche o container corretamente, sem ficar "encolhido" ou com sobra de espaço em branco
- [ ] Na primeira transição para `preview` em uma sessão (primeira vez que o `<Canvas>` do Viewer3D fica visível depois de montado oculto), o modelo renderiza no tamanho/aspecto correto — não "espremido" nem em branco
- [ ] Nenhuma navegação de URL ocorre ao alternar de modo (`/editor-2d` o tempo todo)

**Validation:**
```bash
docker compose exec -T frontend npm run build
docker compose exec -T frontend npm run lint
```
QA manual: montar composição com 2+ camadas em 2+ partes; gerar; conferir Viewer3D e "Exportar
3MF" em tela cheia; voltar ao editor; confirmar camadas/partes/seleção intactas; redimensionar a
janela do navegador antes e depois da troca de modo para validar a remedição do canvas.

**depends-on:** none

---

## QA Criteria

_What must be verified on dev after merge. The QA agent tests each criterion._

- [ ] Fluxo completo ponta-a-ponta: montar 2+ camadas, gerar, ver resultado em `preview`, voltar,
      editar de novo, gerar de novo — sem erros no console e sem perda de estado
- [ ] Integração: `Exportar 3MF` no modo `preview` continua baixando o arquivo correto
- [ ] Regressão: as outras 18 páginas de gerador (que usam `Layout.tsx` mas não `Editor2D.tsx`)
      continuam funcionando normalmente — este wish não deve tocar nada fora de `Editor2D.tsx`

---

## Assumptions / Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Manter Viewer3D sempre montado (mesmo oculto) mantém um contexto WebGL ativo durante todo o modo `edit` | Baixa | Aceitável para uma única instância; evita o custo maior de reinicializar WebGL/recarregar STL a cada troca de modo |
| CSS-hide (em vez de unmount) pode deixar elementos ocultos ainda "clicáveis"/focáveis via teclado se não usado corretamente (ex: `display:none` faltando em algum wrapper) | Baixa | Usar `hidden` (Tailwind, equivalente a `display:none`) de forma consistente nos dois painéis; validado manualmente por QA |
| Escopo restrito ao Editor 2D standalone pode gerar expectativa de que os outros 18 geradores já ganharam esse padrão | Baixa | Documentado explicitamente em OUT |

---

## Review Results

_Populated by `/review` after execution completes._

---

## Files to Create/Modify

```
frontend/src/pages/Editor2D.tsx   (modify — toggle mode, layout, ResizeObserver fix, novo botão "Voltar para o Editor")
```
