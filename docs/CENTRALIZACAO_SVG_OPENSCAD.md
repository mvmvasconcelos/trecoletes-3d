# Centralização de SVGs no OpenSCAD

## Problema

Ao criar um novo modelo paramétrico no `trecoletes-3d` que envolve importação de arquivos `.svg`, é muito comum a geometria gerada se alinhar incorretamente com o ponto de ancoragem `(0, 0, 0)` do OpenSCAD. Isso prejudica adições de furos centrais ou montagens precisas de base.

Muitas vezes, a primeira tentativa de correção é usar:
```openscad
// ERRADO (ou impreciso)
translate([-art_width / 2, 0, 0]) {
    resize([art_width, 0, 0], auto=[true, true, false])
        import(file="linhas.svg");
}
```

O problema desse trecho ocorre porque a função `resize()` do OpenSCAD não lê o `viewBox` do arquivo SVG como o tamanho oficial. Em vez disso, o OpenSCAD lê o conteúdo físico da malha 2D. Se a linha vetorizada do SVG não tocar perfeitamente os contornos de seu espaço (ou tiver "whitespace" natural), a escala automática (`auto=true`) irá ignorar o espaço vazio e calcular uma altura genérica que não corresponde ao centro real da tela geométrica. O resultado é o modelo deslocado pelo eixo Y e/ou X.

## Solução Definitiva

Para garantir alinhamento perfeito nos novos modelos, nosso backend já normaliza todos os SVGs antes de passar para o OpenSCAD (garantindo que o início deles seja artificialmente amarrado ao `(0,0)`). 

Portanto, em **qualquer novo script `model.scad`**, você deve sempre pedir que o front end repasse as dimensões explícitas `art_width` e `art_height`, e deve usar a seguinte estrutura:

```openscad
// Variáveis injetadas pelo Backend
art_width  = 50; 
art_height = 50; 

// CERTO (Escala forçada e centralização explícita)
module art_svg() {
    translate([-art_width / 2, -art_height / 2, 0]) {
        resize([art_width, art_height, 0], auto=[false, false, false]) {
            import(file="linhas.svg");
        }
    }
}
```

### Por que isso funciona?
Ao invés de deixar o OpenSCAD deduzir a proporção com `auto=[true, true...]`, nós informamos ele **exatamente** em qual tamanho queremos encaixar as geometrias usando `auto=[false, false, false]`. Isso garante que a caixa delimitadora (`bounding box`) do SVG assumirá fielmente a dimensão `[0, 0]` a `[art_width, art_height]`. 

Em seguida, o `translate` pela metade dessas medidas move perfeitamente o seu ponto `(0,0,0)` para o centro do desenho. Furos e elementos que buscam o centro vão atingir exatamente o "olho" da figura.
