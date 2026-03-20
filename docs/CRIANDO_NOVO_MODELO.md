# Como Criar um Novo Modelo no Trecoletes 3D

Com a nova arquitetura do projeto devidamente refatorada e os serviços isolados, adicionar um novo modelo gerador é um processo padronizado que envolve o **Backend** (geração 3D) e o **Frontend** (interface com o usuário).

Siga este passo a passo para integrar um novo modelo com perfeição.

## 1. Criando o Backend (Motor 3D)

O backend do Trecoletes 3D descobre os modelos automaticamente baseando-se nas pastas presentes no diretório raiz `/models/`.

### 1.1 Crie o diretório do modelo
Crie uma nova pasta com o nome do seu modelo (sempre em minúsculas e com *underscores*).
Exemplo: `/models/meu_novo_modelo`

### 1.2 Crie o arquivo `model.scad`
Dentro do diretório, crie o código fonte OpenSCAD que irá modelar o objeto.
- Utilize as variáveis injetadas pelo backend para manipular dimensões e customizações (ex: `art_width`, `art_height`).
- Certifique-se de usar a centralização recomendada em `CENTRALIZACAO_SVG_OPENSCAD.md`.
- Se o modelo conter múltiplas partes para impressão multicolorida, certifique-se de declarar as partes separadamente no código.

### 1.3 Crie o arquivo `config.json`
Este é o coração da flexibilidade do projeto! O `config.json` dita como o Frontend deve desenhar a interface e quais peças o Backend exportará.

```json
{
  "name": "Meu Novo Modelo",
  "parts": ["carimbo_base", "cortador"],
  "parameters": [
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
*Dica: Você pode estruturar os parâmetros em `sections` para gerar "accordions" expansíveis na interface UI.*

### 1.4 Adicione o Metadado Bambu Studio (Opcional)
Se desejar que o sistema gere arquivos `.3mf` nativos com perfil de configuração pronto para impressão:
- Crie o diretório `bambu_template/` dentro do diretório do seu modelo.
- Adicione o arquivo de configuração `bambu_parts_config.json` para ditar quais extrusores cuidarão de quais arquivos STLs gerados.
- Cole a pasta `static/` obtida pela engenharia reversa de um ZIP do Bambu Studio (veja `BAMBU_STUDIO_CONFIGURACOES.md`).

---

## 2. Configurando o Frontend (Interface Web)

Agora que o Backend está configurado, o modelo automaticamente possui *endpoints* válidos:
- GET `/api/models/meu_novo_modelo/config` (Fornece a UI)
- POST `/api/generate/meu_novo_modelo` (Gera as peças)

Para renderizar esses botões na tela, precisaremos atrelar uma rota no React.

### 2.1 Crie a Página do Gerador
Duplique um arquivo de gerador existente na pasta `/frontend/src/pages/` (por exemplo, `CortadorBolacha.tsx`).
- Renomeie para algo conciso como `MeuNovoModelo.tsx`.
- Modifique a classe do componente (`export default function MeuNovoModelo() { ... }`).
- Mude todas as menções de `cortador_bolacha` e strings antigas para mapear ao seu recém criado endpoint `meu_novo_modelo`.
- Verifique a injeção apropriada dos `parts` resultantes do Backend (carimbo, corte, texto, etc) dentro das propriedades do `Viewer3D`. O `<Viewer3D>` suporta tipos de renderização como `modelType="cortador"`, `"ponteira"`, ou `"ferramenta"`, que alteram dinamicamente a string exibida de "Carregando...". Se seu modelo for de outra categoria, modifique os mapeamentos lógicos no `Viewer3D.tsx`.

### 2.2 Adicione a Página ao Roteador Principal
Vá até `frontend/src/App.tsx` e inclua sua nova página nas rotas:

```tsx
import MeuNovoModelo from './pages/MeuNovoModelo';

function App() {
  return (
    <Router>
      <Routes>
        ...
        <Route path="/meu-novo-modelo" element={<MeuNovoModelo />} />
      </Routes>
    </Router>
  );
}
```

### 2.3 Exiba o Link na Home (`Vitrine`)
Por último, abra o arquivo `frontend/src/pages/Home.tsx` e adicione o cartão descritivo (`card`) para que ele seja esteticamente aparente para o usuário na página principal:

```tsx
<Link to="/meu-novo-modelo" className="group p-6 bg-neutral-900 border border-neutral-800 rounded-2xl hover:border-violet-500 transition-all cursor-pointer shadow-lg hover:shadow-violet-900/20">
  <div className="flex items-start gap-4">
    <div className="w-12 h-12 rounded-lg bg-violet-900/30 flex items-center justify-center text-violet-500 group-hover:scale-110 transition-transform">
      <Star className="w-6 h-6" /> {/* Ícone da Biblioteca Lucide */}
    </div>
    <div>
      <h2 className="text-xl font-bold text-white mb-2 group-hover:text-violet-400 transition-colors">Meu Novo Modelo</h2>
      <p className="text-sm text-neutral-400 leading-relaxed">Descrição atrativa sobre este sensacional gerador que você acaba de conceber.</p>
    </div>
  </div>
</Link>
```

Comemore! 🎉 Ao navegar em seu site, o novo modelo foi efetivamente implementado seguindo o padrão modular e reescalável do Trecoletes 3D.
