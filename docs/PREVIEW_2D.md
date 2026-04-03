# Sistema de Preview 2D (Real-Time)

A arquitetura do Trecoletes-3D suporta uma funcionalidade modular de `Preview 2D` projetada para fornecer feedback quase instantâneo do projeto 2D (sem latências de comunicação e sem tráfego de requisições de geração). O foco é que o visual seja validado localmente enquanto o usuário altera parâmetros (como textos, sliders de margem, espaçamento ou posição de argolas).

## 1. O Componente Container Universal

O componente arquitetural encontra-se acessível em `frontend/src/components/ui/Preview2D.tsx`.
Este componente consiste de um invólucro genérico (wrapper). Ele gerencia de forma integral a UX de uma janela pop-up (com botão de colapsar, *glassmorphism* moderno, sobreposição translúcida no Viewer mestre e com background xadrez paramétrico imune a vazamentos opacos).

Para invocar a estrutura na página:
```tsx
import { Preview2D } from '../components/ui/Preview2D';
```

## 2. A Camada Interna ("O Renderizador")

O Renderizador não é importado, pois ele **precisa ser construído do zero a cada novo modelo**. Diferente de renderizações estáticas, os modelos contam com lógicas de furos ou de redimensionamento próprias (`ring_offset_x`, `outline_margin`, etc).

Construa um componente puramente em React no mesmo arquivo (ex: `function ModelNamePreviewRenderer({ params }) { ... }`), extraia o Dicionário de Parâmetros e posicione as entidades geométricas convertidamente usando SVG.

A composição final ficará:
```tsx
<Preview2D>
   <ModeloPreviewRenderer params={params} />
</Preview2D>
```

## 3. Emulando Minkowski Offset com Precisão Extrema (E Evitando Bugs do Navegador)

Diversos projetos pedem ampliação física de contorno baseado nas fontes (Minkowski round offset em OpenSCAD, conhecido como "Margem de Contorno"). 

**Nunca use a propriedade nativa `strokeLinejoin` com StrokeWidths altíssimos** e **nunca use `feMorphology` isolada** para criar essas malhas espessas em tempo real! Os navegadores costumam reverter as malhas internas (`evenodd winding rule`) quando o stroke infla, criando buracos bizarrros no texto ou extremidades muito retas.

**A forma perfeita à prova de erros:** utilize nativamente manipulação de Kernel em alpha de 3-Fases em um filtro `<defs>` local:
1. `feGaussianBlur`: Espalha a densidade total esfericamente abraçando contornos nativos.
2. `feComponentTransfer`: Poda todas as fraquezas recriando paredes pontuais.

No TSX do seu Rederizador SVG, defina as variáveis (a proporção exata para reproduzir o `offset(margin)` visualizado no 3D):
```tsx
const blurRadius = margin * 0.8;
```

E ancore o preenchimento por Filtro no `Text`:
```xml
<filter id="minkowski-outline" x="-200%" y="-200%" width="500%" height="500%">
    <!-- 1. Gaussian Blur: Amaciando fisicamente de forma circular -->
    <feGaussianBlur in="SourceAlpha" stdDeviation={blurRadius} result="blurred" />
    
    <!-- 2. Threshold Cirúrgico: Transformando toda a sombra em polígono blindado matematicamente com Corte perfeito de Alfa! -->
    <feComponentTransfer in="blurred" result="threshold">
        <feFuncA type="linear" slope="50" intercept="-25" />
    </feComponentTransfer>
    
    <!-- 3. Preenchimento de Cor Base -->
    <feFlood floodColor={baseColor} result="color" />
    <feComposite in="color" in2="threshold" operator="in" />
</filter>
```
Isso resolverá de forma definitiva os contornos redondos e exatos, sem gerar "Gaps" (Furos transparentes) sobre os inter-espaços dos textos.
