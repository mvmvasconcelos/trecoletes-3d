# Sistema de Preview 2D (Real-Time)

A arquitetura do Trecoletes-3D suporta um preview 2D em tempo real que fornece
feedback instantâneo enquanto o usuário ajusta parâmetros, sem nenhuma chamada ao backend.

---

## 1. O Componente Container `Preview2D`

Localização: `frontend/src/components/ui/Preview2D.tsx`

É um painel colapsável posicionado absolutamente sobre o `Viewer3D`. Gerencia botão de
colapsar/expandir, fundo xadrez (via SVG base64 inline) e backdrop blur.

### Props

```ts
interface Preview2DProps {
  title?: string;       // padrão: "Preview 2D - versão ALPHA"
  children: React.ReactNode;
  width?: number;       // largura em px (padrão: 300)
  height?: number;      // altura em px (padrão: 200)
  className?: string;
}
```

### Uso

```tsx
import { Preview2D } from '../components/ui/Preview2D';

<Preview2D width={320} height={180}>
    <MeuModeloPreviewRenderer params={params} />
</Preview2D>
```

---

## 2. O Renderizador (por modelo)

O renderizador é um componente React puro construído no mesmo arquivo da página.
Não é importado de lugar nenhum — cada modelo pode ter lógica de visualização diferente.

```tsx
function MeuModeloPreviewRenderer({ params }: { params: Record<string, any> }) {
    // lê params, calcula geometria, retorna SVG
    return (
        <svg viewBox="..." className="w-full h-full">
            ...
        </svg>
    );
}
```

### Modelo atualmente com Preview 2D: `ChaveiroSimples`

O `ChaveiroPreviewRenderer` em `ChaveiroSimples.tsx` usa:

1. **`useGoogleFont(fontFamily)`** — carrega a fonte no `<head>` para renderização SVG correta
2. **`SVGTextElement.getBBox()`** + `document.fonts.load()` — mede as dimensões reais do texto após o carregamento da fonte
3. **`stroke` para simular `offset(r=margin)`** — o texto é renderizado duas vezes:
   - Camada de baixo (base): `fill={baseColor}` + `stroke={baseColor}` com `strokeWidth={margin * 2}` e `strokeLinejoin="round"`, simulando o `offset(r=margin)` do OpenSCAD
   - Camada de cima (letras): `fill={lettersColor}` sem stroke
4. **`<mask>`** — para criar o furo interno da argola (ring)
5. **`viewBox` dinâmico** — calculado com base nos bounds reais do texto + margem + posição da argola, garantindo zoom adequado ao conteúdo

---

## 3. Simulando `offset(r)` do OpenSCAD com SVG

A técnica atual usa `stroke` nativo do SVG:

```tsx
<text
    x="0" y="0"
    dominantBaseline="central"
    textAnchor="middle"
    fontSize={textSize}
    fill={baseColor}
    stroke={baseColor}
    strokeWidth={margin * 2}          // margem em cada lado = strokeWidth / 2
    strokeLinejoin="round"
    strokeLinecap="round"
>
    {text}
</text>
```

**Limitações conhecidas:** o `stroke` do SVG expande igualmente para dentro e para fora,
comportando-se como `offset(delta)` do OpenSCAD (não exatamente `offset(r)` que expande
só para fora). Para textos simples o resultado visual é aceitável; para formas complexas
com buracos (letras "O", "B", "P") o stroke pode preencher os buracos internos.

> O preview 2D ainda não é pixel-perfect em relação ao modelo 3D gerado, mas serve
> como referência visual útil para ajuste de parâmetros.

---

## 4. Adicionando Preview 2D a uma Nova Página

1. Crie o renderizador no arquivo da página:
   ```tsx
   function MeuModeloPreviewRenderer({ params }: { params: Record<string, any> }) {
       return <svg viewBox="0 0 100 50" className="w-full h-full">
           {/* geometria SVG */}
       </svg>;
   }
   ```

2. Adicione `<Preview2D>` dentro do `<Viewer3D>` ou ao lado dele (posição `absolute`):
   ```tsx
   <div className="relative">
       <Viewer3D ... />
       <Preview2D width={300} height={180}>
           <MeuModeloPreviewRenderer params={params} />
       </Preview2D>
   </div>
   ```

