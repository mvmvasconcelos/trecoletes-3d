# Design: Navegação Editor 2D ↔ Viewer3D (modo edit/preview)

| Field | Value |
|-------|-------|
| **Slug** | `editor2d-navegacao-viewer` |
| **Date** | 2026-07-13 |
| **WRS** | 100/100 |

## Problem

O Editor 2D (`/editor-2d`) mostra o canvas de edição, os painéis de camadas/partes e o Viewer3D
todos espremidos na mesma tela ao mesmo tempo, deixando pouco espaço útil para cada um. O usuário
testou a feature pela primeira vez e pediu para separar essas duas responsabilidades (editar vs.
visualizar o resultado 3D) em telas próprias, com uma forma de ir de uma para a outra e voltar sem
perder o trabalho em andamento.

## Scope

### IN
- `Editor2D.tsx` ganha um estado interno `mode: 'edit' | 'preview'`.
- Modo `edit`: layout atual de canvas + lista de camadas + painel de partes, ocupando toda a área
  `<main>` do `Layout` (abaixo do header, que continua sempre visível em todas as telas do site) —
  sem o Viewer3D embutido ao lado. Resolve o aperto de espaço.
- Modo `preview`: Viewer3D ocupando essa mesma área `<main>`, mostrando o resultado da última
  geração, com um botão "Voltar para o Editor" sobreposto (ou em uma barra própria) que retorna ao
  modo `edit`. O botão "Exportar 3MF" já existente permanece disponível junto ao Viewer3D neste modo.
- Botão "Gerar 3D" no modo `edit`: mantém a chamada atual ao backend; ao suceder, alterna
  automaticamente para o modo `preview`.
- Nenhuma troca de rota via React Router — tudo dentro do mesmo componente montado, mesma URL
  `/editor-2d` o tempo todo. Isso é o que garante que camadas/partes não se percam ao alternar.
- Painel do canvas e painel do Viewer3D permanecem **ambos montados o tempo todo**; a troca de modo
  alterna qual um fica visível via CSS (`hidden`/classe condicional), não via unmount condicional
  do JSX. Isso evita que o `ResizeObserver` do canvas (`Editor2D.tsx:83-98`, hoje com deps `[]` e
  fechado sobre o node no mount) perca a referência ao remontar, e evita que o `Viewer3D` (WebGL
  Canvas + STL loader) precise reinicializar contexto/recarregar geometria a cada troca. É
  necessário adicionar um `useEffect` chaveado em `mode` que chama `measure()` novamente ao voltar
  para `edit` — elementos ocultos via CSS podem reportar tamanho 0 enquanto escondidos, então o
  `ResizeObserver` sozinho não é suficiente ao reaparecer.

### OUT
- Estender o botão "Editor 2D" aos outros 18 geradores existentes (ChaveiroSimples, TampaCaneta
  etc.) — define-se aqui só o padrão, usando o Editor 2D standalone como primeiro caso de uso;
  aplicar aos demais geradores é um wish futuro.
- Pré-carregar o editor com o SVG/parâmetros de um modelo específico ao vir de um gerador — o
  editor sempre começa em branco; cada gerador tem uma estrutura de parâmetros própria e mapear
  isso para camadas editáveis é um problema à parte.
- Rota/URL de resultado dedicada e persistência de resultados por id (compartilhar link, histórico
  do navegador) — fora de escopo desta iteração.
- Qualquer um dos itens de ergonomia do canvas (reorder de camadas, limite 256×256mm, dimensões
  em tempo real, multi-seleção/alinhamento, cor refletida no canvas, atalhos de teclado) — cobertos
  em brainstorm separado, [editor2d-canvas-ergonomia](../editor2d-canvas-ergonomia/DRAFT.md).

## Approach

Um único componente (`Editor2D.tsx`) com um `useState<'edit' | 'preview'>('edit')` controlando
qual painel é renderizado. Nenhum desmonte/remonte do componente acontece ao alternar — todo o
estado de camadas, seleção e configuração de partes que já existe hoje em `useState` continua
vivo nos dois modos.

**Alternativa considerada e descartada:** rotas reais separadas (`/editor-2d` e
`/editor-2d/preview` via React Router). Teria a vantagem de funcionar com o botão "voltar" do
navegador e permitir compartilhar/persistir a URL do resultado, mas o React Router desmonta o
componente da rota anterior ao navegar — perder-se-ia todo o estado de camadas/partes ao ir para
`/editor-2d/preview` a menos que esse estado fosse içado para um Context ou store externo ao
componente. Essa complexidade extra não se paga para o problema atual (só precisamos alternar a
visualização, não navegar de verdade).

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Toggle `mode` interno via `useState`, sem rota nova | Elimina por construção o risco de perda de estado — o componente nunca desmonta |
| 2 | Escopo restrito ao Editor 2D standalone | Os outros 18 geradores têm páginas/estruturas próprias; estender o padrão a eles é decisão e trabalho separados |
| 3 | Editor sempre começa em branco (sem pré-carregar modelo) | Cada gerador existente tem um formato de parâmetros diferente; converter isso em camadas editáveis é um problema não resolvido, fora do escopo desta navegação |
| 4 | Retorno ao viewer é in-place (mesma tela), sem rota de resultado dedicada | Simplicidade — não há necessidade hoje de compartilhar/persistir um link de resultado |

## Risks & Assumptions

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| 1 | Rota real desmontaria o componente e perderia o estado de camadas | Alta (evitada por design) | Decisão 1 elimina o risco por construção — toggle interno, nunca desmonta |
| 2 | `ResizeObserver` do canvas (`Editor2D.tsx:83-98`) roda uma vez com deps `[]`; se o container fosse desmontado/remontado ao trocar de modo, o observer não seria reatado e `stageSize` ficaria congelado | Alta (confirmada por leitura do código, não hipotética) | Resolvida por design: painéis ficam sempre montados (oculto via CSS, não unmount) + `useEffect` chaveado em `mode` chamando `measure()` novamente ao entrar em `edit`, já que elementos ocultos por CSS podem reportar tamanho 0 |
| 3 | Escopo "só o Editor 2D standalone" pode gerar expectativa de que os outros geradores já ganharam o botão | Baixa | Documentado explicitamente em OUT; comunicar ao usuário que é um wish futuro |
| 4 | Manter o Viewer3D sempre montado (mesmo oculto) consome um contexto WebGL ativo mesmo durante o modo `edit` | Baixa | Aceitável para um único componente/instância; evita o custo maior de reinicializar contexto WebGL e recarregar STL a cada troca de modo |

## Success Criteria

- [ ] Modo `edit` ocupa toda a área `<main>` do `Layout` (abaixo do header) com canvas + camadas + partes, sem Viewer3D visível
- [ ] Clicar "Gerar 3D" chama o backend como hoje e, ao suceder, alterna automaticamente para o modo `preview`
- [ ] Modo `preview` mostra o Viewer3D nessa mesma área `<main>`, com o botão "Exportar 3MF" ainda disponível
- [ ] Botão "Voltar para o Editor" no modo `preview` retorna ao modo `edit` com todas as camadas, partes e seleção exatamente como estavam antes de gerar
- [ ] Ao voltar para `edit`, o canvas Konva preenche corretamente o container (sem ficar com `stageSize` congelado no tamanho anterior) — confirma que a remedição pós-toggle funciona
- [ ] QA manual: montar composição com múltiplas camadas/partes, gerar, voltar, confirmar que nada foi perdido ou resetado
- [ ] `npm run build` e `npm run lint` limpos (via `docker compose exec -T frontend`)

## Next Step

Run `/wish` to convert this design into an executable plan.
