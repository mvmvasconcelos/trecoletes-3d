# Como Criar um Novo Modelo no Trecoletes 3D

Adicionar um novo modelo envolve duas partes: o **backend** (geração 3D) e o **frontend** (interface do usuário).

---

## 1. Backend

O backend descobre os modelos automaticamente pelas pastas presentes em `/models/`.

### 1.1 Crie o diretório do modelo

```
models/meu_novo_modelo/
```

Use sempre letras minúsculas e `underscores`.

### 1.2 Crie o `model.scad`

Implemente a geometria. O arquivo receberá parâmetros via flags `-D key=value` do OpenSCAD. O backend renderiza todo modelo com `openscad-nightly` (engine Manifold) — é o único engine suportado.

- Para modelos com texto, o backend injeta `chars1`, `char_xs1`, `chars2`, `char_xs2`, `fill_gap_rects` automaticamente (ver `GAP_ENTRE_LINHAS.md`).
- Para modelos com SVG, leia `CENTRALIZACAO_SVG_OPENSCAD.md` para o padrão correto de `resize + translate`.
- Se o modelo tiver múltiplas cores/extrusores, declare cada peça como um dispatcher por `part`:
  ```openscad
  if (part == "base")    { base_3d(); }
  if (part == "letters") { letters_3d(); }
  ```
- Se usar BOSL2, inclua pelo caminho **absoluto**: `include </usr/share/openscad/libraries/BOSL2/std.scad>`. O `openscad-nightly` não resolve o include relativo `<BOSL2/std.scad>` — falha silenciosamente (só warning) e qualquer módulo do BOSL2 (`cyl()`, etc.) vira indefinido, sumindo com a geometria sem erro visível.

### 1.3 Crie o `config.json`

É a definição da interface do modelo. Estrutura completa:

```json
{
  "id": "meu_novo_modelo",
  "title": {
    "pt": "Meu Novo Modelo",
    "en": "My New Model"
  },
  "output_format": "3mf",
  "parts": ["base", "letters"],
  "text_to_svg": true,
  "parameters": [
    {
      "id": "text_line_1",
      "name": "Texto",
      "type": "text",
      "default": "Exemplo"
    },
    {
      "id": "base_height",
      "name": "Espessura da Base",
      "type": "range",
      "min": 1,
      "max": 10,
      "step": 0.5,
      "default": 3.0,
      "unit": "mm"
    }
  ]
}
```

Campos obrigatórios: `id`, `title`, `output_format`, `parts`, `parameters`.
Campo `text_to_svg: true` ativa a injeção automática de posições de glifos pelo backend.

#### Nomenclatura de dimensões (convenção do projeto)

Ao nomear (`name`) qualquer parâmetro dimensional, use sempre o eixo físico
que ele afeta — nunca "Altura" para algo que na verdade é uma extrusão em Z:

| Termo na UI | Eixo | Exemplos |
|---|---|---|
| **Largura** (ou **Comprimento**) | X | `plate_width`, `aba_x` |
| **Altura** | Y | `plate_depth`, `art_height` |
| **Espessura** | Z — inclui altura de extrusão/impressão (base, texto/arte em relevo) **e** espessura de parede no plano XY (cortadores/moldes) | `base_height`, `letter_height`, `wall_thickness` |

Todas as medidas do projeto são em milímetros (`unit: "mm"`). Note que o
exemplo acima usa "Espessura da Base" para `base_height` — é uma extrusão em
Z, então nunca "Altura da Base", mesmo que o nome da variável no `.scad`
tenha "height".

#### Upload de arte SVG (`svg_uploads`)

Modelos que recebem uma arte SVG do usuário (em vez de gerá-la por texto)
declaram no `config.json`:

```json
"svg_uploads": ["svg_linhas_path"]
```

O valor é uma lista de nomes de campo — cada nome vira uma variável `-D`
injetada no `model.scad` com o caminho do arquivo normalizado (ex.:
`svg_linhas_path="/caminho/job/svg_linhas_path.svg"`). O upload é lido pelo
form-data do `POST /api/generate_parametric/{id}` com o mesmo nome de campo.
Veja `CENTRALIZACAO_SVG_OPENSCAD.md` para o padrão de `resize`/`translate`
que o `.scad` deve usar para consumir esse arquivo.

**Atenção:** `svg_uploads` só é processado no fluxo multipart 3MF do
backend — exige `"output_format": "3mf"` **e** `"parts"` não vazio (mesmo
que seja uma lista com um item só). Se o `config.json` declarar
`"output_format": "stl"` sem `parts`, o backend cai no fluxo de STL único
antigo, que **não lê nem injeta** os campos de `svg_uploads` — o SVG
enviado é silenciosamente ignorado.

Se o modelo precisar de duas artes relacionadas (ex.: linhas + silhueta de
corte, como em `carimbo_eva_svg`), use o endpoint legado dedicado
`POST /api/generate/{id}` em vez de `svg_uploads` — ver §2.1 para a
diferença entre os dois fluxos.

### 1.4 Adicione o template Bambu Studio (**obrigatório para modelos multicolor**)

Se o modelo tiver mais de uma parte/extrusor, **o `bambu_template/` é obrigatório**.
Sem ele, o backend cai no fallback via trimesh, que ignora completamente as atribuições
de extrusor — o `.3mf` exportado abrirá no Bambu Studio com todas as peças no extrusor 1.

Se o modelo tiver **uma única parte/cor**, não crie `bambu_template/` — não
há atribuição de extrusor a preservar. O backend detecta a ausência da pasta
e usa o fallback via trimesh automaticamente, sem erro nem aviso.

#### Estrutura mínima obrigatória

```
models/meu_novo_modelo/bambu_template/
├── bambu_parts_config.json
└── static/
    ├── [Content_Types].xml
    ├── _rels/
    │   └── .rels
    └── 3D/
        └── _rels/
            └── 3dmodel.model.rels
```

Copie os arquivos estáticos de qualquer modelo existente (ex.: `models/chaveiro_simples/bambu_template/static/`) — eles são idênticos entre modelos. Só adapte o `bambu_parts_config.json`:

```json
{
  "model_id": "meu_novo_modelo",
  "parts": [
    { "scad_name": "base",    "display_name": "Base",  "extruder": 1 },
    { "scad_name": "letters", "display_name": "Texto", "extruder": 2 }
  ]
}
```

O `scad_name` **deve bater exatamente** com o valor do dispatcher `part` no `model.scad`.

#### Nomes de partes e mapeamento de extrusor

O frontend envia `extrusor_base` e `extrusor_letras` para todos os modelos.
O backend mapeia automaticamente:

| Parâmetro do frontend | Chave do override | Partes cobertas |
|---|---|---|
| `extrusor_base` | `"base"` | parte `base` |
| `extrusor_letras` | `"letters"` **e** `"svg"` | partes `letters` ou `svg` |

Se a sua parte tiver **outro nome** (ex.: `arte`, `relevo`), adicione o mapeamento
em `backend/app/api/generator.py` na seção que constrói o dicionário `ov`
(busque por `extrusor_letras`).

Para adicionar um perfil de impressão completo (velocidades, filamentos, etc.),
consulte `BAMBU_STUDIO_CONFIGURACOES.md`.

---

## 2. Frontend

Com o backend configurado, os endpoints já existem automaticamente:

| Tipo de modelo | Endpoint de geração |
|---|---|
| Paramétrico (texto, dimensões, sem upload) | `POST /api/generate_parametric/meu_novo_modelo` |
| Upload de 1 arte SVG (`svg_uploads` no config, padrão atual) | `POST /api/generate_parametric/meu_novo_modelo` |
| Upload de 2 artes SVG (linhas + silhueta, endpoint legado fixo) | `POST /api/generate/meu_novo_modelo` |
| Config da UI | `GET /api/models/meu_novo_modelo/config` |

Praticamente todo modelo novo com SVG usa o mesmo endpoint genérico
`generate_parametric` — o que muda é só a declaração `svg_uploads` no
`config.json` (ver §1.3). O endpoint `POST /api/generate/{id}` é legado,
com os nomes de campo `linhas_svg`/`silhueta_svg` fixos no backend; só use
para um modelo novo se ele realmente precisar de duas artes relacionadas
(uma silhueta de corte derivada da arte principal).

### 2.1 Crie a página do gerador

Crie `frontend/src/pages/MeuNovoModelo.tsx` compondo os hooks compartilhados —
não escreva o ciclo de config/params/cache/geração nem o switch de
parâmetros na mão. Existem quatro peças reutilizáveis:

| Peça | Responsabilidade | Usa sempre? |
|---|---|---|
| `hooks/useModelGenerate.ts` | Config, `params`/`setParam`, `openSections`/`toggleSection`, `isGenerating`, `error`, `files` (mapa genérico das URLs retornadas), `fromCache`/`clearCache`, e `generate(requestFn)` | Sim, em toda página |
| `hooks/useBatchGeneration.ts` | Geração em lote + polling de `batch_status`. Recebe `params`/`setError` do `useModelGenerate` | Só se o modelo tiver `BatchGenerationModal` |
| `hooks/useSvgUpload.ts` | Upload de arte (SVG/PNG), preview, trava de proporção artWidth/artHeight | Só se o modelo receber upload de SVG |
| `components/ui/ParameterField.tsx` | Renderiza um parâmetro do `config.json` pelo `type` (text/range/color/select/checkbox — aceita `boolean` como sinônimo de `checkbox`); prop `accent="violet"\|"emerald"` escolhe a cor de destaque da página | Sim, em vez de escrever um `renderParam` próprio |

`useModelGenerate.generate(requestFn)` não sabe como a requisição é montada
— `requestFn(params)` é uma função que a própria página passa, devolvendo a
promise do `axios.post`. Isso cobre tanto o endpoint `generate_parametric`
(FormData de `params`) quanto o legado `/generate` (upload de 2 arquivos
fixos), sem a página precisar saber qual dos dois é.

```tsx
const { config, params, setParam, openSections, toggleSection,
        isGenerating, error, files, fromCache, isClearingCache, clearCache, generate,
      } = useModelGenerate('meu_novo_modelo');

const handleGenerate = () => generate(params => {
    const form = new FormData();
    Object.entries(params).forEach(([k, v]) => form.append(k, String(v ?? '')));
    return axios.post(`${API_BASE}/api/generate_parametric/meu_novo_modelo`, form);
});

// No JSX:
{config.parameters?.map(p => (
    <ParameterField key={p.id} parameter={p} value={params[p.id] ?? p.default} onChange={setParam} accent="violet" />
))}
```

`files` é um mapa genérico (`files.base`, `files.letters`, `files['3mf']`,
...) — a página só lê as chaves que o `parts` do seu modelo declara; não
declare um `useState` por parte.

Páginas que usam este padrão hoje, e servem de referência:
`PonteiraLapisTexto.tsx` (texto + lote), `CarimboRelevoSvg.tsx` (SVG via
`generate_parametric`), `CortadorBolacha.tsx` (SVG via `/generate` legado —
a mais customizada, mostra como compor `useSvgUpload` com estado extra
próprio da página, como formato de cortador). As demais páginas em
`frontend/src/pages/` escrevem o ciclo config/params/cache/geração e o
`renderParam` diretamente na página, sem os hooks — não as use como
referência para modelos novos.

#### Suporte a PNG em modelos com SVG

`useSvgUpload` já trata isso — detecta PNG (por extensão/magic bytes),
chama `POST /api/convert/png-to-svg` (vetorização via potrace) antes de
processar, e expõe `isConvertingPng` para o loading state. Nenhum código
extra é necessário na página: use `handleSvgUpload` do hook direto no
`onChange` do `<input type="file" accept=".svg,.png">`.

O componente `<Viewer3D>` aceita o prop `modelType` para ajustar as mensagens de loading:
- `'cortador'` — para cortadores de bolacha
- `'ponteira'` — para ponteiras de lápis
- `'ferramenta'` — para ferramentas de teste
- `'default'` — padrão genérico

### 2.2 Adicione a rota em `App.tsx`

```tsx
import MeuNovoModelo from './pages/MeuNovoModelo';

// Dentro de <Routes>:
<Route path="/meu-novo-modelo" element={<MeuNovoModelo />} />
```

### 2.3 Adicione o card em `Home.tsx`

Na seção "Modelos" (cor `emerald`) ou "Testes & Ferramentas" (cor `sky`):

```tsx
import { Star } from 'lucide-react'; // escolha o ícone adequado

<Link to="/meu-novo-modelo" className="group rounded-xl border border-neutral-800 bg-neutral-950 p-6 flex flex-col gap-4 hover:border-emerald-500 hover:shadow-lg hover:shadow-emerald-900/20 transition-all">
  <div className="w-12 h-12 rounded-lg bg-emerald-900/30 flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
    <Star className="w-6 h-6" />
  </div>
  <div>
    <h2 className="text-xl font-bold text-neutral-100 group-hover:text-emerald-400 transition-colors">Meu Novo Modelo</h2>
    <p className="text-neutral-500 mt-2 text-sm">Descrição curta do que o modelo gera.</p>
  </div>
</Link>
```

Para a seção "Testes & Ferramentas", substitua `emerald` por `sky` nas classes.

---

## 3. Testando antes de integrar o frontend

Nunca rode `openscad`/`npm`/`tsc` no host — sempre via `docker exec` (a
stack dev já sobe com `docker compose up`, com `./models`, `./backend` e
`./frontend` montados ao vivo). Checklist mínimo antes de considerar o
modelo pronto:

1. **Render isolado do `.scad`** — pega erro de sintaxe/geometria sem
   precisar da API:
   ```bash
   docker exec trecoletes_backend openscad-nightly -o /tmp/test.stl \
     -D 'art_width=60' -D 'art_height=20' -D 'part="minha_parte"' \
     /models/meu_novo_modelo/model.scad
   ```
   Tem que terminar em `Simple: yes` (malha manifold), sem `ERROR`.

2. **Checar a malha com trimesh** (bounding box condiz com os parâmetros
   passados, é watertight, número de componentes faz sentido):
   ```bash
   docker exec trecoletes_backend python3 -c "
   import trimesh
   m = trimesh.load('/tmp/test.stl')
   print(m.bounds, m.is_watertight)
   "
   ```

3. **Round-trip real via `curl`**, simulando o multipart que o frontend vai
   mandar (mesmos nomes de campo do `svg_uploads`/`parameters`):
   ```bash
   curl -s -X POST http://localhost:8000/api/generate_parametric/meu_novo_modelo \
     -F "art_width=60" -F "art_height=20" | python3 -m json.tool
   ```
   Confirme que `files` tem as chaves esperadas e que não veio `error`.

4. **TypeScript limpo** depois de mexer no frontend:
   ```bash
   docker exec trecoletes_frontend npx tsc --noEmit
   ```

Para o fluxo completo de perguntas + decisão de arquitetura + este
checklist, use a skill `novo-modelo` (`.claude/skills/novo-modelo/SKILL.md`).
