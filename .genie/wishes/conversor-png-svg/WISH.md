# Wish: Conversor PNG → SVG (ferramenta standalone)

| Field | Value |
|-------|-------|
| **Status** | DRAFT |
| **Slug** | `conversor-png-svg` |
| **Date** | 2026-07-13 |
| **Author** | Vinicius Vasconcelos |
| **Appetite** | Pequena — 2 grupos de execução (backend + frontend), reaproveita pipeline potrace já existente e testado |
| **Branch** | `wish/conversor-png-svg` |
| **Repos touched** | trecoletes-3d (backend + frontend) |
| **Design** | _No brainstorm — direct wish_ |

## Summary

O backend já tem um pipeline PNG→SVG (potrace, monocromático) usado internamente por 7+ páginas
(chaveiros, topo de bolo, cortador, Editor 2D) via `/api/convert/png-to-svg`. Este wish expõe esse
pipeline como uma ferramenta standalone na seção "Testes & Ferramentas" da Home: o usuário sobe um
PNG, ajusta opcionalmente a espessura das linhas (engrossamento via dilatação morfológica antes da
vetorização) e baixa o SVG resultante. Nenhum dos 9 callers existentes do endpoint original é
tocado — a nova opção de espessura vive num endpoint novo e dedicado.

## Scope

### IN

- Nova página `frontend/src/pages/ConversorPngSvg.tsx`: upload de PNG (input de arquivo, seguindo
  o padrão hidden-input-plus-ref já usado em outras páginas), preview da imagem original, slider
  de espessura de linha (0 a 5px, default 0 = sem alteração), botão "Converter", preview do SVG
  resultante (`dangerouslySetInnerHTML`, mesmo padrão de `SvgPreviewModal.tsx` e 6+ páginas),
  botão "Baixar SVG" (download client-side, nome derivado do PNG original com extensão `.svg`).
- Nova rota `/conversor-png-svg` em `App.tsx`.
- Novo card "Conversor PNG → SVG" na seção "Testes & Ferramentas" da Home (`Home.tsx`), mesmo
  padrão visual dos cards existentes (Editor 2D, Ferramentas de Teste).
- Backend: `_png_bytes_to_svg` (`generator.py`) ganha parâmetro opcional `dilate_px: int = 0`,
  aplicando dilatação morfológica (PIL `MinFilter`) na imagem 1-bit antes de gerar o PBM/potrace,
  quando `dilate_px > 0`. Default `0` preserva byte-a-byte o comportamento atual.
- Novo endpoint dedicado `POST /api/tools/png-to-svg` (arquivo PNG + `line_thickness` opcional),
  separado do `/api/convert/png-to-svg` existente — isola o parâmetro novo dos 9 callers atuais.
- Validação client-side: rejeita arquivo que não seja PNG antes de chamar o backend.
- Tratamento de erro: PNG inválido (422) e falha de conversão (500) mostram mensagem amigável.

### OUT

- Vetorização colorida (preservar cores da imagem original) — usuário confirmou que monocromático
  atende; usar vtracer em modo cor é trabalho novo de backend fora deste escopo.
- Editar o SVG resultante no navegador (abrir no Editor 2D, manipular paths) — só download.
- Suporte a formatos de entrada além de PNG (JPG, WEBP, etc.).
- Ajuste de threshold preto/branco — mantém o valor `128` já hardcoded e usado no resto do site.
- Qualquer alteração no endpoint `/api/convert/png-to-svg` existente ou nos 9 callers que já o
  usam (`CortadorBolacha`, `CortadorBolachaFormato`, `ChaveiroSimplesSvg`, `CarimboEvaSvg`,
  `GeradorTopoBoloSvg`, `PonteiraLapisSvg`, `MexedorDrinksSvg`, `Editor2D`).

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Reaproveitar o pipeline potrace de `_png_bytes_to_svg` em vez do vtracer (colorido) | Usuário confirmou que monocromático atende; `vtracer` está no `requirements.txt` mas o código ativo (`_clean_vtracer_svg`) está morto/não referenciado — ativar vetorização colorida seria trabalho novo, não reaproveito |
| 2 | Endpoint novo (`/api/tools/png-to-svg`) em vez de adicionar `line_thickness` ao endpoint existente | Usuário pediu explicitamente uma "ferramenta separada"; isolar evita risco de regressão nos 9 call sites de frontend do endpoint HTTP existente (mais um terceiro call site interno de `_png_bytes_to_svg` em `generator.py:1616`, dentro de `/api/generate/{model_id}`) — todos precisam de saída pixel-idêntica, garantida pelo default `dilate_px=0` |
| 3 | Espessura de linha implementada como dilatação morfológica (PIL `MinFilter`) no bitmap 1-bit, antes do potrace — não como stroke-width pós-processado no SVG | Potrace gera formas preenchidas (paths fechados), não traços abertos; dilatar o bitmap fonte engrossa contornos e detalhes finos de forma confiável, e é o que o usuário pediu ("engrossar as linhas") |
| 4 | Preview do SVG via `dangerouslySetInnerHTML` | Padrão já estabelecido em `SvgPreviewModal.tsx` e replicado em 6+ páginas do site — sem necessidade de componente novo |
| 5 | Slider de espessura expõe apenas valores inteiros pré-mapeados (0–5) | `MinFilter` exige kernel ímpar; expor só inteiros simplifica a tradução para `kernel = 2*valor+1` sem validação extra no frontend |

## Success Criteria

- [ ] Upload de PNG válido mostra preview da imagem original na tela
- [ ] Slider de espessura de linha (0 a 5) disponível, default 0
- [ ] Clicar "Converter" chama o novo endpoint e mostra preview do SVG resultante
- [ ] Reconverter a mesma imagem com espessura maior (ex. 3) produz um SVG com traços
      visivelmente mais grossos que com espessura 0
- [ ] Botão "Baixar SVG" baixa um arquivo `.svg` válido (abre corretamente em navegador/editor
      vetorial)
- [ ] Upload de arquivo que não é PNG é rejeitado com mensagem clara, sem chamar o backend
- [ ] Falha do backend (ex. PNG corrompido) mostra mensagem de erro amigável, sem travar a UI
- [ ] Novo card "Conversor PNG → SVG" aparece na seção "Testes & Ferramentas" da Home e navega
      corretamente para a nova página
- [ ] Os 9 callers existentes de `/api/convert/png-to-svg` continuam com saída idêntica
      (endpoint original intocado, `dilate_px` default `0`)
- [ ] `npm run build` e `npm run lint` limpos (frontend)

## Execution Strategy

### Wave 1 (sequencial)

| Group | Agent | Description |
|-------|-------|-------------|
| 1 | engineer | Backend: `dilate_px` opcional em `_png_bytes_to_svg` + novo endpoint `/api/tools/png-to-svg` |

### Wave 2 (depois do Grupo 1)

| Group | Agent | Description |
|-------|-------|-------------|
| 2 | engineer | Frontend: página `ConversorPngSvg.tsx`, rota e card na Home |

Grupo 2 depende do endpoint do Grupo 1 já existir para integrar a chamada real; não há ganho em
paralelizar dado o tamanho pequeno do wish.

---

## Execution Groups

### Group 1: Backend — dilatação de linha + endpoint dedicado

**Goal:** Endpoint novo que converte PNG em SVG monocromático, com opção de engrossar linhas via
dilatação morfológica, sem alterar o endpoint/comportamento existente.

**Deliverables:**
1. `backend/app/api/generator.py`: `_png_bytes_to_svg` ganha parâmetro opcional
   `dilate_px: int = 0`. Quando `> 0`, após o threshold (linha ~293, antes de `.convert("1")`),
   aplica `ImageFilter.MinFilter(size=2*dilate_px+1)` na imagem em modo `"L"` (MinFilter dilata
   regiões escuras/pretas, já que preto=0 é o valor mínimo do kernel). Default `0` não deve alterar
   o SVG resultante em nenhum byte comparado ao comportamento atual.
2. `backend/app/api/generator.py`: novo endpoint `POST /api/tools/png-to-svg` — recebe `file`
   (UploadFile) e `line_thickness` (form field opcional, inteiro 0–5, default 0), valida magic
   bytes PNG (mesma checagem do endpoint existente, linha ~1378), chama
   `_png_bytes_to_svg(raw, dilate_px=line_thickness)`, retorna `Response(media_type="image/svg+xml")`
   com o mesmo tratamento de erro (422 PNG inválido, 500 falha de conversão) do endpoint existente.
3. Confirma que `/api/convert/png-to-svg` (endpoint original, linha 1371) permanece inalterado —
   sem passar `dilate_px`, comportamento idêntico ao atual.

**Acceptance Criteria:**
- [ ] `POST /api/tools/png-to-svg` com `line_thickness=0` retorna SVG byte-idêntico ao que
      `/api/convert/png-to-svg` retornaria para o mesmo PNG
- [ ] `POST /api/tools/png-to-svg` com `line_thickness=3` retorna SVG com formas visivelmente
      maiores/mais grossas que `line_thickness=0`, para a mesma imagem de entrada
- [ ] PNG inválido retorna 422 com mensagem de erro; PNG corrompido/ilegível retorna 500 com
      mensagem de erro — sem crash do processo
- [ ] Nenhuma mudança de comportamento em `/api/convert/png-to-svg` (endpoint original)

**Validation:**
```bash
docker compose exec -T backend python -c "
from app.api.generator import _png_bytes_to_svg
import io
from PIL import Image, ImageDraw
img = Image.new('L', (100, 100), 255)
draw = ImageDraw.Draw(img)
draw.line([(10, 50), (90, 50)], fill=0, width=1)
buf = io.BytesIO()
img.save(buf, format='PNG')
png_bytes = buf.getvalue()
svg0 = _png_bytes_to_svg(png_bytes, dilate_px=0)
svg3 = _png_bytes_to_svg(png_bytes, dilate_px=3)
assert svg0 != svg3, 'dilate_px=3 deveria produzir SVG diferente de dilate_px=0'
print(f'OK: svg0={len(svg0)}B svg3={len(svg3)}B')
"
docker compose restart backend
docker compose exec -T backend python -c "
import io, requests
from PIL import Image, ImageDraw
img = Image.new('L', (100, 100), 255)
ImageDraw.Draw(img).line([(10, 50), (90, 50)], fill=0, width=1)
buf = io.BytesIO()
img.save(buf, format='PNG')
png_bytes = buf.getvalue()
for thickness in (0, 3):
    r = requests.post(
        'http://localhost:8000/api/tools/png-to-svg',
        files={'file': ('teste.png', png_bytes, 'image/png')},
        data={'line_thickness': thickness},
    )
    assert r.status_code == 200, f'thickness={thickness}: {r.status_code} {r.text}'
    print(f'thickness={thickness}: {r.status_code}, {len(r.content)}B')
"
```
Roda inteiramente dentro do container (evita depender de Pillow/curl no host e de paths de arquivo
compartilhados entre host e container); usa `requests`, já em `backend/requirements.txt`.
QA manual: converter o mesmo PNG com espessura 0 e 3, comparar os SVGs num visualizador (o
segundo deve ter contornos visivelmente mais grossos). Testar um PNG já usado por uma página
existente (ex. `CarimboEvaSvg`) contra `/api/convert/png-to-svg` pra confirmar saída idêntica.

**depends-on:** none

---

### Group 2: Frontend — página, rota e card na Home

**Goal:** Ferramenta standalone acessível pela Home: upload de PNG, ajuste de espessura, preview
e download do SVG.

**Deliverables:**
1. Nova `frontend/src/pages/ConversorPngSvg.tsx`: usa `Layout` (mesmo componente das demais
   páginas), hidden `<input type="file" accept="image/png">` atrás de botão/dropzone, preview do
   PNG (`<img>` com `URL.createObjectURL`), slider de espessura (0–5, default 0), botão
   "Converter" que faz `axios.post` pro novo endpoint (`FormData` com `file` + `line_thickness`,
   `responseType: 'text'`), preview do SVG resultante via `dangerouslySetInnerHTML`, botão "Baixar
   SVG" que monta `new Blob([svgText], { type: 'image/svg+xml' })` + `URL.createObjectURL` — API
   web padrão para baixar uma string já em memória; **não** o `downloadBlob` de
   `Ferramentas.tsx:9-18` (que faz `fetch` de uma URL de servidor, sem aplicação aqui já que o SVG
   convertido só existe como string em memória) nem os usos de `new Blob(...)` já presentes em
   `CortadorBolacha.tsx`/`CarimboEvaSvg.tsx`/`MexedorDrinksSvg.tsx` (esses montam `FormData` de
   upload, não disparam download — não servem de precedente aqui, é código novo). Nome do arquivo
   = nome do PNG original trocando a extensão para `.svg`.
2. `frontend/src/App.tsx`: nova rota `<Route path="/conversor-png-svg" element={<ConversorPngSvg />} />`.
3. `frontend/src/pages/Home.tsx`: novo card na seção "Testes & Ferramentas" (mesmo padrão visual
   dos cards existentes, ex. linha ~187), linkando para `/conversor-png-svg`.
4. Validação client-side: rejeita (com mensagem, sem chamar o backend) arquivo cujo `type` não
   seja `image/png` nem extensão `.png`.
5. Tratamento de erro: exibe a mensagem de erro do backend (422/500) numa área visível, sem travar
   a UI (mesmo padrão de `alert`/estado de erro usado em `CortadorBolacha.tsx:181-183`).

**Acceptance Criteria:**
- [ ] Fluxo completo funciona: escolher PNG → preview aparece → ajustar slider → Converter →
      preview do SVG aparece → Baixar SVG → arquivo `.svg` válido é baixado
- [ ] Arquivo não-PNG é rejeitado no cliente, sem request ao backend
- [ ] Erro do backend aparece como mensagem legível na tela, sem tela branca/crash
- [ ] Card "Conversor PNG → SVG" visível na Home, seção "Testes & Ferramentas", navega
      corretamente

**Validation:**
```bash
docker compose exec -T frontend npm run build
docker compose exec -T frontend npm run lint
```
QA manual: abrir `/conversor-png-svg` no navegador, subir um PNG real, testar espessura 0 e uma
maior, baixar e abrir o SVG resultante.

**depends-on:** Group 1

---

## QA Criteria

- [ ] Fluxo completo: PNG com linhas finas → converter espessura 0 → baixar → converter espessura
      3 → baixar → confirmar visualmente que o segundo SVG tem traços mais grossos
- [ ] Regressão: nenhuma das páginas que já usam `/api/convert/png-to-svg` (chaveiros, topo de
      bolo, cortador, Editor 2D) teve o SVG gerado alterado
- [ ] Card novo navega corretamente a partir da Home e a rota funciona com reload direto na URL

---

## Assumptions / Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| `MinFilter` exige kernel ímpar — valor de espessura mal mapeado gera erro do Pillow | Baixa | Slider expõe só inteiros 0–5, traduzidos internamente para `kernel = 2*valor+1` (sempre ímpar) |
| PNGs grandes deixam o potrace lento | Média | Reaproveita o mesmo timeout de 30s já usado no endpoint existente; considerar limite de tamanho de upload no frontend (ex. 10MB) |
| Binário `potrace` no container backend | Baixa (já comprovado) | Já é dependência do endpoint existente e funciona em produção |

---

## Review Results

_Populated by `/review` after execution completes._

---

## Files to Create/Modify

```
backend/app/api/generator.py               (modify — dilate_px opcional em _png_bytes_to_svg, novo endpoint /api/tools/png-to-svg)
frontend/src/pages/ConversorPngSvg.tsx      (create — página da ferramenta)
frontend/src/App.tsx                        (modify — nova rota /conversor-png-svg)
frontend/src/pages/Home.tsx                 (modify — novo card na seção Testes & Ferramentas)
```
