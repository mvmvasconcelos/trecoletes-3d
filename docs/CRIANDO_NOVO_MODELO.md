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

### 1.4 Adicione o template Bambu Studio (opcional)

Se o modelo gerar `.3mf` com configurações de impressão prontas, adicione `bambu_template/`. Veja `BAMBU_STUDIO_CONFIGURACOES.md` para o processo completo.

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
