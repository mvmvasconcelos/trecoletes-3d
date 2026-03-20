# Fontes no OpenSCAD: Guia e Melhores Práticas

Este documento resume as descobertas cruciais sobre lidar com fontes customizadas (tipografia) dentro do motor OpenSCAD, especialmente quando executado de forma automática (headless) em servidores Linux / Docker.

Se você deseja permitir que o usuário escolha entre uma lista de fontes para inserir textos num modelo 3D (ex: num `name_topper` ou marca d'água de carimbo), **siga estas recomendações para garantir que a renderização nunca falhe silenciosamente**.

## 1. O Problema Histórico com Fontes .OTF
Apesar do OpenSCAD conseguir *processar* as informações básicas de um arquivo OpenType (`.otf`), na hora de calcular e gerar a **malha vetorial 3D da letra**, ele demonstra uma alta taxa de falhas silenciosas. O OpenSCAD acaba gerando os caminhos vazios, ou forçando a fonte de Sistema (fallback) como a **DejaVu Sans** ou a **Arial**.

🚀 **Melhor Prática:**
Sempre converta suas fontes e armazene-as no formato TrueType (`.ttf`). O Fontconfig em ambientes Linux headless converte e lê as curvas bezier de arquivos `.ttf` com integração nativa sem nenhuma perda ou incompatibilidade com o OpenSCAD.

## 2. Injeção de Fontes com `OPENSCAD_FONT_PATH`
Normalmente a interface gráfica do OpenSCAD lê as fontes que estão instaladas localmente ou na mesma pasta do arquivo `.scad`. No entanto, quando chamamos o processo por linha de comando (`openscad -o ...`) vindo de uma API (ex: `generator.py`), o OpenSCAD roda numa sandbox fechada e **não descobre os arquivos ao redor do modelo automaticamente**.

🚀 **Melhor Prática:**
Na hora em que a aplicação backend acionar o OpenSCAD, certifique-se de sempre definir a variável de ambiente:
`OPENSCAD_FONT_PATH=/caminho/absoluto/da/pasta/do/modelo/`
Isso permite manter as fontes `.ttf` salvas diretamente na pasta do modelo (ex: `models/meu_modelo/minha_fonte.ttf`) isolando-as e permitindo que o OpenSCAD consiga registrá-las instantaneamente.

## 3. A Silenciosa Sabotagem do Fontconfig (Traços e Sintaxe)

O maior erro - e mais invisível - ocorre ao nomear a família da fonte na função `text()` do SCAD, o que acarreta no OpenSCAD **substituindo sua fonte customizada pela fonte genérica (fallback)**, mesmo quando os passos acima foram perfeitamente executados.

### 3.1 Nomes Internos vs Nomes de Arquivo
O OpenSCAD nunca busca os nomes de arquivos (ex: `minha_fonte.ttf`), ele busca **exclusivamente os metadados de Registro da Família da Fonte**.
Se usar Linux ou Docker, você pode rodar \`fc-query arquivo.ttf\` para descobrir esse exato nome, que estará no campo `family: "NOME EXATO"`.

### 3.2 Forçando o Match Absoluto com `:style=Regular`
A biblioteca FontConfig, usada pelo OpenSCAD, possui regras de matching flexíveis. Se houver variação no arquivo (peso, estilo condessado, etc) ele pode falhar se não formos exatos.
**Sempre adicione o estilo ao final**.
*Errado:* `font="Eastman Condensed Alt Trial"`
*Correto:* `font="Eastman Condensed Alt Trial:style=Regular"`

### 3.3 O Assasino Silencioso: O Hífen (`-`) !
O FontConfig usa internamente o sinal de hífen (`-`) na busca (pattern parsing) como um **DELIMITADOR de separação entre o nome da Família e o Tamanho da fonte** (ex: `Arial-12`).
Por causa disso, se a sua fonte tiver um traço real em seu nome (como `"TAN - NIMBUS"` ou `"Bebas-Neue"`):
- O Fontconfig lerá a string até o traço: Família = "TAN ", Tamanho = " NIMBUS" (Inválido). 
- Ele ignorará silenciosamente seu pedido e colocará Arial no lugar.

🚀 **Melhor Prática (O Pulo do Gato):**
Para passar um traço real dentro da string de nome pelo OpenSCAD em direção ao Fontconfig, precisamos "escapá-lo" colocando **duas barras invertidas** (`\\-`).

*Exemplo falhando silenciosamente:* 
`font="TAN - NIMBUS:style=Regular"`
*Exemplo brilhando e esculpindo com maestria:* 
`font="TAN \\- NIMBUS:style=Regular"`

### 3.4 Edição de Metadados da Fonte (A Solução Definitiva)
Se você estiver construindo uma biblioteca de fontes fixas para os usuários escolherem, a maneira mais limpa e à prova de falhas de evitar todos os problemas de escape (como o do hífen) é **editar o campo "Font Family" dentro dos metadados do arquivo `.ttf`**.
Usando ferramentas online (como o [Aspose Font Metadata Editor](https://products.aspose.app/font/metadata/ttf)) ou softwares como o *FontForge*, você pode deletar hifens e caracteres especiais direto na raiz da fonte.
- *Antes:* `Family: TAN - NIMBUS` -> Gera conflitos.
- *Depois da edição:* `Family: TANNIMBUS` -> É lido nativamente pelo OpenSCAD sem a necessidade de escape complexo (`\\-`).

### Resumo Arquitetural para o "Model Generator"
Se pudermos permitir que o usuário faça o upload de fontes (`.ttf`) ou escolha de uma lista fixa, o fluxo robusto do backend (via Python) será:
1. O backend armazena as opções de fonte em .TTF na gaveta `.assets` daquele modelo. **(Recomendado: higienizar os metadados das fontes antes do deploy para remover hifens).**
2. Injeta a variável `OPENSCAD_FONT_PATH=/gaveta/do/modelo`.
3. No arquivo `modelo.scad`, inclua `use <fonte_escolhida.ttf>`.
4. Ao passar o nome da fonte via variável para que o cliente o manipule de forma dinâmica (ex via `-D font_name="Nome"`), o Python no backend deve injetar `:style=Regular` ou `:style=Bold` para garantir blindagem total à quebra tipográfica. (Se não houve higienização dos metadados, lembre-se de rodar um `replace('-', '\\-')` na string).
