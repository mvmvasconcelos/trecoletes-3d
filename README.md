# Trecoletes 3D

Plataforma web para geração parametrizada de modelos 3D personalizados. O usuário preenche parâmetros simples (nome, fonte, dimensões) e recebe um arquivo `.3mf` pronto para impressão, com suporte a modelos multicolor via Bambu Studio.

## Arquitetura

- **Backend:** FastAPI + OpenSCAD headless + Python (Shapely / trimesh), rodando em container Docker.
- **Frontend:** React + TypeScript + Vite + TailwindCSS.
- **Modelos:** definidos por `config.json` + `model.scad` (ou `model.py`) em `models/<id>/`. A interface é gerada automaticamente a partir do config (Server-Driven UI).

## Modelos disponíveis

| Modelo | Descrição |
|--------|-----------|
| `chaveiro_simples` | Chaveiro com texto em relevo e argola |
| `ponteira_lapis_texto` | Ponteira de lápis com texto (nome topper) |
| `tampa_caneta` | Tampa de caneta com texto |
| `cortador_bolacha` | Cortador de biscoito a partir de SVG |
| `ponteira_lapis_svg` | Ponteira de lápis a partir de SVG |

## Instalação

### Requisitos

- [Docker](https://docs.docker.com/get-docker/) com o plugin Compose (Docker Desktop inclui ambos)
- Git

### Clonar e iniciar

```bash
git clone <url-do-repositorio>
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
