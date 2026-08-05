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

### 1.2 Crie o `model.scad` (ou `model.py`)

Implemente a geometria. O arquivo receberá parâmetros via flags `-D key=value` do OpenSCAD.

- Para modelos com texto, o backend injeta `chars1`, `char_xs1`, `chars2`, `char_xs2`, `fill_gap_rects` automaticamente (ver `GAP_ENTRE_LINHAS.md`).
- Para modelos com SVG, leia `CENTRALIZACAO_SVG_OPENSCAD.md` para o padrão correto de `resize + translate`.
- Se o modelo tiver múltiplas cores/extrusores, declare cada peça como um dispatcher por `part`:
  ```openscad
  if (part == "base")    { base_3d(); }
  if (part == "letters") { letters_3d(); }
  ```

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

### 1.4 Detecção de paredes finas (recomendado)

O backend possui três mecanismos de detecção de paredes finas que retornam alertas no campo `warnings` da resposta. Para ativá-los, adicione os campos abaixo no `config.json`:

| Campo | Tipo | Quando usar |
|---|---|---|
| `min_feature_size_mm` | `number` | Sempre que o modelo tiver texto ou arte SVG. Valor recomendado: `0.8` (2 perímetros com bico 0.4 mm). |
| `thin_wall_check` | `boolean` | Modelos com texto (`text_to_svg: true`) ou partes SVG. Ativa o ray casting pós-geração na parte `letters`, `svg` ou `nome`. |
| `min_safe_mm` | `number` (por parâmetro) | Parâmetros de espessura cujo valor mínimo permitido pela UI é menor que o mínimo seguro de impressão. |

**Exemplo completo de config.json com detecção ativada:**

```json
{
  "id": "meu_novo_modelo",
  "title": { "pt": "Meu Novo Modelo", "en": "My New Model" },
  "output_format": "3mf",
  "parts": ["base", "letters"],
  "text_to_svg": true,
  "min_feature_size_mm": 0.8,
  "thin_wall_check": true,
  "parameters": [
    {
      "id": "text_size_1",
      "name": "Tamanho do Texto",
      "type": "range",
      "min": 5,
      "max": 50,
      "step": 1,
      "default": 10,
      "unit": "mm"
    },
    {
      "id": "letter_height",
      "name": "Altura do Relevo",
      "type": "range",
      "min": 0.2,
      "max": 5.0,
      "step": 0.1,
      "default": 1.2,
      "unit": "mm",
      "min_safe_mm": 0.4
    }
  ]
}
```

**Como os três mecanismos funcionam:**

- **Opção 3 — Estimativa de espessura do traço** (`text_to_svg: true` + `min_feature_size_mm`): antes de gerar, o backend estima a espessura mínima do traço como `text_size × 0.12` (conservador para fontes cursivas/display). Se essa estimativa ficar abaixo de `min_feature_size_mm`, um aviso é adicionado indicando o tamanho mínimo seguro. Executa também em cache hits (sem custo extra).

- **Opção 4 — Limiar por parâmetro** (`min_safe_mm` no parâmetro + `min_feature_size_mm`): quando um parâmetro de espessura possui `min_safe_mm` declarado e o usuário envia um valor abaixo desse limiar, o backend inclui um aviso descritivo. Útil para `letter_height`, `base_height` e similares onde o slider UI permite valores abaixo do mínimo de impressão.

- **Opção 1 — Ray casting pós-geração** (`thin_wall_check: true`): após renderizar o STL, lança 300 raios nas faces verticais da parte `letters`/`svg`/`nome` e mede a espessura real por travessia de raio. Se mais de 15% das amostras tiver espessura < `min_feature_size_mm`, um aviso é emitido. Detecta problemas que não são previsíveis por parâmetros (ex.: traços finos em SVG importado).
  **Atenção:** os nomes de parte verificados são fixos no backend —
  `letters`, `svg`, `nome` e `verso`, apenas esses. Se a sua parte com a
  arte/texto em relevo tiver outro nome (ex.: `relevo`, `arte`), o ray
  casting nunca roda e nenhum aviso é gerado, mesmo com `thin_wall_check:
  true` no `config.json`. Nesse caso, dependa só das Opções 3/4 acima, que
  funcionam com qualquer nome de parte.

> **Nota:** todos os avisos são **não-bloqueantes** — o arquivo é gerado normalmente e os alertas aparecem no campo `warnings: []` da resposta JSON. O frontend pode exibir esses avisos ao usuário antes de fazer o download.

### 1.5 Adicione o template Bambu Studio (**obrigatório para modelos multicolor**)

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

Duplique uma página existente em `frontend/src/pages/` que se assemelhe ao novo modelo:
- Modelos com texto → copiar `PonteiraLapisTexto.tsx` ou `TampaCaneta.tsx`
- Modelos com SVG → copiar `PonteiraLapisSvg.tsx` ou `CortadorBolacha.tsx`

Renomeie para `MeuNovoModelo.tsx` e troque todas as referências ao `model_id` antigo pelo novo.

#### Suporte a PNG em modelos com SVG

Todas as páginas com upload de SVG já suportam PNG nativamente. O padrão implementado em todas elas é:

1. **Backend (universal):** o endpoint `POST /api/generate_parametric/{model_id}` detecta automaticamente quando o arquivo enviado é um PNG (por magic bytes) e chama `_png_bytes_to_svg()` antes de processar. Nenhuma mudança de backend é necessária para novos modelos.

2. **Endpoint de conversão:** `POST /api/convert/png-to-svg` — recebe um PNG e retorna um SVG vetorizado via potrace, com transforms já achatados (compatível com Paper.js).

3. **Padrão frontend** — ao criar uma página para modelo com SVG, use o padrão:
   ```tsx
   const [isConvertingPng, setIsConvertingPng] = useState(false);

   const _processSvgText = async (text: string) => {
       setSvgText(text);
       // ... processSvgFile, setSvgPreview, calcular aspecto, setIsModalOpen(true)
   };

   const handleSvgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
       const file = e.target.files?.[0];
       if (!file) return;
       setSvgFile(file);
       const fileIsPng = file.name.toLowerCase().endsWith('.png') || file.type === 'image/png';
       if (fileIsPng) {
           setIsConvertingPng(true);
           try {
               const form = new FormData();
               form.append('file', file, file.name);
               const res = await axios.post<string>(
                   `${API_BASE}/api/convert/png-to-svg`, form, { responseType: 'text' }
               );
               await _processSvgText(res.data);
           } catch (err: any) {
               alert(`Erro ao converter PNG: ${err?.response?.data?.error ?? 'Falha desconhecida'}`);
           } finally {
               setIsConvertingPng(false);
           }
           return;
       }
       const reader = new FileReader();
       reader.onload = async (evt) => { await _processSvgText(evt.target?.result as string); };
       reader.readAsText(file);
   };
   ```

4. No `<input>`, use `accept=".svg,.png"` e adicione o estado de loading na UI:
   ```tsx
   <input ref={fileInputRef} type="file" className="hidden" accept=".svg,.png" onChange={handleSvgUpload} />
   {isConvertingPng ? (
       <div className="...border-amber-700/50...">
           <span className="text-amber-400 animate-pulse">Convertendo PNG para SVG...</span>
       </div>
   ) : svgPreview ? (
       // botão "clique para editar"
   ) : (
       // botão "Selecionar SVG ou PNG"
   )}
   ```

**Páginas já atualizadas:** `MexedorDrinksSvg`, `ChaveiroSimplesSvg`, `GeradorTopoBoloSvg`, `CarimboEvaSvg`, `CortadorBolacha`, `PonteiraLapisSvg`, `CortadorBolachaFormato`.

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
   docker exec trecoletes_backend openscad -o /tmp/test.stl \
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
