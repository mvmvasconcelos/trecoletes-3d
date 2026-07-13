# Wish: Editor 2D em Camadas → Geração 3D

| Field | Value |
|-------|-------|
| **Status** | DRAFT |
| **Slug** | `editor-camadas-2d` |
| **Date** | 2026-07-10 |
| **Author** | Vinicius Vasconcelos |
| **Appetite** | Grande — 7 grupos de execução, 3 dependências novas (Konva, opentype.js, lib de offset poligonal) e um modelo backend novo |
| **Branch** | `wish/editor-camadas-2d` |
| **Design** | [DESIGN.md](../../brainstorms/editor-camadas-2d/DESIGN.md) |

## Summary

Construir uma nova ferramenta "Editor 2D" (Testes & Ferramentas) onde o usuário compõe camadas de texto e imagem num canvas (Konva), aplica silhueta/contorno como uma operação 2D real (não um efeito calculado no OpenSCAD), agrupa camadas em até 4 partes, e gera um `.3mf` multicor reaproveitando o `Viewer3D`/fluxo de geração já usado em todos os modelos existentes. O motor 3D (`models/editor_generico/`) fica deliberadamente "burro": só faz `resize()` + `linear_extrude()` por parte.

## Scope

### IN

- Nova página "Editor 2D" (rota + card em `Home.tsx`, seção "Testes & Ferramentas")
- Canvas interativo (Konva + react-konva): adicionar/mover/redimensionar/rotacionar camadas
- Camada de texto via opentype.js (fonte→path vetorial, client-side, fontes de `backend/static/fonts/`)
- Camada de imagem via upload SVG/PNG (reaproveita `POST /api/convert/png-to-svg`)
- Ferramenta "duplicar + silhueta/contorno": offset poligonal client-side (achatamento bezier + lib de offset, ex. Clipper), gera camada com geometria real
- Agrupamento de camadas em até 4 "partes" fixas (`part_1`..`part_4`) dentro do canvas
- Painel lateral sempre visível de altura/cor/extrusora por parte (valores padrão pré-preenchidos), reaproveitando o padrão `BambuColorPicker`
- Novo modelo backend `models/editor_generico/` (4 slots pré-registrados no `bambu_template/bambu_parts_config.json`, `model.scad` só extrude, sem `offset()`)
- Integração com `Viewer3D` (via prop `extraMeshes`) e botão "Exportar 3MF" condicionado à resposta da geração

### OUT

- Furo de argola / recursos específicos de chaveiro (iteração futura)
- Substituir ou migrar modelos existentes (`chaveiro_simples`, `cortador_bolacha`, etc.)
- Seleção de "modelo alvo" com parâmetros específicos por modelo (posição de argola, formato de furação)
- Undo/redo, templates salvos/reutilizáveis, suporte touch/mobile
- Efeitos avançados estilo Canva (sombras, gradientes, filtros, blend modes)
- Infraestrutura de testes automatizados de UI (e2e/vitest) — projeto não tem hoje; validação é build/lint + QA manual, igual ao padrão já usado no resto do frontend

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Base de canvas: Konva + react-konva | Encaixe nativo no React já usado no projeto; `Transformer`/`Layer` modelam drag/resize/rotate e camadas |
| 2 | Texto → vetor via opentype.js, client-side, fontes de `/static/fonts` | Reaproveita fontes já servidas; texto vira "só mais uma camada de path", sem depender do OpenSCAD lidar com glifos |
| 3 | Silhueta/contorno calculada 100% no browser (lib de offset poligonal); `editor_generico` nunca chama `offset()` | Motor 3D deve ser "burro" — só extrude o que recebe; contorno é camada editável, não efeito invisível no backend |
| 4 | 4 slots de parte fixos e pré-registrados (`part_1`..`part_4`), variáveis escalares via `-D` (sem array dinâmico) | `bambu_parts_config.json` só é lido como arquivo estático por modelo; array dinâmico misto nunca foi testado no `-D` do OpenSCAD; teto casa com limite de extrusoras Bambu |
| 5 | Slots com `partN_active=false` são removidos de `parts_to_render` antes de `_pack_bambu_3mf`, igual ao padrão `verso_enable` já existente | Evita STL vazio/degenerado no `.3mf` para parte não usada |
| 6 | Altura/cor/extrusora por parte vivem num painel lateral sempre visível — não no canvas 2D, não escondidas atrás do clique em "Gerar" | Reaproveita literalmente o padrão de `ChaveiroSimplesSvg.tsx`; canvas fica focado só em composição/layout |
| 7 | Sem infraestrutura de teste automatizado de UI nova; validação via `npm run build`/`lint` + QA manual documentada nos critérios de aceite | Consistente com o que o projeto já faz hoje (nenhuma suíte de testes de frontend existente) |

Decisões completas e alternativas consideradas: ver [DESIGN.md](../../brainstorms/editor-camadas-2d/DESIGN.md).

## Success Criteria

- [ ] Usuário adiciona camada de texto (fonte/tamanho configuráveis) e move/redimensiona/rotaciona no canvas
- [ ] Usuário duplica uma camada e aplica "silhueta/contorno", gerando uma nova camada com geometria expandida real (calculada no browser)
- [ ] Usuário adiciona camada de imagem (upload PNG ou SVG)
- [ ] Usuário agrupa camadas em partes no canvas; ao agrupar, o painel lateral de altura/cor por parte aparece com valores padrão, sem precisar clicar em nada
- [ ] Clicar "Gerar 3D" renderiza o mesh atualizado no `Viewer3D`, usando os valores do painel lateral
- [ ] Ajustar altura/cor de uma parte e clicar "Gerar" de novo atualiza o preview 3D
- [ ] Botão "Exportar 3MF" produz um arquivo válido que abre no Bambu Studio com as partes atribuídas aos extrusores corretos
- [ ] Um slot com `partN_active=false` nunca aparece como STL vazio no `.3mf` gerado

## Execution Strategy

| Group | Agent | Description |
|-------|-------|-------------|
| 1 | engineer | Dependências novas + scaffold da página "Editor 2D" |
| 2 | engineer | Canvas Konva + camada de imagem (upload SVG/PNG) |
| 3 | engineer | Camada de texto via opentype.js |
| 4 | engineer | Ferramenta de silhueta/contorno (offset poligonal client-side) |
| 5 | engineer | Agrupamento de camadas em partes (até 4) |
| 6 | engineer | Backend: modelo `editor_generico` |
| 7 | engineer | Painel de geração (altura/cor/extrusora) + integração `Viewer3D` + export |

**Ondas:** Wave 1 = Grupos 1 e 6 (paralelo, sem dependência mútua) → Wave 2 = Grupo 2 → Wave 3 = Grupo 3 → Wave 4 = Grupos 4 e 5 (paralelo) → Wave 5 = Grupo 7.

---

## Execution Groups

### Group 1: Dependências novas + scaffold da página
**Goal:** Preparar o terreno — instalar as libs novas e criar a página vazia navegável.

**Deliverables:**
1. Adicionar `konva`, `react-konva`, `opentype.js` (+ `@types/opentype.js` se existir) e uma lib de offset poligonal (ex. `clipper-lib`) em `frontend/package.json`
2. Nova página `frontend/src/pages/Editor2D.tsx` (esqueleto: layout com canvas vazio + sidebar), rota `/editor-2d` em `App.tsx`
3. Card "Editor 2D" em `Home.tsx`, seção "Testes & Ferramentas" (cor `sky`)

**Acceptance Criteria:**
- [ ] `npm install` resolve sem conflitos de peer dependency
- [ ] Navegar para `/editor-2d` a partir do card na Home carrega uma página sem erros no console

**Validation:**
```bash
docker compose up -d frontend  # sobe o container dev (node:20-alpine), roda npm install ao subir
docker compose exec -T frontend npm run build
docker compose exec -T frontend npm run lint
```

**depends-on:** none

---

### Group 2: Canvas Konva + camada de imagem
**Goal:** Canvas interativo funcional com upload de imagem como camada manipulável.

**Deliverables:**
1. `Stage`/`Layer` Konva com `Transformer` (mover, redimensionar, rotacionar objetos selecionados)
2. Upload de SVG/PNG como camada (reaproveita `POST /api/convert/png-to-svg` para PNG), path importado renderizado como `Konva.Path` ou `Konva.Shape` custom
3. Painel de lista de camadas (ordem, seleção, exclusão)

**Acceptance Criteria:**
- [ ] Usuário faz upload de um SVG e de um PNG; ambos aparecem como camadas manipuláveis no canvas
- [ ] Arrastar, redimensionar (handle do `Transformer`) e rotacionar uma camada funciona visualmente
- [ ] Lista de camadas reflete o que está no canvas e permite selecionar/excluir

**Validation:**
```bash
docker compose exec -T frontend npm run build
docker compose exec -T frontend npm run lint
```
QA manual: upload de um SVG e um PNG de teste; mover/redimensionar/rotacionar cada um; conferir lista de camadas.

**depends-on:** Group 1

---

### Group 3: Camada de texto via opentype.js
**Goal:** Texto vira camada de path vetorial, usando as mesmas fontes já servidas pelo backend.

**Deliverables:**
1. Utilitário que busca `.ttf` de `/static/fonts/<fonte>.ttf` (`fetch` → `arrayBuffer` → `opentype.parse`) e gera o path SVG do texto digitado
2. Ferramenta "Adicionar texto" no editor: campo de texto, seletor de fonte (mesma lista de fontes dos outros modelos), tamanho — resultado vira camada Konva igual à camada de imagem (mesma abstração do Group 2)

**Acceptance Criteria:**
- [ ] Usuário digita um texto, escolhe fonte e tamanho, e uma camada de path aparece no canvas
- [ ] A camada de texto pode ser movida/redimensionada/rotacionada como qualquer outra camada
- [ ] Trocar a fonte ou o texto atualiza o path da camada existente (não duplica)

**Validation:**
```bash
docker compose exec -T frontend npm run build
docker compose exec -T frontend npm run lint
```
QA manual: adicionar texto com 2 fontes diferentes bundled no projeto; conferir path renderizado.

**depends-on:** Group 2

---

### Group 4: Ferramenta de silhueta/contorno (offset poligonal client-side)
**Goal:** "Duplicar + silhueta" gera uma camada com geometria de contorno real, calculada no browser.

**Deliverables:**
1. Pré-processamento de achatamento de curvas bezier (reaproveitar `simplify()`/`flatten()` do paper.js, já usado como utilitário headless em `svgProcessor.ts` — não como canvas interativo) aplicado a **todo** path antes do offset
2. Integração da lib de offset poligonal (Clipper ou equivalente) para expandir o path achatado por uma margem configurável
3. Ação "Duplicar + silhueta" na UI: duplica a camada selecionada e aplica o offset, criando uma nova camada editável

**Acceptance Criteria:**
- [ ] Selecionar uma camada de texto, clicar "Duplicar + silhueta" com margem de 2mm produz uma nova camada com contorno visivelmente expandido ao redor do texto original
- [ ] O mesmo funciona para uma camada de imagem importada
- [ ] Um path complexo (fonte decorativa ou imagem traçada com muitos vértices, ordem de ~1000-2000 vértices — mesma faixa dos SVGs de `cortador_bolacha` processados por `svgProcessor.ts`) completa o cálculo de silhueta em poucos segundos, sem travar a aba; achatamento roda antes do offset em todos os casos

**Validation:**
```bash
docker compose exec -T frontend npm run build
docker compose exec -T frontend npm run lint
```
QA manual: testar com texto em fonte decorativa (ex. Bangers) e com um PNG traçado; conferir que o contorno gerado é visualmente correto e que o browser não trava.

**depends-on:** Group 2, Group 3

---

### Group 5: Agrupamento de camadas em partes
**Goal:** Usuário atribui camadas a até 4 partes (estrutura, sem altura/cor ainda).

**Deliverables:**
1. UI de agrupamento no painel de camadas: atribuir cada camada a `part_1`..`part_4` (ou "sem parte")
2. Validação: no máximo 4 partes distintas em uso; camadas sem parte atribuída não entram na geração
3. Estrutura de dados exportável: lista de partes ativas, cada uma referenciando os paths (já achatados pelo Group 4, quando aplicável) das camadas atribuídas — a serialização final para arquivo SVG acontece no Group 7, ao montar a requisição de geração

**Acceptance Criteria:**
- [ ] Usuário atribui camadas (ex.: texto + silhueta) à mesma parte e outra camada (imagem) a uma parte diferente
- [ ] Tentar usar uma 5ª parte é bloqueado na UI com mensagem clara
- [ ] Ao final do agrupamento, existe uma estrutura em memória com até 4 partes, cada uma referenciando os paths (já achatados) das camadas atribuídas — pronta para o Group 7 serializar em SVG

**Validation:**
```bash
docker compose exec -T frontend npm run build
docker compose exec -T frontend npm run lint
```
QA manual: montar composição com 3 camadas em 2 partes; confirmar bloqueio ao tentar uma 5ª parte.

**depends-on:** Group 2, Group 3

---

### Group 6: Backend — modelo `editor_generico`
**Goal:** Novo modelo backend genérico com 4 slots de parte fixos, motor 3D que só extrude.

**Deliverables:**
1. `models/editor_generico/config.json` (id, title, output_format `3mf`, parts `part_1`..`part_4`)
2. `models/editor_generico/model.scad`: para cada slot ativo, `resize()` + `linear_extrude(height = partN_height) import(partN_svg)` — nenhuma chamada a `offset()`
3. `models/editor_generico/bambu_template/` (estrutura mínima obrigatória, `bambu_parts_config.json` com os 4 `scad_name` `part_1`..`part_4` pré-registrados e extrusor default)
4. No handler de request (`backend/app/api/generator.py`), filtrar `parts_to_render` removendo slots com `partN_active=false` antes de `_pack_bambu_3mf`, seguindo o padrão `verso_enable` (linha ~1670)
5. Script de validação `backend/test_editor_generico.py` (mesmo padrão de `test_api.py`): POST com 2 partes ativas + 2 inativas, assert `.3mf` retornado e sem STL vazio

**Acceptance Criteria:**
- [ ] `POST /api/generate_parametric/editor_generico` com 2 partes ativas retorna um `.3mf` válido com exatamente 2 partes, cada uma no extrusor esperado
- [ ] Uma parte com `partN_active=false` não aparece no `.3mf` (nem como STL vazio, nem como parte fantasma)
- [ ] `model.scad` não contém nenhuma chamada a `offset()`

**Validation:**
```bash
# Sintaxe real do .scad (compila a árvore CSG, não roda ast.parse — .scad não é Python)
# Caminho é /models (mount do container, não /app/models) e o OpenSCAD 2021.01 deste
# ambiente exige --export-format explícito para inferir o formato ao exportar para /dev/null
docker compose exec -T backend openscad --export-format stl -o /dev/null /models/editor_generico/model.scad

# Garante que nenhuma chamada a offset() foi introduzida no motor genérico
! grep -q "offset(" models/editor_generico/model.scad || { echo "FAIL: offset() encontrado em model.scad"; exit 1; }

# Com o servidor rodando (docker compose up):
docker compose exec -T backend python3 test_editor_generico.py
```

**depends-on:** none

---

### Group 7: Painel de geração + integração `Viewer3D` + export
**Goal:** Fechar o fluxo: painel lateral sempre visível, "Gerar 3D" chama o backend e atualiza o `Viewer3D`, botão de exportação.

**Deliverables:**
1. Painel lateral (sempre visível assim que há partes agrupadas) com altura + `BambuColorPicker` (cor/extrusora) por parte ativa, valores padrão pré-preenchidos
2. `handleGenerate`: monta `FormData` serializando os paths achatados de cada parte (estrutura produzida pelo Group 5) em arquivos SVG (`part1_svg`..`part4_svg`), mais `partN_active`/`partN_height` (do painel), e chama `POST /api/generate_parametric/editor_generico`. Cor/extrusora por parte vai no campo `extrusor_partN` (`extrusor_part1`..`extrusor_part4`, N = 1..4) — mecanismo adicionado ao `ov` dict em `generator.py` (~linha 1804) e **verificado end-to-end** nesta sessão (override de extrusor confirmado funcionando, testado com `extrusor_part1=4` sobrescrevendo o default 1 de `bambu_parts_config.json`)
3. `Viewer3D` recebe as URLs de STL retornadas via prop `extraMeshes` (cor por parte vinda do painel)
4. Botão "Exportar 3MF", visível apenas quando a resposta trouxer a URL do `.3mf` (mesmo padrão `tmfUrl &&` dos outros modelos)

**Acceptance Criteria:**
- [ ] Com uma composição de 2 partes agrupada, clicar "Gerar 3D" exibe o preview 3D com as 2 partes nas cores escolhidas
- [ ] Ajustar altura ou cor de uma parte e clicar "Gerar" novamente atualiza o preview
- [ ] Botão "Exportar 3MF" baixa um `.3mf` que abre corretamente no Bambu Studio (ou é inspecionável como zip válido com as partes esperadas)

**Validation:**
```bash
docker compose exec -T frontend npm run build
docker compose exec -T frontend npm run lint
```
QA manual: fluxo completo ponta-a-ponta (texto + silhueta + imagem → 2 partes → gerar → ajustar cor → gerar de novo → exportar).

**depends-on:** Group 4, Group 5, Group 6

## Files to Create/Modify

**Frontend (novo):**
- `frontend/src/pages/Editor2D.tsx`
- `frontend/src/components/editor2d/` — Canvas, painel de camadas, painel de geração (Groups 2, 3, 5, 7)
- `frontend/src/lib/textToPath.ts` (opentype.js) e `frontend/src/lib/polygonOffset.ts` (Clipper + reuso de flatten/simplify) — nomes ilustrativos, Groups 3 e 4

**Frontend (modificar):**
- `frontend/package.json` (Group 1: novas dependências)
- `frontend/src/App.tsx` (Group 1: rota)
- `frontend/src/pages/Home.tsx` (Group 1: card)

**Backend (novo):**
- `models/editor_generico/config.json`
- `models/editor_generico/model.scad`
- `models/editor_generico/bambu_template/bambu_parts_config.json` (+ `static/` copiado de um modelo existente)
- `backend/test_editor_generico.py`

**Backend (modificar):**
- `backend/app/api/generator.py` (Group 6: filtro de `parts_to_render` para `partN_active=false`)

## Assumptions / Risks

Ver tabela completa de riscos em [DESIGN.md](../../brainstorms/editor-camadas-2d/DESIGN.md#risks--assumptions). Destaques mais relevantes para execução:

- **Sem safety net no backend**: o `.3mf` final usa a geometria exatamente como calculada no browser (Group 4) — bugs no offset client-side vão direto pro resultado, sem recomputação no servidor.
- **Achatamento bezier é obrigatório, não opcional**: Clipper (ou lib equivalente) só entende segmentos de reta — todo path (texto ou imagem) precisa passar pelo `simplify()`/`flatten()` antes do offset (Group 4).
- **Dependências novas sem tipos TS oficiais**: `opentype.js` e a lib de offset escolhida podem exigir tipagem manual (Group 1).

## QA Criteria

Após merge, validar em ambiente de dev:
- [ ] Fluxo completo (texto → silhueta → imagem → agrupar em partes → gerar → ajustar → exportar) funciona sem erros no console
- [ ] `.3mf` exportado abre no Bambu Studio com as partes no extrusor correto
- [ ] Composição com apenas 1 parte ativa (as outras 3 slots inativos) gera corretamente, sem STL vazio
- [ ] Card "Editor 2D" aparece corretamente na Home, seção "Testes & Ferramentas"
