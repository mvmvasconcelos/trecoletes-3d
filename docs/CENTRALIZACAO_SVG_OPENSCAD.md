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

Para garantir alinhamento perfeito nos novos modelos, o backend normaliza todos os SVGs antes de passá-los para o OpenSCAD via a função `normalize_svg_to_origin()` em `backend/app/api/_svg_normalize.py`. Essa função ajusta o `viewBox` para `"0 0 W H"` e envolve o conteúdo em um `<g transform="translate(-minX -minY)">`, garantindo que o conteúdo inicie exatamente em `(0, 0)`.

Portanto, em **qualquer novo `model.scad`** que importe SVGs, sempre receba `art_width` e `art_height` como parâmetros e use a seguinte estrutura:

```openscad
// Variáveis injetadas pelo backend (ou definidas pelo usuário no frontend)
art_width  = 50; 
art_height = 50; 

// CERTO: escala forçada + centralização explícita
module art_svg() {
    translate([-art_width / 2, -art_height / 2, 0]) {
        resize([art_width, art_height, 0], auto=[false, false, false])
            import(file="linhas.svg");
    }
}
```

### Por que isso funciona?

Ao invés de deixar o OpenSCAD deduzir a proporção com `auto=true`, informamos **exatamente** o tamanho desejado com `auto=[false, false, false]`. Isso garante que a bounding box do SVG assumirá fielmente as dimensões `[0, 0]` a `[art_width, art_height]`.

Em seguida, o `translate` pela metade dessas medidas posiciona o centro do desenho em `(0, 0, 0)`. Furos, argolas e elementos que buscam o centro vão atingir exatamente a posição correta.

### Modelos que aplicam este padrão

- `models/ponteira_lapis_svg/model.scad` — módulo `art_svg()`
- `models/cortador_bolacha/model.scad` — módulo `art_svg()`
