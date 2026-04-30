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
      "name": "Altura da Base",
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

> **Nota:** todos os avisos são **não-bloqueantes** — o arquivo é gerado normalmente e os alertas aparecem no campo `warnings: []` da resposta JSON. O frontend pode exibir esses avisos ao usuário antes de fazer o download.

### 1.5 Adicione o template Bambu Studio (**obrigatório para modelos multicolor**)

Se o modelo tiver mais de uma parte/extrusor, **o `bambu_template/` é obrigatório**.
Sem ele, o backend cai no fallback via trimesh, que ignora completamente as atribuições
de extrusor — o `.3mf` exportado abrirá no Bambu Studio com todas as peças no extrusor 1.

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
| Paramétrico (texto, dimensões) | `POST /api/generate_parametric/meu_novo_modelo` |
| Upload de SVG | `POST /api/generate/meu_novo_modelo` |
| Config da UI | `GET /api/models/meu_novo_modelo/config` |

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
