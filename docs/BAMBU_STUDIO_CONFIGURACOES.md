# Configurações do Bambu Studio no 3MF Gerado

Este documento explica como as configurações de impressão do Bambu Studio foram integradas
ao arquivo `.3mf` gerado automaticamente pelo site, e como atualizar essas configurações
no futuro sem precisar modificar código.

---

## Por que isso foi necessário

O backend gerava o `.3mf` usando a biblioteca Python **trimesh**, que produz um arquivo
válido pelo padrão 3MF mas completamente anônimo: sem perfil de impressão, sem atribuição
de extrusor por peça, sem configurações de filamento. Ao abrir no Bambu Studio, todas as
configurações precisavam ser refeitas manualmente a cada download.

---

## Engenharia Reversa do Formato .3mf

O formato `.3mf` é, essencialmente, um **arquivo ZIP** com extensão renomeada. Basta
descomprimi-lo para inspecionar todos os arquivos internos.

### Como foi feita a análise

1. O site gerou um `.3mf` via trimesh.
2. Esse arquivo foi aberto no **Bambu Studio**, onde foram configurados:
   - Perfil de impressora (A1)
   - Perfil de impressão (0.20mm Standard)
   - Perfis de filamento (PLA - Elegoo + Generic PLA)
   - Atribuição de extrusor (slot do AMS) por peça
   - Opções de fatiamento (densidades, padrões de preenchimento, etc.)
3. O projeto foi salvo (`Arquivo → Salvar Projeto`), gerando um novo `.3mf`.
4. Esse `.3mf` foi descomprimido e os arquivos internos foram comparados com o original.

### O que o Bambu Studio adicionou

Comparando os dois arquivos ZIP:

| Arquivo adicionado/modificado | O que contém |
|---|---|
| `Metadata/project_settings.config` | **Todo o perfil de impressão** (temperaturas, velocidades, suporte, preenchimento, G-code de máquina, configurações de filamento, etc.) |
| `Metadata/model_settings.config` | Configurações por objeto (qual extrusor usa cada peça, matriz de transformação Z) |
| `Metadata/filament_sequence.json` | Sequência de troca dos filamentos por placa |
| `Metadata/slice_info.config` | Versão do Bambu Studio usado para fatiar |
| `Metadata/plate_1.png` etc. | Thumbnails do fatiamento (imagem de preview) |

---

## Modelos com Suporte a Bambu Studio

Atualmente os seguintes modelos possuem `bambu_template/` configurado:

| Pasta do modelo | Partes |
|---|---|
| `models/chaveiro_simples/` | `base` (extrusor 1), `letters` (extrusor 2) |
| `models/cortador_bolacha/` | `carimbo_base` (3), `carimbo_arte` (3), `cortador` (3) |
| `models/ponteira_lapis_texto/` | `base` (extrusor 3), `letters` (extrusor 1) |
| `models/tampa_caneta/` | `base` (extrusor 3), `letters` (extrusor 1) |
| `models/topo_bolo_svg/` | `base` (extrusor 1), `svg` (extrusor 4) |

---

## Estrutura de Arquivos do Template

Usando `cortador_bolacha` como exemplo:

```
models/cortador_bolacha/bambu_template/
│
├── bambu_parts_config.json          ← EDITÁVEL: define extrusor e nome por peça
│
└── static/                          ← arquivos copiados literalmente para todo .3mf gerado
    ├── [Content_Types].xml          ← declaração dos tipos MIME do pacote ZIP
    ├── _rels/
    │   └── .rels                    ← ponto de entrada do pacote 3MF
    ├── 3D/
    │   └── _rels/
    │       └── 3dmodel.model.rels   ← relacionamento entre os arquivos 3D
    └── Metadata/
        ├── project_settings.config  ← EDITÁVEL: perfil de impressão completo
        ├── filament_sequence.json   ← sequência dos filamentos
        └── slice_info.config        ← versão do slicer (informativo)
```

Os seguintes arquivos são **gerados dinamicamente** a cada job (não existem no template):

| Arquivo gerado | Conteúdo |
|---|---|
| `3D/Objects/object_1.model` | Geometria 3D real das peças (vértices + triângulos) |
| `3D/3dmodel.model` | Estrutura de montagem (quais objetos compõem o modelo) |
| `Metadata/model_settings.config` | Configurações por peça com os offsets Z calculados das malhas |

---

## Como Atualizar o Perfil de Impressão

### Método recomendado: via Bambu Studio

Este é o fluxo correto para atualizar as configurações sempre que precisar trocar
impressora, filamento, perfil de impressão ou qualquer outra configuração de fatiamento.

**Passo a passo:**

1. **Baixe um `.3mf` gerado pelo site** (qualquer geração recente serve, pois a geometria
   não importa para este processo).

2. **Abra no Bambu Studio** (`Arquivo → Abrir`).

3. **Faça todas as alterações desejadas:**
   - Troque o perfil de impressora (ex: de A1 para X1C)
   - Troque os perfis de filamento
   - Ajuste velocidades, densidades de preenchimento, etc.
   - Reatribua os filamentos do AMS às peças se necessário

4. **Salve o projeto** (`Ctrl+S` ou `Arquivo → Salvar Projeto`).
   O arquivo será salvo como `.3mf`.

5. **Descomprima o `.3mf` salvo** — basta renomear para `.zip` e extrair, ou usar
   qualquer ferramenta de compressão (7-Zip, WinRAR, etc.).

6. **Copie os arquivos atualizados** para o template do modelo desejado:

   | Arquivo extraído do .3mf | Destino no projeto |
   |---|---|
   | `Metadata/project_settings.config` | `models/<modelo>/bambu_template/static/Metadata/project_settings.config` |
   | `Metadata/filament_sequence.json` | `models/<modelo>/bambu_template/static/Metadata/filament_sequence.json` |
   | `Metadata/slice_info.config` | `models/<modelo>/bambu_template/static/Metadata/slice_info.config` |

7. **Reinicie o backend** para garantir que o próximo job use os novos arquivos:
   ```bash
   docker compose restart backend
   ```

> **Nota:** Não é necessário copiar os arquivos `Metadata/plate_*.png` nem
> `Metadata/cut_information.xml` — esses são específicos da geometria fatiada e
> o Bambu Studio os regenera ao fatiar o novo projeto.

---

## Como Mudar o Extrusor por Peça (Sem Bambu Studio)

Edite o arquivo `bambu_parts_config.json` do modelo:

```json
{
  "parts": [
    {
      "scad_name": "base",
      "display_name": "Base",
      "extruder": 3
    },
    {
      "scad_name": "letters",
      "display_name": "Letras",
      "extruder": 1
    }
  ]
}
```

- `scad_name`: nome da parte conforme definido no OpenSCAD (não alterar)
- `display_name`: nome que aparece no Bambu Studio ao abrir o arquivo
- `extruder`: número do slot do AMS (1–4) ou extrusor único (1)

A mudança entra em vigor imediatamente no próximo job — **não é necessário reiniciar
o Docker** para alterações neste arquivo.

> **Importante — mapeamento de `extrusor_letras`:** o frontend envia os parâmetros
> `extrusor_base` e `extrusor_letras` para todos os modelos. No backend
> (`generator.py`), `extrusor_letras` é mapeado simultaneamente para as chaves
> `"letters"` **e** `"svg"` do dicionário de overrides. Portanto:
> - Modelos com parte chamada `letters` → recebem o override automaticamente.
> - Modelos com parte chamada `svg` (ex.: `topo_bolo_svg`) → também recebem.
> - Se criar um novo modelo com **nome de parte diferente** (ex.: `arte`, `relevo`),
>   será necessário adicionar o mapeamento correspondente na função que monta `ov`
>   em `backend/app/api/generator.py` (busque por `extrusor_letras`).

---

## Como Adicionar Suporte a Outro Modelo

Se criar um novo modelo e quiser que ele gere `.3mf` com configurações Bambu Studio:

1. Crie a estrutura de diretórios:
   ```
   models/<novo_modelo>/bambu_template/
   └── static/
       ├── [Content_Types].xml
       ├── _rels/.rels
       ├── 3D/_rels/3dmodel.model.rels
       └── Metadata/
           ├── project_settings.config
           ├── filament_sequence.json
           └── slice_info.config
   ```

2. Copie os arquivos estáticos de `models/cortador_bolacha/bambu_template/static/` como
   ponto de partida e adapte o `project_settings.config` se necessário.

3. Crie o `bambu_parts_config.json` com as partes do novo modelo.

O backend detecta a pasta `bambu_template/` automaticamente — nenhuma alteração
de código é necessária.

---

## Como Funciona Internamente (Para Referência)

Quando o backend gera um job, a função `_pack_bambu_3mf()` em
`backend/app/api/generator.py`:

1. Lê `bambu_parts_config.json` para saber o nome e extrusor de cada peça
2. Carrega os STLs gerados pelo OpenSCAD via trimesh
3. Normaliza o eixo Z (apoia o conjunto em Z=0)
4. Serializa os vértices e triângulos de cada malha como XML (`3D/Objects/object_1.model`)
5. Gera a estrutura de montagem (`3D/3dmodel.model`)
6. Gera `Metadata/model_settings.config` com os offsets Z reais calculados
7. Empacota tudo em um ZIP com extensão `.3mf`, incluindo os arquivos estáticos do template

Se o diretório `bambu_template/` não existir, o sistema cai no comportamento anterior
(exportação simples via trimesh), garantindo compatibilidade com outros modelos.
