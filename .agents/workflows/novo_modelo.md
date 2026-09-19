---
description: Como criar a estrutura completa para um novo modelo 3D no projeto Trecoletes-3D
---

> No Claude Code, prefira a skill `.claude/skills/novo-modelo/SKILL.md` — ela
> cobre o mesmo fluxo, mas começa com as perguntas de decisão (tipo de arte,
> single vs multicolor, etc.) e termina com os passos de validação dentro dos
> containers (render OpenSCAD, checagem trimesh, round-trip da API, `tsc`).
> Este arquivo continua valendo como referência de campos do `config.json`.

Sempre que o usuário solicitar "Crie um novo modelo", siga rigorosamente os passos abaixo para garantir que a implementação flua perfeitamente na arquitetura (React Modular no Frontend + FastAPI/OpenSCAD no Backend via Docker):

1. **Criar o Diretório do Modelo no Backend:**
   Crie a pasta do modelo em `models/<id_do_modelo>/`. A pasta de modelos fica na raiz do projeto.

2. **Criar Arquivo `config.json`:**
   Crie o arquivo `models/<id_do_modelo>/config.json`. O FastAPI e o React leem esse arquivo de forma Server-Driven para montar a interface e executar a geração.

   Campos obrigatórios:
   ```json
   {
       "id": "meu_modelo",
       "title": { "pt": "Meu Modelo", "en": "My Model" },
       "output_format": "3mf",
       "parts": ["base", "letras"]
   }
   ```

   Campos opcionais relevantes:
   - `"text_to_svg": true` — ativa a pipeline Server-Driven de texto. O backend injeta automaticamente `chars1`, `char_xs1`, `chars2`, `char_xs2`, `fill_gap_rects` e `scale_x` no OpenSCAD. Use em modelos com texto em relevo.

   **Parâmetros principais** (campo `parameters`, fora de seções):
   ```json
   "parameters": [
       { "id": "text_line_1", "name": "Texto", "type": "text", "default": "Olá", "placeholder": "Ex: Vinicius" },
       { "id": "font_name", "name": "Fonte", "type": "select", "default": "Chewy:style=Regular", "options": [...] }
   ]
   ```

   **Seções (acordeões)** — use `sections` para agrupar parâmetros secundários:
   ```json
   "sections": [
       {
           "name": "Ajustes Finos",
           "collapsed": true,
           "parameters": [
               { "id": "base_height", "name": "Espessura da Base", "type": "range", "min": 1, "max": 10, "step": 0.1, "default": 2, "unit": "mm" }
           ]
       }
   ]
   ```
   - `"collapsed": true` — a seção inicia recolhida.

   **Tipos de parâmetro disponíveis:**
   | tipo | uso |
   |------|-----|
   | `text` | campo de texto livre |
   | `range` | slider numérico (campos: `min`, `max`, `step`, `unit`) |
   | `select` | dropdown (campo: `options: [{value, label}]`) |
   | `checkbox` | boolean |
   | `color` | seletor de cor Bambu (renderiza `BambuColorPicker`, inclui escolha de extrusor) |
   | `holes_list` | lista dinâmica de valores de tolerância (adicionar/remover itens) |

   **Tooltips e descrições em parâmetros:**
   - `"help_text": "Texto"` — exibe bolinha `?` ao lado do label com tooltip no hover (via `ParameterLabel`).
   - `"description": "Texto"` — exibe texto adicional abaixo do label.

3. **Criar o Arquivo de Modelo:**

   Crie `model.scad`. As variáveis dos parâmetros são injetadas em caixa baixa (ex: `art_width`, `base_height`). Consulte `docs/CENTRALIZACAO_SVG_OPENSCAD.md` para posicionamento correto do viewBox.

   Com `text_to_svg: true`, o backend resolve as geometrias de texto antes de chamar o OpenSCAD — não é necessário lidar com fontes dentro do `.scad`.

4. **Acrescentar Suporte a Bambu Studio (Opcional):**
   Se o modelo for multicolor, estruture `models/<id_do_modelo>/bambu_template/` com `bambu_parts_config.json` e os metadados `.config`. Consulte `docs/BAMBU_STUDIO_CONFIGURACOES.md`.

5. **Criar Página Dedicada no Frontend:**
   Crie `frontend/src/pages/<NomeEmCamelCase>.tsx` compondo os hooks
   compartilhados — não escreva o ciclo de config/params/cache/geração nem
   o switch de parâmetros na mão:

   - **`hooks/useModelGenerate.ts`** — sempre. Dá `config`, `params`/`setParam`,
     `openSections`/`toggleSection`, `isGenerating`, `error`, `files` (mapa
     genérico `{base: url, letters: url, "3mf": url, ...}`), `fromCache`/
     `isClearingCache`/`clearCache`, e `generate(requestFn)`. `requestFn(params)`
     é a própria página quem monta e devolve a promise do `axios.post` — o
     hook não sabe se por trás é `generate_parametric` (FormData de params)
     ou o `/generate` legado (upload de 2 arquivos fixos), só envolve
     `isGenerating`/`error`/`files`/`fromCache` ao redor.
   - **`hooks/useBatchGeneration.ts`** — só se o modelo tiver
     `BatchGenerationModal`. Recebe `params` e `setError` do
     `useModelGenerate` (não duplica erro próprio). Consulte `docs/GERACAO_EM_LOTES.md`.
   - **`hooks/useSvgUpload.ts`** — só se o modelo receber upload de SVG/PNG.
     Já trata conversão de PNG, preview, e trava de proporção
     artWidth/artHeight. Independente do `useModelGenerate`.
   - **`components/ui/ParameterField.tsx`** — renderiza cada parâmetro do
     `config.json` pelo `type` (text/range/color/select/checkbox — `boolean`
     é sinônimo de `checkbox`). Trata `font_name` (via `FontPicker`) e
     `type: "color"` (via `BambuColorPicker`) internamente — não escreva
     esses casos na página. Prop `accent="violet"|"emerald"` escolhe a cor
     de destaque.

   Exemplo mínimo:
   ```tsx
   const { config, params, setParam, isGenerating, error, files, fromCache,
           isClearingCache, clearCache, generate } = useModelGenerate('meu_modelo');

   const handleGenerate = () => generate(params => {
       const form = new FormData();
       Object.entries(params).forEach(([k, v]) => form.append(k, String(v ?? '')));
       return axios.post(`${API_BASE}/api/generate_parametric/meu_modelo`, form);
   });
   ```

   Páginas que usam este padrão hoje, e servem de referência:
   `PonteiraLapisTexto.tsx` (texto + lote), `CarimboRelevoSvg.tsx` (SVG via
   `generate_parametric`), `CortadorBolacha.tsx` (SVG via `/generate`
   legado, com estado extra próprio da página compondo `useSvgUpload`). As
   demais páginas em `frontend/src/pages/` escrevem o ciclo
   config/params/cache/geração diretamente, sem os hooks — não as use como
   referência para modelos novos.

   **Endpoints de geração:**
   - `POST /api/generate_parametric/{id}` — para modelos paramétricos/texto (mais comum). Recebe `FormData` com todos os parâmetros.
   - `POST /api/generate/{id}` — para modelos com upload de 2 SVGs fixos (linhas + silhueta). Recebe `FormData`.

   **Viewer 3D:**
   ```tsx
   <Viewer3D url={tmfUrl} modelType="default" />
   ```
   Valores disponíveis para `modelType`: `'cortador' | 'ponteira' | 'ferramenta' | 'default'`.

   - **`SvgPreviewModal`** — preview do SVG antes de gerar, para modelos com upload. Se conecta com `svgPreview`/`isModalOpen` do `useSvgUpload`. Veja `CortadorBolacha.tsx` como referência.
   - **`Preview2D` (Opcional):** se for necessária prévia bidimensional offline sem gerar STL, envolva a silhueta paramétrica customizada com `<Preview2D>`. Detalhes em `docs/PREVIEW_2D.md`.

   Cache já vem incluso no `useModelGenerate` (`fromCache`, `isClearingCache`,
   `clearCache`) — não reimplemente. Coloque `<ClearCacheButton>` ao lado do
   botão de gerar e `<CacheBadge fromCache={fromCache} />` perto do botão de
   download:
   ```tsx
   import { CacheBadge, ClearCacheButton } from '../components/ui/CacheControls';
   // ...
   <ClearCacheButton isClearingCache={isClearingCache} isGenerating={isGenerating} onClick={clearCache} />
   ```
   > Para alterar o visual do botão/badge, edite `frontend/src/components/ui/CacheControls.tsx`.
   > Para alterar a lógica de cache, edite `frontend/src/hooks/useCacheManagement.ts` (usado internamente pelo `useModelGenerate`).

6. **Integrar ao Roteador e à Home:**
   - Adicione o `<Route>` correspondente em `frontend/src/App.tsx` (dentro de `<BrowserRouter>`).
   - Construa um card com ícone Lucide no grid de modelos em `frontend/src/pages/Home.tsx`.

7. **Aviso ao Usuário:**
   Finalize comunicando que a estrutura ponta-a-ponta foi criada. Nenhum restart manual é necessário. Testes diretamente em `http://localhost:5173`.
