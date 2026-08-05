---
name: novo-modelo
description: Cria um novo modelo 3D paramétrico ponta-a-ponta no trecoletes-3d (backend model.scad/config.json + página frontend + rota + card na Home). Use quando o usuário pedir "crie um novo modelo", "adicionar modelo", "novo gerador 3D", ou colar um .scad/ideia de peça para transformar em modelo do site.
---

# novo-modelo — Criar modelo 3D end-to-end

Orquestra a criação completa de um modelo novo. Os detalhes técnicos de cada
campo do `config.json`, tipos de parâmetro, endpoints etc. estão em
`docs/CRIANDO_NOVO_MODELO.md` e `docs/CENTRALIZACAO_SVG_OPENSCAD.md` — **leia
esses dois arquivos antes de gerar qualquer arquivo**. Esta skill não repete
esse conteúdo; ela cobre o fluxo de decisão, as perguntas a fazer antes de
começar, e os gotchas que só aparecem na prática (validados criando o modelo
"Carimbo em Relevo SVG").

> Regra do projeto (`~/.claude/.../memory/feedback_containers_only.md`):
> **nunca** rode `openscad`, `npm`, `pip`, `tsc` etc. no host. Tudo via
> `docker exec trecoletes_backend ...` / `docker exec trecoletes_frontend ...`
> (stack dev já sobe com `docker compose up`, volumes `./models` e
> `./backend`/`./frontend` montados ao vivo — não precisa rebuildar pra
> editar `.scad`/`.json`/`.tsx`).

## Passo 0 — Perguntar antes de escrever qualquer arquivo

Use `AskUserQuestion` para fechar essas decisões (pule as que o usuário já
respondeu na própria mensagem — ex.: se ele colou um `.scad` pronto, a arte
de entrada já está implícita):

1. **Entrada da arte**: SVG (upload), texto paramétrico (fonte + tamanho), ou
   geometria pura sem arte externa?
2. **Se SVG, quantos arquivos**: 1 arquivo (padrão moderno, ver Passo 1) ou 2
   arquivos linhas+silhueta (padrão legado, só se o modelo realmente precisar
   de uma silhueta de corte separada, ex. cortador de biscoito)?
3. **Cores/partes**: peça única de uma cor, ou multicolor (quantas partes e
   quais nomes)? Isso decide se `bambu_template/` é obrigatório.
4. **Identidade**: `id` (snake_case), título pt/en, slug da rota
   (`/algo-assim`), nome do componente React.
5. **Onde entra na Home**: seção "Modelos" (emerald) ou "Testes &
   Ferramentas" (sky)?
6. **Parâmetros**: se o usuário forneceu um `.scad` de referência, os
   defaults/ranges vêm dele — só confirme quais viram sliders na UI vs ficam
   fixos no código. Se não forneceu, pergunte quais dimensões o usuário quer
   poder ajustar.

Não prossiga para os passos seguintes com suposições em pontos que mudam a
arquitetura (principalmente 2 e 3) — errar aí obriga reescrever backend e
frontend depois.

## Passo 1 — Escolher o padrão arquitetural

| Situação | Padrão a copiar | Endpoint |
|---|---|---|
| 1 SVG, peça única (sem split de cor) | `models/topo_bolo_svg/` adaptado para `parts` com **1 item só** | `/api/generate_parametric/{id}` |
| 1 SVG, 2 cores (base + arte em relevo) | `models/topo_bolo_svg/` completo (`parts: ["base","svg"]`) | `/api/generate_parametric/{id}` |
| 2 SVGs (linhas + silhueta), legado | `models/carimbo_eva_svg/` ou `models/ponteira_lapis_svg/` | `/api/generate/{id}` (upload fixo, não usa `svg_uploads`) |
| Texto em relevo (`text_to_svg`) | `models/tampa_bic/` ou `models/ponteira_lapis_texto/` | `/api/generate_parametric/{id}` |
| Geometria pura, sem SVG/texto | `models/gerador_topo_bolo/` (mínimo) | `/api/generate_parametric/{id}` |

Frontend: duplique a página mais próxima em `frontend/src/pages/` (ex.:
`GeradorTopoBoloSvg.tsx` pro caso de 1 SVG) e adapte — não escreva do zero.

## Passo 2 — Backend (`models/<id>/`)

Siga `docs/CRIANDO_NOVO_MODELO.md` §1 — inclui `svg_uploads`, o gotcha do
fluxo 3MF multipart, quando `bambu_template/` é dispensável, a whitelist de
nomes do `thin_wall_check` e a convenção de nomenclatura de eixos
(**Largura/Comprimento = X, Altura = Y, Espessura = Z**, tudo em mm — nunca
rotule uma extrusão em Z como "Altura"). Não repita esse conteúdo aqui; só o
que ainda não está documentado:

- Valide constraints geométricas reais com `assert()` no `.scad` (ex.: "a
  aba precisa ser maior que a arte + margem") — o backend propaga a mensagem
  do assert como erro 500 legível pro frontend.
- Para SVG, sempre receba `art_width`/`art_height` já calculados pelo
  frontend (ver `docs/CENTRALIZACAO_SVG_OPENSCAD.md`) — nunca recalcule
  `escala × bounding_box_bruto` dentro do `.scad`.

## Passo 3 — Frontend

Siga `docs/CRIANDO_NOVO_MODELO.md` §2. Resumo do que muda por página:

- Clone o template do Passo 1, troque o `model_id` e o endpoint.
- Peça única sem cor: remova a seção "Cores"/`BambuColorPicker` da página —
  não force um split de extrusor que a geometria não tem.
- `Viewer3D`: para peça única use `modelType="ferramenta"` e só preencha
  `carimbBaseUrl` (deixe `carimbArteUrl`/`cortadorUrl` como `null`).
- Adicione `<Route>` em `App.tsx` e o card em `Home.tsx` (seção decidida no
  Passo 0.5).

## Passo 4 — Validação obrigatória (dentro dos containers)

Não declare o modelo pronto sem rodar isto:

1. **Render direto do OpenSCAD** (pega erros de sintaxe/geometria antes de
   subir a pilha toda):
   ```bash
   docker exec trecoletes_backend openscad -o /tmp/test.stl \
     -D 'svg_linhas_path="/caminho/de/teste.svg"' \
     -D 'art_width=60' -D 'art_height=20' \
     -D 'part="<nome_da_parte>"' \
     /models/<id>/model.scad
   ```
   Precisa terminar com `Simple: yes` (malha manifold) e sem `ERROR`/`WARNING`
   de geometria.
2. **Checar a malha com trimesh** (watertight, bounding box condiz com os
   parâmetros, número de componentes desconectados faz sentido):
   ```bash
   docker exec trecoletes_backend python3 -c "
   import trimesh
   m = trimesh.load('/tmp/test.stl')
   print(m.bounds, m.is_watertight, len(m.split(only_watertight=False)))
   "
   ```
3. **Round-trip real da API**, simulando exatamente o multipart que o
   frontend manda (mesmos nomes de campo do `svg_uploads`/parâmetros):
   ```bash
   curl -s -X POST http://localhost:8000/api/generate_parametric/<id> \
     -F "svg_linhas_path=@teste.svg;filename=linhas.svg;type=image/svg+xml" \
     -F "art_width=60" -F "art_height=20" \
     -F "<outros_params>=<valor>" | python3 -m json.tool
   ```
   Confira que `files` tem as chaves esperadas (nome de cada parte + `3mf`)
   e que `error` não aparece.
4. **Force um valor inválido de propósito** (ex.: dimensão menor que o
   mínimo geométrico) e confirme que a resposta é um erro 500 com mensagem
   legível, não um crash silencioso ou geometria degenerada.
5. **TypeScript limpo**:
   ```bash
   docker exec trecoletes_frontend npx tsc --noEmit
   ```
6. **Teste no navegador** (golden path: upload → gerar → visualizar) é
   fortemente recomendado antes de reportar "pronto", mas depende do usuário
   ter um Chrome conectado à sessão — pergunte antes de tentar (há mais de
   um browser pode estar conectado; sempre confirme qual usar, nunca escolha
   sozinho). Se o usuário preferir pular, deixe explícito no resumo final que
   essa etapa não rodou.

## Passo 5 — Resumo final

Feche com uma lista curta do que foi criado/editado (arquivos) e do que foi
validado (passos do Passo 4 que rodaram, com resultado). Sem prosa extra.
