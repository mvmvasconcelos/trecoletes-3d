# Solução: Preencher Gaps Verticais Entre Linhas de Texto

## Problema

Quando um modelo possui **duas ou mais linhas de texto com tamanhos diferentes**, frequentemente aparece um **buraco visível (gap) entre as linhas**. Isso ocorre mesmo com pequenas margens de contorno (`outline_margin`).

### Causa Raiz

O OpenSCAD renderiza cada linha de texto como uma forma 2D separada. Quando o `offset(r=outline_margin)` é aplicado para criar a margem do contorno:

1. Cada linha tem sua própria forma 2D
2. O offset é aplicado **independentemente** a cada forma
3. Se há espaço vertical entre as linhas (gap), o offset **não consegue unir as formas**
4. Resultado: um buraco visível entre as linhas após extrusão 3D

**Exemplo visual:**
```
Linha 1: "Profe" (tamanho 12mm)
         [shape 1]

Gap de ~5mm

Linha 2: "Tuélli" (tamanho 10mm)  
         [shape 2]

Após offset(r=1.6mm), cada forma expande 1.6mm, mas o gap de 5mm
permanece parcialmente aberto → buraco visível no modelo 3D
```

## Solução

### Conceito: Bridge Retângular

Antes do `offset()` ser aplicado, **injetar um retângulo que conecte as duas linhas**, preenchendo o gap verticalmente.

**Matemática:**
1. Calcular posição Y de cada linha (espelhando `_line_y()` do SCAD)
2. Estimar altura visível de cada linha (cap height aprox 70% do tamanho da fonte)
3. Detectar presença de gap entre o fundo da linha 1 e o topo da linha 2
4. Gerar retângulo com:
   - **Largura**: largura da linha mais estreita
   - **Altura**: gap + margem de segurança (0.2mm)
   - **Posição X**: centrado em 0 (ambas linhas são centradas)
   - **Posição Y**: meio do gap

O retângulo é incluído na 2D path **antes** do `offset()`, então o offset o captura naturalmente.

## Implementação

### 1. Backend: `generator.py`

A função `_inject_char_positions()` realiza a detecção e injeção do bridge:

```python
if fill_word_gaps:
    text_1 = params.get("text_line_1", "")
    text_2 = params.get("text_line_2", "")
    
    if text_1 and text_2:
        # Calcular posições Y espelhando SCAD
        size1 = float(params.get("text_size_1", 12))
        size2 = float(params.get("text_size_2", 10))
        line_spacing_val = float(params.get("line_spacing", 1.0))
        outline_margin_val = float(params.get("outline_margin", 2.3))
        
        # _line_y(0) = size2 * line_spacing * 0.6 (linha 1, acima)
        # _line_y(1) = -size1 * line_spacing * 0.6 (linha 2, abaixo)
        line_y_0 = size2 * line_spacing_val * 0.6
        line_y_1 = -(size1 * line_spacing_val * 0.6)
        
        # Baseline (onde a letra toca a linha invisível)
        baseline_1 = line_y_0 - size1 / 2
        baseline_2 = line_y_1 - size2 / 2
        
        # Limites visíveis
        bottom_line1 = baseline_1              # fundo linha 1
        top_line2 = baseline_2 + size2 * 0.7  # topo linha 2
        
        vertical_gap = bottom_line1 - top_line2
        
        # Injetar bridge se gap > -(outline_margin * 0.5)
        # ou seja, se a sobreposição permitida é insuficiente
        if vertical_gap > -(outline_margin_val * 0.5):
            bridge_w = min(width_1, width_2)
            bridge_h = max(vertical_gap + 0.2, 0.4)
            y_center = (bottom_line1 + top_line2) / 2
            
            args.extend(["-D", f"fill_gap_rects=[[{x},{y},{w},{h}]]"])
```

### 2. SCAD: `model.scad`

Declarar o parâmetro injetado e usar em `base_2d()`:

```scad
/*[Preenchimento de Gaps]*/
fill_gap_rects = [];  // Retângulos para preencher gaps, injetados pelo backend

module gap_fillers_2d() {
    for (rect = fill_gap_rects) {
        x = rect[0];
        y = rect[1];
        w = rect[2];
        h = rect[3];
        translate([x, y, 0])
            square([w, h], center = true);
    }
}

module base_2d() {
    // ...renderizar letras de ambas as linhas...
    
    // Chamar ANTES do offset()
    if (len(fill_gap_rects) > 0)
        gap_fillers_2d();
}
```

### 3. Config: `config.json`

Adicionar checkbox na seção "Ajustes Finos":

```json
{
    "id": "fill_word_gaps",
    "name": "Preencher espaços entre linhas",
    "type": "checkbox",
    "default": true
}
```

### 4. Frontend: `PonteiraLapisTexto.tsx` (ou qualquer componente)

O checkbox já é renderizado automaticamente pelo sistema:

```typescript
case 'checkbox':
    return (
        <input
            type="checkbox"
            checked={val === true || val === 'true'}
            onChange={e => setParam(p.id, e.target.checked)}
        />
    );
```

## Reutilizando em Outros Modelos

### Checklist

- [ ] **config.json**: Adicionar parâmetro `fill_word_gaps` com `"type": "checkbox"`, `"default": true`
- [ ] **model.scad**: 
  - [ ] Declarar `fill_gap_rects = [];` nos parâmetros
  - [ ] Implementar módulo `gap_fillers_2d()` que itera sobre `fill_gap_rects`
  - [ ] Chamar `gap_fillers_2d()` em `base_2d()` **antes** de qualquer `offset()`
- [ ] **generator.py**: Manter o código de detecção em `_inject_char_positions()`
  - [ ] Precisão: A função já itera sobre todos os modelos, então funciona automaticamente
  - [ ] Se o modelo tem 2 linhas de texto + checkbox, já funciona

### Modelos Já Implementados

✅ `ponteira_lapis_texto` - Totalmente funcional

### Modelos para Implementar (futuros)

- `ponteira_lapis_svg` (se tiver 2 linhas)
- Qualquer modelo com múltiplas linhas de texto

## Exemplos de Uso

### Caso 1: Dois tamanhos muito diferentes

```
Linha 1: "PROFE" (tamanho 16mm)
Linha 2: "de" (tamanho 8mm)
Gap estimado: 8mm

Bridge gerado:
- Centro Y: -1.6mm (meio do gap)
- Altura: 8.2mm (gap + 0.2mm buffer)
- Largura: 12mm (a menor das duas)
→ Modelo fica sem buraco
```

### Caso 2: Tamanhos próximos, outline_margin pequena

```
Linha 1: "Profe" (12mm)
Linha 2: "Tuélli" (10mm)
outline_margin: 1.6mm
Gap: 5.2mm

Sem bridge: offset expande 1.6mm, deixa ~2mm de gap aberto
Com bridge: retângulo de 5.4mm une as formas antes do offset
→ Offset une perfeitamente
```

## Diagrama de Fluxo

```
User seleciona "Preencher espaços entre linhas" ✓
                        ↓
                   Frontend
                        ↓
         form.append("fill_word_gaps", "true")
                        ↓
                    Backend
                        ↓
         _inject_char_positions(params, model_dir)
                        ↓
            if fill_word_gaps and text_1 and text_2:
                        ↓
        Calcular gap vertical entre linhas
                        ↓
          if gap > threshold (inadequado):
                        ↓
          Gerar ret. bridge: [x_center, y_center, w, h]
                        ↓
        Injetar: -D fill_gap_rects=[[...]]
                        ↓
                   OpenSCAD
                        ↓
           gap_fillers_2d() renderiza rect.
                        ↓
        offset() une as formas (rect + texto)
                        ↓
       Modelo 3D sem gaps/buracos entre linhas
```

## Notas Técnicas

### Decisões de Design

1. **Altura mínima do bridge: 0.4mm**
   - Garante conectividade mesmo com sobreposição mínima
   - Pequena o bastante para não distorcer visualmente

2. **Buffer de 0.2mm acima do gap**
   - Margem de segurança para erros de arredondamento
   - Deve estar dentro da margem do contorno

3. **Largura = mínimo das duas linhas**
   - Evita protuberâncias laterais
   - Ambas linhas são centradas em X=0, então simetria é preservada

4. **Limiar: -(outline_margin * 0.5)**
   - Se linhas se sobrepõem mais que 50% da margem, gap é minimal
   - Não injeta bridge desnecessariamente

### Limitações

- ✓ Funciona com linhas de qualquer tamanho
- ✓ Funciona com qualquer `outline_margin`
- ✓ Trabalha bem com 2 linhas; 3+ linhas precisariam lógica estendida
- ⚠️ Assume posicionamento centrado em Y (função `_line_y()`)
- ⚠️ Requer ambas linhas preenchidas (texto_line_1 e texto_line_2)

## Troubleshooting

### Gap ainda aparece mesmo com checkbox ativado

**Verificação:**
1. Checar logs: `docker-compose logs backend | grep FILL_GAPS`
2. Procurar mensagem `[FILL_GAPS] Bridge injected`
3. Se não aparecer:
   - Confirmar que ambas linhas têm texto
   - Verificar `outline_margin` (precisa ser adequado)
   - Confirmar que `fill_gap_rects = [];` está em model.scad
   - Confirmar que `gap_fillers_2d()` é chamado em `base_2d()`

### Modelo fica diferente (visualmente mais largo)

- É esperado: o bridge adiciona volume
- Bridge tem a largura da linha mais estreita, então deve ser discreto
- Aumentar `outline_margin` para melhor integração visual

## Referências

- **Arquivo de implementação**: `backend/app/api/generator.py` (linhas 710-799)
- **Modelo de exemplo**: `models/ponteira_lapis_texto/`
- **Discussão técnica**: Ver conversation summary na sessão do Copilot
