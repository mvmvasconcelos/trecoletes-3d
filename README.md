# Trecoletes 3D

Plataforma web para geração parametrizada de modelos 3D personalizados. O usuário preenche parâmetros simples (nome, fonte, dimensões) e recebe um arquivo `.3mf` pronto para impressão, com suporte a modelos multicolor via Bambu Studio.

## Arquitetura

- **Backend:** FastAPI + OpenSCAD headless (`openscad-nightly`, engine Manifold — único engine suportado) + Python (trimesh), rodando em container Docker.
- **Frontend:** React + TypeScript + Vite + TailwindCSS.
- **Modelos:** definidos por `config.json` + `model.scad` em `models/<id>/`. A interface é gerada automaticamente a partir do config (Server-Driven UI).

## Modelos disponíveis

| Modelo (`id`) | Rota | Descrição |
|---|---|---|
| `chaveiro_simples` | `/chaveiro-simples` | Chaveiro com texto em relevo e argola |
| `chaveiro_simples_com_svg` | `/chaveiro-simples-svg` | Chaveiro com texto e uma arte SVG |
| `ponteira_lapis_texto` | `/ponteira-texto` | Ponteira de lápis com texto (nome topper) |
| `ponteira_lapis_svg` | `/ponteira-svg` | Ponteira de lápis a partir de SVG |
| `tampa_bic` | `/tampa-bic` | Tampa BIC com cápsula BOSL2 e texto em duas linhas |
| `cortador_bolacha` | `/cortador-bolacha` | Cortador de biscoito a partir de SVG |
| `cortador_bolacha_formato` | `/cortador-bolacha-formato` | Cortador cuja silhueta SVG é a própria forma do cortador |
| `carimbo_eva_svg` | `/carimbo-eva-svg` | Kit de carimbo EVA (segurador, molde e forma) a partir de SVG |
| `carimbo_relevo_svg` | `/carimbo-relevo-svg` | Carimbo dobradiçado com relevo positivo e cavidade negativa |
| `gerador_topo_bolo` | `/topo-bolo` | Topo de bolo com texto em relevo |
| `topo_bolo_svg` | `/topo-bolo-svg` | Topo de bolo a partir de arte SVG |
| `mexedor_drinks_svg` | `/mexedor-drinks-svg` | Mexedor de drinks com arte SVG em relevo |
| `letreiro_social` | `/letreiro-social` | Letreiro com texto em 3 camadas de cor |
| `editor_generico` | `/editor-2d` | Camadas de texto/imagem compostas livremente pelo usuário (até 4 partes) |
| `test_holes_vertical` | `/ferramentas` | Calibrador de tolerância de furos |

## Instalação

### Requisitos

- [Docker](https://docs.docker.com/get-docker/) com o plugin Compose (Docker Desktop inclui ambos)
- Git

### Clonar e iniciar

```bash
git clone https://github.com/mvmvasconcelos/trecoletes-3d
cd Trecoletes-3D
docker compose up --build
```

Aguarde o build do backend (instala OpenSCAD e dependências Python) e o frontend instalar os pacotes npm. Na primeira execução pode levar alguns minutos.

### Acessar

- Frontend: [http://localhost:5173](http://localhost:5173)
- API (backend): [http://localhost:8000](http://localhost:8000)
- Documentação da API (Swagger): [http://localhost:8000/docs](http://localhost:8000/docs)

### Parar

```bash
docker compose down
```

## Documentação

A pasta `docs/` contém documentação técnica sobre os principais aspectos do projeto:

- `CRIANDO_NOVO_MODELO.md` — como adicionar um novo modelo ao sistema
- `BAMBU_STUDIO_CONFIGURACOES.md` — suporte a impressão multicolor
- `GERACAO_EM_LOTES.md` — geração em lote via frontend
- `FONTES_NO_OPENSCAD.md` — como fontes são gerenciadas no pipeline de texto
- `PREVIEW_2D.md` — prévia 2D em tempo real sem geração de STL
