# Wish: Conversor Imagem → SVG (aceitar mais formatos, incluindo SVG)

| Field | Value |
|-------|-------|
| **Status** | DRAFT |
| **Slug** | `conversor-imagem-svg` |
| **Date** | 2026-07-14 |
| **Author** | Vinicius Vasconcelos |
| **Appetite** | Pequena — 2 grupos de execução (backend + frontend), evolução direta da ferramenta `conversor-png-svg` já existente (ainda não commitada) |
| **Branch** | `wish/conversor-imagem-svg` |
| **Repos touched** | trecoletes-3d (backend + frontend) |
| **Design** | _No brainstorm — direct wish_ |

## Summary

**Problema:** a ferramenta "Conversor PNG → SVG" só aceita PNG como entrada.

A ferramenta "Conversor PNG → SVG" (`/conversor-png-svg`, endpoint `/api/tools/png-to-svg`) hoje só
aceita PNG. Este wish generaliza a entrada para aceitar outros formatos de imagem — rasters comuns
(JPEG, BMP, GIF, WEBP, TIFF) via Pillow, que já os lê nativamente sem dependência nova — e também
**SVG**, que precisa ser rasterizado antes de entrar no pipeline potrace existente (novo binário
`rsvg-convert` no container backend). A saída continua sendo sempre um SVG monocromático
vetorizado, com a mesma opção de espessura de linha já existente. Nenhum outro endpoint (`/api/convert/png-to-svg`
e seus 9 callers) é tocado.

## Scope

### IN

- Backend: endpoint `/api/tools/png-to-svg` renomeado para `/api/tools/image-to-svg`, aceitando
  qualquer arquivo cujo conteúdo seja detectado como um dos formatos suportados: PNG, JPEG, BMP,
  GIF, WEBP, TIFF (via Pillow) ou SVG (via detecção de XML com elemento raiz `<svg>`).
- Nova função `_svg_bytes_to_png_bytes(svg_bytes, max_size=1500)`: rasteriza SVG para PNG usando
  `rsvg-convert` (subprocess), limitando o maior lado a `max_size` px, preservando proporção. O PNG
  resultante alimenta a função existente `_png_bytes_to_svg` sem nenhuma alteração nela — zero risco
  para os 9 callers atuais e para o `dilate_px` já implementado.
- Nova função `_detect_image_kind(raw_bytes) -> "raster" | "svg" | None`: tenta parse XML seguro
  (sem resolução de entidades externas, sem rede) pra detectar SVG; senão tenta `Image.open` do
  Pillow e valida `img.format` contra a whitelist de rasters suportados.
- `backend/Dockerfile`: adiciona `librsvg2-bin` (fornece o binário `rsvg-convert`) ao `apt-get
  install` existente, junto de `openscad`/`potrace`.
- Frontend (`ConversorPngSvg.tsx`): `accept` do input de arquivo e validação client-side ampliados
  para os novos formatos (incluindo `.svg`/`image/svg+xml`); textos da UI atualizados de "PNG" para
  "imagem" onde fizer sentido (ex. "Selecionar imagem"); chamada ao backend aponta pro endpoint
  renomeado.
- Card na Home (`Home.tsx`): copy atualizado para refletir o suporte a mais formatos (mantém o
  mesmo link/rota).

### OUT

- Vetorização colorida (preservar cores) — segue fora de escopo, como no wish original
  `conversor-png-svg`.
- Suporte a PDF, HEIC/HEIF, ou formatos vetoriais além de SVG (ex. AI, EPS).
- Editar o SVG de entrada antes de reconverter (crop, redimensionar, remover camadas) — o SVG de
  entrada é rasterizado e revetorizado como está.
- Preservar texto/fontes do SVG de entrada como texto no SVG de saída — o pipeline sempre rasteriza
  e revetoriza via potrace, então texto vira contorno vetorizado (comportamento esperado e
  consistente com o resto da ferramenta).
- Renomear a rota `/conversor-png-svg` ou o arquivo `ConversorPngSvg.tsx` — troca de nome de rota
  não traz benefício funcional agora e aumentaria o escopo sem necessidade; só a copy visível muda.
- Qualquer alteração em `/api/convert/png-to-svg` (endpoint original) ou nos 9 callers que o usam.

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Renomear `/api/tools/png-to-svg` → `/api/tools/image-to-svg` | O único caller é a própria página `ConversorPngSvg.tsx`, criada nesta mesma leva de trabalho e ainda não commitada — não há risco de quebrar integração externa, e o nome antigo ficaria enganoso já que o endpoint passa a aceitar bem mais que PNG |
| 2 | SVG de entrada é rasterizado e revetorizado pelo mesmo pipeline potrace (não é feito passthrough/normalização do SVG original) | Mantém a ferramenta consistente — a opção de espessura de linha (`line_thickness`) passa a funcionar também para SVGs de entrada, e a saída sempre tem a mesma "assinatura" visual (paths monocromáticos do potrace), que é o que o usuário pediu ("reconverter para svg") |
| 3 | Rasterização de SVG via `rsvg-convert` (pacote apt `librsvg2-bin`), não `cairosvg` (pip) | `rsvg-convert` é um binário único e leve, mesmo padrão já usado no projeto pra ferramentas externas (`potrace`, `openscad` via subprocess); `cairosvg` puxaria `libcairo2`+`pango` no sistema mesmo assim, sem vantagem sobre um binário CLI direto |
| 4 | Detecção de formato por conteúdo (parse XML seguro pra SVG, `Image.open`+whitelist de `img.format` pra raster), não por extensão de arquivo ou `Content-Type` do upload | Extensão/Content-Type são preenchidos pelo cliente e não confiáveis; a validação atual do endpoint original já segue esse princípio (checa magic bytes, não a extensão) |
| 5 | Parse do SVG para detecção usa `lxml` com `resolve_entities=False` e sem rede | Evita XXE **na etapa de detecção** (`_detect_image_kind`), que só classifica o arquivo. **Isso não protege a etapa seguinte**: os mesmos bytes não confiáveis são passados via stdin para `rsvg-convert` (um parser C/Rust totalmente separado, sem relação com as flags do `lxml`), que tem histórico de CVEs de leitura de arquivo local via `<image xlink:href="file://...">` (ex. CVE-2011-3146, CVE-2018-1000041). O comportamento da versão de `librsvg2-bin` do Debian slim usada no Dockerfile precisa ser testado explicitamente contra payloads XXE/`file://` antes de considerar essa camada seguro — ver Acceptance Criteria e validação do Grupo 1 |
| 6 | `_png_bytes_to_svg` (`generator.py`) permanece intocada; toda a lógica nova vive em funções novas chamadas pelo endpoint | Isola 100% o risco da mudança — a função já é usada por 9+ callers existentes e pelo `dilate_px` recém-adicionado; qualquer regressão ali afetaria todo o site |

## Success Criteria

- [ ] Upload de JPEG, BMP, GIF, WEBP ou TIFF é aceito e convertido em SVG corretamente (mesmo
      pipeline monocromático de hoje)
- [ ] Upload de SVG é aceito, rasterizado e revetorizado, produzindo um novo SVG monocromático
      (traços do SVG original viram paths potrace)
- [ ] Slider de espessura de linha continua funcionando para todos os formatos de entrada,
      inclusive SVG
- [ ] Arquivo de formato não suportado (ex. PDF, texto puro, binário aleatório) é rejeitado com
      mensagem clara, tanto no cliente (quando detectável pela extensão/tipo) quanto no backend
      (422, sempre, como validação autoritativa)
- [ ] SVG malformado ou corrompido não derruba o backend — retorna erro amigável (422 ou 500)
- [ ] Os 9 callers existentes de `/api/convert/png-to-svg` continuam com saída idêntica (endpoint
      e função `_png_bytes_to_svg` intocados)
- [ ] `npm run build` e `npm run lint` limpos (frontend); container backend sobe normalmente após
      rebuild com `librsvg2-bin`

## Execution Strategy

### Wave 1 (sequencial)

| Group | Agent | Description |
|-------|-------|-------------|
| 1 | engineer | Backend: `rsvg-convert` no Dockerfile, detecção de formato, rasterização de SVG, endpoint renomeado |

### Wave 2 (depois do Grupo 1)

| Group | Agent | Description |
|-------|-------|-------------|
| 2 | engineer | Frontend: aceitar mais formatos no upload/validação, apontar pro endpoint renomeado, copy |

Grupo 2 depende do endpoint (novo nome e novo comportamento) do Grupo 1 já existir para integrar a
chamada real.

---

## Execution Groups

### Group 1: Backend — múltiplos formatos de entrada + rasterização de SVG

**Goal:** Endpoint `/api/tools/image-to-svg` aceita PNG/JPEG/BMP/GIF/WEBP/TIFF/SVG e sempre produz
um SVG monocromático vetorizado, reaproveitando o pipeline potrace existente sem alterá-lo.

**Deliverables:**
1. `backend/Dockerfile`: adiciona `librsvg2-bin` à linha `apt-get install` existente (junto de
   `openscad libgl1 libglu1-mesa fonts-liberation libspatialindex-dev potrace`).
2. `backend/app/api/generator.py`: nova função `_detect_image_kind(raw: bytes) -> str | None`
   (retorna `"svg"`, `"raster"` ou `None`). SVG: `lxml.etree.fromstring` com
   `XMLParser(resolve_entities=False, no_network=True)`, aceita se a tag raiz (sem namespace) for
   `svg`. Raster: `PIL.Image.open(io.BytesIO(raw))`, aceita se `img.format` estiver na whitelist
   `{"PNG", "JPEG", "BMP", "GIF", "WEBP", "TIFF"}`. Ambas as tentativas (lxml e Pillow) devem ser
   envolvidas em `try/except Exception: pass`/`continue`, retornando `None` em qualquer falha de
   parse — incluindo `lxml.etree.XMLSyntaxError`, `PIL.UnidentifiedImageError` e
   `PIL.Image.DecompressionBombError` — para que arquivo inválido/malicioso sempre vire 422 e nunca
   um 500 com traceback.
3. `backend/app/api/generator.py`: nova função `_svg_bytes_to_png_bytes(svg_bytes: bytes, max_size:
   int = 1500) -> bytes`, chama `rsvg-convert` via `subprocess.run` (stdin = svg_bytes, stdout
   capturado), limitando o maior lado da imagem rasterizada a `max_size` px mantendo proporção
   (calcular width/height a partir do `viewBox`/`width`/`height` do SVG, ou usar as flags do
   `rsvg-convert` que preservam aspect ratio automaticamente ao passar só um lado). Timeout de 30s
   (mesmo padrão do `potrace`). Erros do `rsvg-convert` (retorno != 0, timeout) levantam
   `RuntimeError` com a mensagem de erro do processo.
4. `backend/app/api/generator.py`: endpoint `/api/tools/png-to-svg` renomeado para
   `/api/tools/image-to-svg` (função Python pode ser renomeada de `tools_png_to_svg` para
   `tools_image_to_svg`). Novo fluxo:
   ```python
   raw = await file.read()
   kind = _detect_image_kind(raw)
   if kind is None:
       return 422 "Arquivo enviado não é uma imagem suportada (PNG, JPEG, BMP, GIF, WEBP, TIFF ou SVG)."
   if kind == "svg":
       try:
           raw = _svg_bytes_to_png_bytes(raw)
       except Exception as exc:
           return 422 f"SVG inválido ou não pôde ser processado: {exc}"
   try:
       svg_bytes = _png_bytes_to_svg(raw, dilate_px=line_thickness)
   except Exception as exc:
       return 500 f"Falha na conversão: {exc}"
   return Response(svg_bytes, media_type="image/svg+xml")
   ```
5. Confirma que `_png_bytes_to_svg` não sofre nenhuma alteração de assinatura ou comportamento, e
   que `/api/convert/png-to-svg` (endpoint original) permanece com o código atual.

**Acceptance Criteria:**
- [ ] `POST /api/tools/image-to-svg` com um PNG continua funcionando exatamente como
      `/api/tools/png-to-svg` funcionava (mesmo SVG de saída pro mesmo PNG + `line_thickness`)
- [ ] `POST /api/tools/image-to-svg` com JPEG, BMP, GIF, WEBP e TIFF de teste retorna 200 com SVG
      válido para cada formato
- [ ] `POST /api/tools/image-to-svg` com um SVG simples (ex. um retângulo) retorna 200 com um SVG
      de saída válido, monocromático, gerado pelo potrace (não é o SVG original ecoado de volta)
- [ ] `line_thickness` maior produz SVG com formas visivelmente mais grossas também quando a
      entrada é um SVG (confirma que a rasterização entra no mesmo pipeline de dilatação)
- [ ] Arquivo que não é nenhum dos formatos suportados (ex. um `.txt` ou PDF) retorna 422
- [ ] SVG malformado (XML quebrado) retorna 422 sem derrubar o processo/container
- [ ] SVG com `<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>` ou com
      `<image xlink:href="file:///etc/passwd">` não vaza conteúdo de arquivo local na resposta —
      testado contra o `rsvg-convert` real (não só contra a detecção `lxml`), já que é ele quem
      processa os bytes originais
- [ ] `/api/convert/png-to-svg` (endpoint original) continua com saída idêntica pros mesmos PNGs de
      teste do wish anterior

**Validation:**
```bash
docker compose build backend
docker compose up -d backend
docker compose exec -T backend which rsvg-convert

docker compose exec -T backend python -c "
import io, requests
from PIL import Image, ImageDraw

def make_png():
    img = Image.new('L', (100, 100), 255)
    ImageDraw.Draw(img).line([(10, 50), (90, 50)], fill=0, width=1)
    buf = io.BytesIO(); img.save(buf, format='PNG'); return buf.getvalue()

def make_jpeg():
    img = Image.new('RGB', (100, 100), (255,255,255))
    ImageDraw.Draw(img).rectangle([20,20,80,80], outline=(0,0,0), width=3)
    buf = io.BytesIO(); img.save(buf, format='JPEG'); return buf.getvalue()

svg_bytes = b'''<?xml version=\"1.0\"?>
<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"100\" height=\"100\" viewBox=\"0 0 100 100\">
<rect x=\"20\" y=\"20\" width=\"60\" height=\"60\" fill=\"black\"/>
</svg>'''

bad_bytes = b'not an image at all, just text'

xxe_entity_svg = b'''<?xml version=\"1.0\"?>
<!DOCTYPE svg [<!ENTITY xxe SYSTEM \"file:///etc/passwd\">]>
<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"100\" height=\"100\">
<text x=\"10\" y=\"50\">&xxe;</text>
</svg>'''

xxe_href_svg = b'''<?xml version=\"1.0\"?>
<svg xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"100\" height=\"100\">
<image xlink:href=\"file:///etc/passwd\" width=\"100\" height=\"100\"/>
</svg>'''

url = 'http://localhost:8000/api/tools/image-to-svg'

for name, content, ctype, thickness, expect in [
    ('teste.png', make_png(), 'image/png', 0, 200),
    ('teste.jpg', make_jpeg(), 'image/jpeg', 0, 200),
    ('teste.svg', svg_bytes, 'image/svg+xml', 0, 200),
    ('teste.svg', svg_bytes, 'image/svg+xml', 3, 200),
    ('teste.txt', bad_bytes, 'text/plain', 0, 422),
]:
    r = requests.post(url, files={'file': (name, content, ctype)}, data={'line_thickness': thickness})
    assert r.status_code == expect, f'{name} thickness={thickness}: esperado {expect}, veio {r.status_code} {r.text}'
    print(f'{name} thickness={thickness}: OK {r.status_code} {len(r.content)}B')

# XXE: nem o parser de deteccao nem o rsvg-convert podem vazar arquivo local.
# Aceita 200 (SVG tracado normalmente, sem o conteudo do arquivo) ou 422/500 (rejeitado),
# mas o corpo da resposta NUNCA pode conter 'root:' (marcador de /etc/passwd vazado).
for name, content in [('xxe_entity.svg', xxe_entity_svg), ('xxe_href.svg', xxe_href_svg)]:
    r = requests.post(url, files={'file': (name, content, 'image/svg+xml')}, data={'line_thickness': 0})
    assert b'root:' not in r.content, f'{name}: VAZAMENTO DE ARQUIVO LOCAL DETECTADO! status={r.status_code}'
    print(f'{name}: OK status={r.status_code}, sem vazamento, {len(r.content)}B')

# regressão: endpoint original intocado
r0 = requests.post('http://localhost:8000/api/convert/png-to-svg', files={'file': ('t.png', make_png(), 'image/png')})
assert r0.status_code == 200
print(f'/api/convert/png-to-svg regressão: OK {len(r0.content)}B')
"
```
Roda inteiramente dentro do container. QA manual: subir um SVG real (ex. exportado do
Illustrator/Inkscape ou baixado da própria ferramenta em uma conversão anterior) e confirmar que o
resultado é um SVG novo, coerente com o desenho original.

**depends-on:** none

---

### Group 2: Frontend — aceitar mais formatos, apontar pro endpoint novo

**Goal:** A página `ConversorPngSvg.tsx` aceita upload de qualquer formato suportado pelo backend
(incluindo SVG) e usa o endpoint renomeado.

**Deliverables:**
1. `frontend/src/pages/ConversorPngSvg.tsx`:
   - `accept` do `<input type="file">` ampliado:
     `image/png,image/jpeg,image/bmp,image/gif,image/webp,image/tiff,image/svg+xml,.png,.jpg,.jpeg,.bmp,.gif,.webp,.tiff,.tif,.svg`.
   - Título da página (`<Layout title="Conversor PNG → SVG">`, linha ~101) e o texto "Arquivo PNG"
     do painel lateral (linha ~106) são atualizados para "Conversor de Imagem → SVG" e "Arquivo de
     Imagem", respectivamente — mantendo o nome do arquivo/rota/componente inalterados (só copy
     visível, conforme Scope OUT).
   - `handleFileSelect`: validação client-side troca o check `isPng` por um check contra a lista de
     extensões/MIME types suportados (mesma lógica, lista maior).
   - `handleConvert`: URL do `axios.post` muda de `/api/tools/png-to-svg` para
     `/api/tools/image-to-svg`.
   - Textos da UI ("Selecionar PNG", "Arquivo PNG", mensagem de erro de tipo inválido) atualizados
     para refletir "imagem" em vez de "PNG" especificamente.
   - Preview do arquivo de entrada: `<img src={URL.createObjectURL(file)}>` já funciona tanto para
     rasters quanto para SVG (navegadores renderizam SVG normalmente em `<img>`) — não precisa de
     lógica nova de preview.
   - Nome do arquivo de download: troca a extensão original (qualquer que seja) para `.svg`, não
     só `.png` — ajustar o regex de `handleDownloadSvg` de `/\.png$/i` para remover qualquer
     extensão conhecida (`/\.(png|jpe?g|bmp|gif|webp|tiff?|svg)$/i`).
2. `frontend/src/pages/Home.tsx`: título do card (`<h2>`, linha ~212, hoje "Conversor PNG → SVG")
   atualizado para "Conversor de Imagem → SVG", e descrição do card atualizada (ex. de "Suba um
   PNG..." para "Suba uma imagem (PNG, JPEG, SVG...)..."), mantendo o mesmo link `/conversor-png-svg`.

**Acceptance Criteria:**
- [ ] Selecionar um JPEG, BMP, GIF, WEBP, TIFF ou SVG no seletor de arquivo é aceito (sem erro de
      validação client-side)
- [ ] Selecionar um arquivo de tipo não suportado (ex. `.pdf`, `.txt`) ainda é rejeitado no cliente
      com mensagem clara, sem chamar o backend
- [ ] Fluxo completo com um SVG de entrada funciona: preview aparece → Converter → preview do SVG
      de saída aparece → Baixar SVG baixa um `.svg` válido
- [ ] Erro do backend (422/500) continua aparecendo como mensagem legível (endpoint novo, mesmo
      formato de erro)
- [ ] Card da Home reflete a copy nova e continua navegando corretamente

**Validation:**
```bash
docker compose exec -T frontend npm run build
docker compose exec -T frontend npm run lint
```
QA manual: abrir `/conversor-png-svg`, testar upload de um JPEG e de um SVG reais, confirmar
preview, conversão, espessura de linha e download em ambos os casos.

**depends-on:** Group 1

---

## QA Criteria

- [ ] Fluxo completo com SVG de entrada: subir SVG → converter espessura 0 → baixar → converter
      espessura 3 → baixar → confirmar visualmente que o segundo SVG tem traços mais grossos
- [ ] Fluxo completo com JPEG/WEBP/GIF/BMP/TIFF de entrada: mesma verificação básica de
      conversão+download
- [ ] Regressão: as páginas que já usam `/api/convert/png-to-svg` (chaveiros, topo de bolo,
      cortador, Editor 2D) continuam com o SVG gerado idêntico
- [ ] SVG malformado ou arquivo de tipo inválido mostra erro amigável, sem tela branca/crash
- [ ] Container backend sobe normalmente em produção após o rebuild com `librsvg2-bin`

---

## Assumptions / Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| SVG malicioso explora `rsvg-convert` diretamente — leitura de arquivo local via `<image xlink:href="file://...">`/entidade XML (XXE), ou SSRF via `xlink:href="http://..."` — o `lxml` com `resolve_entities=False`/`no_network=True` só protege a etapa de **detecção**, não a rasterização em si, que roda no binário `rsvg-convert` (parser separado) | Alta até verificado | Testar explicitamente na validação do Grupo 1 (payloads `file://` e `http://`) contra a versão real de `librsvg2-bin` instalada; se o binário buscar/vazar conteúdo, adicionar checagem pré-rasterização que rejeita SVGs com `xlink:href`/`href` fora de `data:` URIs, ou rodar `rsvg-convert` sem acesso de rede/filesystem sensível (ex. usuário sem permissão de leitura em `/etc`, container sem egress) |
| SVG sem `viewBox`/`width`/`height` explícitos rasteriza em tamanho errado (muito pequeno ou padrão do `rsvg-convert`) | Baixa | `_svg_bytes_to_png_bytes` limita o maior lado a `max_size`, testar com SVG sem dimensões explícitas na validação |
| `librsvg2-bin` aumenta o tamanho da imagem Docker e requer rebuild em produção | Baixa | Pacote leve (não puxa X11/GTK completo); rebuild já é parte do fluxo normal de deploy do projeto |
| Imagem raster muito grande (ex. TIFF de alta resolução) deixa `rsvg-convert`/potrace lento | Média | Mesmo timeout de 30s já usado no `potrace`; considerar limite de tamanho de upload no frontend (herdado do wish anterior, ainda não implementado) |
| Raster malicioso com dimensões absurdas declaradas (TIFF/GIF/BMP) causa exaustão de memória/CPU ("decompression bomb") — superfície nova, já que o endpoint original só recebia PNGs gerados pelo próprio site | Média | Confirmar que `PIL.Image.MAX_IMAGE_PIXELS` (guard default do Pillow) não está desabilitado em nenhum ponto do código, e que `_detect_image_kind`/`_png_bytes_to_svg` capturam `DecompressionBombError` e retornam 422 em vez de derrubar o worker |

---

## Review Results

**Plan review — 2026-07-14 — SHIP** (2 rounds via subagent reviewer, `general-purpose`)

Round 1: FIX-FIRST — 2 HIGH (XXE mitigation only covered the `_detect_image_kind` parse step, not
the separate `rsvg-convert` process that handles the same untrusted bytes; missing XXE test case in
Group 1 validation), 2 MEDIUM (unclear exception handling in `_detect_image_kind`; new raster
formats widen decompression-bomb surface, not in Risk table), 3 LOW (title/copy ambiguity, missing
`.tif` in accept list, Summary not a single testable statement). All fixed directly in this WISH.md.

Round 2: SHIP — all 7 gaps verified resolved (not just text added); no new issues; structural pass
clean (balanced tables/fences, consistent `depends-on`, validation commands present for both
groups, cross-references between Decision #5/Risk table/Group 1 acceptance criteria consistent).

**Group 1 execution review — 2026-07-14 — SHIP (with one clarified false positive)**

Engineer implementation (`backend/Dockerfile`, `backend/app/api/generator.py`) verified against all
acceptance criteria by an independent reviewer subagent, including live re-testing of both XXE
payloads against the running container (no leak; `rsvg-convert` itself rejects the DOCTYPE+ENTITY
case) and format coverage (PNG/JPEG/BMP/GIF/WEBP/TIFF/SVG). `_detect_image_kind` and
`_svg_bytes_to_png_bytes` match spec exactly; endpoint rename confirmed live (`/api/tools/png-to-svg`
→ 404, `/api/tools/image-to-svg` → 200).

Reviewer initially flagged a CRITICAL finding: `_png_bytes_to_svg` (generator.py:277) differs from
`git show HEAD`, gaining a `dilate_px` param and unconditional transparency-flattening, which the
reviewer read as an undisclosed violation of Decision #6. Verified this is a false positive: both
changes predate this wish entirely — `dilate_px` shipped with the earlier `conversor-png-svg` wish's
Group 1, and the transparency-flattening was a bug fix applied and reported to the user earlier in
this same session (verified byte-identical output for opaque PNGs at the time). Neither the code nor
this wish's Group 1 engineer touched `_png_bytes_to_svg` during this wish's execution — the diff vs.
the last git commit merely reflects that none of this feature line has ever been committed. No fix
needed; Decision #6 holds for the scope of this wish.

**Group 2 execution review — 2026-07-14 — SHIP (one MEDIUM gap fixed post-review)**

Engineer implementation (`ConversorPngSvg.tsx`, `Home.tsx`) verified by an independent reviewer:
diffed against the pre-Group-2 baseline to isolate exactly what changed, independently re-ran
`npm run build` and `npm run lint` (both clean), confirmed `handleConvert`'s FormData/response/error
logic is byte-for-byte unchanged except the URL, confirmed the accept list/regex cover all 7 formats
including both `.tif`/`.tiff`, and confirmed no scope creep beyond the two target files.

Reviewer found one MEDIUM gap: three leftover PNG-specific UI strings not swept during the copy
update — the generic error fallback ("Falha desconhecida ao converter o PNG"), the preview `alt`
text, and the user-visible "Convertendo PNG para SVG..." status shown during every conversion
(including non-PNG inputs). Non-blocking (no functional criterion affected), but fixed directly
post-review since it was a trivial text change: all three now say "imagem" instead of "PNG".
Rebuilt and re-linted after the fix — both clean.

**Overall wish status: both execution groups shipped.** Backend accepts PNG/JPEG/BMP/GIF/WEBP/TIFF/SVG
via `/api/tools/image-to-svg`, rasterizing SVG input through `rsvg-convert` before feeding the
existing potrace pipeline; frontend upload/validation/copy updated to match. `_png_bytes_to_svg` and
`/api/convert/png-to-svg` (9 existing callers) confirmed untouched by this wish. Live browser
click-through was not performed by any agent (no browser automation tool in this environment) —
manual QA in-browser is the outstanding step, consistent with the wish's QA Criteria section.

---

## Files to Create/Modify

```
backend/Dockerfile                          (modify — adiciona librsvg2-bin)
backend/app/api/generator.py                (modify — _detect_image_kind, _svg_bytes_to_png_bytes, endpoint renomeado)
frontend/src/pages/ConversorPngSvg.tsx       (modify — aceita mais formatos, aponta pro endpoint novo)
frontend/src/pages/Home.tsx                  (modify — copy do card)
```
