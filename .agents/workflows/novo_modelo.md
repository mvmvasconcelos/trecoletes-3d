---
description: Como criar a estrutura completa para um novo modelo 3D no projeto Trecoletes-3D
---

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

   **Opção A — OpenSCAD** (`model.scad`): para a maioria dos modelos. As variáveis dos parâmetros são injetadas em caixa baixa (ex: `art_width`, `base_height`). Consulte `docs/CENTRALIZACAO_SVG_OPENSCAD.md` para posicionamento correto do viewBox.

   **Opção B — Python** (`model.py`): para modelos que usam Shapely + trimesh (sem OpenSCAD). Veja `models/teste_tolerancia_texto_cq/model.py` como referência. O backend detecta o engine pelo nome do arquivo.

   Com `text_to_svg: true`, o backend resolve as geometrias de texto antes de chamar o OpenSCAD — não é necessário lidar com fontes dentro do `.scad`.

4. **Acrescentar Suporte a Bambu Studio (Opcional):**
   Se o modelo for multicolor, estruture `models/<id_do_modelo>/bambu_template/` com `bambu_parts_config.json` e os metadados `.config`. Consulte `docs/BAMBU_STUDIO_CONFIGURACOES.md`.

5. **Criar Página Dedicada no Frontend:**
   Crie `frontend/src/pages/<NomeEmCamelCase>.tsx`.

   **Escolha do template base:**
   - Modelo de **texto** (com `text_to_svg: true`, endpoint paramétrico): copie `PonteiraLapisTexto.tsx` ou `TampaCaneta.tsx`.
   - Modelo de **upload SVG** (endpoint de upload): copie `CortadorBolacha.tsx` ou `PonteiraLapisSvg.tsx`.

   **Endpoints de geração:**
   - `POST /api/generate_parametric/{id}` — para modelos paramétricos/texto (mais comum). Recebe JSON com todos os parâmetros.
   - `POST /api/generate/{id}` — para modelos com upload de SVG. Recebe `FormData`.

   **Viewer 3D:**
   ```tsx
   <Viewer3D url={tmfUrl} modelType="default" />
   ```
   Valores disponíveis para `modelType`: `'cortador' | 'ponteira' | 'ferramenta' | 'default'`.

   **Componentes específicos por tipo:**

   - **`FontPicker`** — para o parâmetro `font_name` (type `select` com fontes). Renderize no `case 'select'` quando `p.id === 'font_name'`:
     ```tsx
     import { FontPicker } from '../components/ui/FontPicker';
     // ...
     if (p.id === 'font_name') return <FontPicker key={p.id} parameter={p} value={val} onChange={setParam} />;
     ```

   - **`BambuColorPicker`** — para parâmetros do tipo `color`. Renderize no `case 'color'` do switch de tipos, passando cor e número do extrusor:
     ```tsx
     import { BambuColorPicker } from '../components/ui/BambuColorPicker';
     // ...
     <BambuColorPicker label={p.name} helpText={p.help_text} color={val} extruder={extVal}
         onChangeColor={(c) => setParam(p.id, c)}
         onChangeExtruder={(e) => setParam(extField, e)} />
     ```

   - **`SvgPreviewModal`** — para modelos com upload SVG (preview antes de gerar). Use em conjunto com o endpoint `/api/generate/{id}`. Veja `CortadorBolacha.tsx` como referência.

   - **`BatchGenerationModal`** — para geração em lote. Usado nos modelos de texto (ChaveiroSimples, PonteiraLapisTexto, TampaCaneta). O botão de lote chama `POST /api/generate_batch/{id}` e faz polling em `GET /api/batch_status/{job_id}`. Consulte `docs/GERACAO_EM_LOTES.md`. Importe assim:
     ```tsx
     import { BatchGenerationModal } from '../components/ui/BatchGenerationModal';
     ```

   - **`Preview2D` (Opcional):** se for necessária prévia bidimensional offline sem gerar STL, envolva a silhueta paramétrica customizada com `<Preview2D>`. Detalhes em `docs/PREVIEW_2D.md`.

6. **Adicionar Gerenciamento de Cache (obrigatório):**
   Todo modelo deve usar o módulo de cache existente. **Nunca reimplemente na mão.**

   a. Importe o hook e os componentes:
      ```tsx
      import { useCacheManagement } from '../hooks/useCacheManagement';
      import { CacheBadge, ClearCacheButton } from '../components/ui/CacheControls';
      ```

   b. Use o hook no componente:
      ```tsx
      const { fromCache, setFromCache, isClearingCache, clearCache } = useCacheManagement();
      ```

   c. Handler de limpeza de cache (reseta URLs de resultado):
      ```tsx
      const handleClearCache = () => clearCache(() => {
          setTmfUrl(null);
      });
      ```

   d. Capture `from_cache` na resposta do endpoint de geração:
      ```tsx
      setFromCache(res.data.from_cache ?? false);
      ```

   e. Coloque `ClearCacheButton` ao lado do botão principal de gerar:
      ```tsx
      <div className="flex gap-2">
          <button onClick={handleGenerate} ...>Gerar Modelo 3D</button>
          <ClearCacheButton isClearingCache={isClearingCache} isGenerating={isGenerating} onClick={handleClearCache} />
      </div>
      ```

   f. Exiba `CacheBadge` próximo ao botão de download:
      ```tsx
      <CacheBadge fromCache={fromCache} />
      {/* Em contexto de lote (múltiplas peças): */}
      <CacheBadge fromCache={fromCache} centered />
      ```

   > Para alterar o visual do botão/badge em todos os modelos, edite `frontend/src/components/ui/CacheControls.tsx`.
   > Para alterar a lógica de cache, edite `frontend/src/hooks/useCacheManagement.ts`.

7. **Integrar ao Roteador e à Home:**
   - Adicione o `<Route>` correspondente em `frontend/src/App.tsx` (dentro de `<BrowserRouter>`).
   - Construa um card com ícone Lucide no grid de modelos em `frontend/src/pages/Home.tsx`.

8. **Aviso ao Usuário:**
   Finalize comunicando que a estrutura ponta-a-ponta foi criada. Nenhum restart manual é necessário. Testes diretamente em `http://localhost:5173`.
