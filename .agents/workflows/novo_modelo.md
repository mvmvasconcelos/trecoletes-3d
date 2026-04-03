---
description: Como criar a estrutura completa para um novo modelo 3D no projeto Trecoletes-3D
---

Sempre que o usuário solicitar "Crie um novo modelo", siga rigorosamente os passos abaixo para garantir que a implementação flua perfeitamente na nova arquitetura (React Modular no Frontend + FastAPI/OpenSCAD no Backend via Docker):

1. **Criar o Diretório do Modelo no Backend:**
   Crie a pasta do modelo em `models/<id_do_modelo>`. (Observe que a pasta de modelos agora repousa na raiz do projeto).
    
2. **Criar Arquivo config.json:**
   Crie o arquivo `models/<id_do_modelo>/config.json`.
   Preencha com o `name`, os arquivos resultantes em `parts` (ex: "carimbo_base", "cortador") e os `parameters` necessários. O FastAPI e o React vão ler essas propriedades de forma Server-Driven.
   - **Tooltips:** Nos parâmetros dinâmicos de interface, adicione um `"help_text": "Sua explicação"`, e a UI global adotará de imediato uma bolinha `?` com informações no hover.
   - **Abas Fechadas:** Nas seções (caso utilize UI com sanfonas para subdividir comandos), passe `"collapsed": true` se quiser que aquela sessão inicie recolhida por padrão na visualização do usuário.
    
3. **Criar Arquivo model.scad:**
   Crie o arquivo `models/<id_do_modelo>/model.scad`.
   Elabore a geometria 3D OpenSCAD. Utilize as variáveis injetadas em caixa baixa (ex: `art_width`, `art_height`, `line_offset`). Pautar-se pelo documento `docs/CENTRALIZACAO_SVG_OPENSCAD.md` para evitar distorções no viewBox.
    
4. **Acrescentar Suporte a Bambu Studio (Opcional):**
   Se o modelo for multicores (ex: text topper), estruture a pasta `models/<id_do_modelo>/bambu_template/` e adicione o `bambu_parts_config.json` e os metadados nativos `.config`. Leia `docs/BAMBU_STUDIO_CONFIGURACOES.md` em caso de dúvidas.

5. **Criar Página Dedicada no Frontend:**
   Crie o componente da página em `frontend/src/pages/<NomeEmCamelCase>.tsx` (ex: `MeuNovoModelo.tsx`).
   - Use páginas análogas como `CortadorBolacha.tsx` ou `PonteiraLapisSvg.tsx` como esqueleto.
   - Atualize os endpoints de API para `/api/generate/<id_do_modelo>`.
   - Ajuste o componente de renderização 3D informando: `<Viewer3D [...] modelType="default" />` (para loadings exclusivos, adicione um novo mapping dentro da inteface do Viewer).
    
6. **Adicionar Gerenciamento de Cache (obrigatório):**
   Todo modelo deve usar o módulo de cache existente. **Nunca reimplemente na mão.**

   No arquivo `.tsx` da página:

   a. Importe o hook e os componentes:
      ```tsx
      import { useCacheManagement } from '../hooks/useCacheManagement';
      import { CacheBadge, ClearCacheButton } from '../components/ui/CacheControls';
      ```

   b. Use o hook no componente:
      ```tsx
      const { fromCache, setFromCache, isClearingCache, clearCache } = useCacheManagement();
      ```

   c. Crie o handler que reseta os URLs do modelo ao limpar cache:
      ```tsx
      const handleClearCache = () => clearCache(() => {
          setTmfUrl(null); // reset todos os URLs de resultado
      });
      ```

   d. Capture `from_cache` na resposta do endpoint `/api/generate/<id>`:
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

   > Para alterar o visual do botão/badge em todos os modelos de uma vez, edite `frontend/src/components/ui/CacheControls.tsx`.
   > Para alterar a lógica (ex: endpoint da API), edite `frontend/src/hooks/useCacheManagement.ts`.

7. **Integrar ao Roteador e Visagismo:**
   - Adicione o mapeamento `Route` da URL no `frontend/src/App.tsx`.
   - Construa um Card UI com ícones Lucide no grid mestre da `frontend/src/pages/Home.tsx`.

8. **Aviso ao Usuário:**
   Finalize comunicando que a estrutura ponta-a-ponta foi costurada, não sendo necessário restart manual do front/backend. Instigue testes diretamente em `http://localhost:5173`.
