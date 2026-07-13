// ============================================================================
// editor_generico — motor 3D "burro" para o Editor de Camadas 2D
//
// Este modelo NÃO calcula geometria 2D nenhuma (nem silhueta, nem contorno,
// nem furos). Toda a arte 2D (texto convertido em path, expansão de contorno,
// silhueta, imagem vetorizada) já vem pronta — achatada em curvas simples —
// dentro do próprio arquivo SVG, calculada no frontend (editor de camadas).
//
// A única responsabilidade deste .scad é, para cada um dos 4 slots fixos:
//   1. Ler o SVG recebido (partN_svg) — já vem num referencial X/Y compartilhado
//      entre todas as partes ativas (calculado no frontend), então nenhum
//      alinhamento X/Y é feito aqui;
//   2. resize() — passo estrutural explícito, mantido como no-op
//      ([0,0,0] = nenhuma dimensão é forçada) porque o SVG já chega com as
//      dimensões reais em mm definidas pelo frontend; existe aqui para deixar
//      claro o contrato "resize + extrude apenas" e para permitir, no futuro,
//      um recorte de segurança sem precisar mexer no dispatcher.
//   3. Empilhar em Z: Parte 1 é sempre a base (z=0), cada parte ativa seguinte
//      sobe pela soma das alturas das partes ativas anteriores (ver
//      z_off_partN abaixo) — ordem fixa pelo número da parte, sem UI de
//      reordenação.
//   4. linear_extrude() até a altura configurada (partN_height).
//
// REGRA DE OURO: este arquivo NUNCA pode chamar a primitiva de expansão 2D
// do OpenSCAD (offset). Qualquer geometria 2D (silhueta, engrossamento de
// traço, contorno) é responsabilidade do frontend. Reintroduzir essa
// primitiva aqui traria lógica 2D de volta para o "motor burro" e quebraria
// o contrato do Grupo 6 da wish editor-camadas-2d.
// ============================================================================

/*[Parte 1]*/
part1_svg    = "placeholder.svg";
part1_height = 2.0;
part1_active = true;

/*[Parte 2]*/
part2_svg    = "placeholder.svg";
part2_height = 2.0;
part2_active = false;

/*[Parte 3]*/
part3_svg    = "placeholder.svg";
part3_height = 2.0;
part3_active = false;

/*[Parte 4]*/
part4_svg    = "placeholder.svg";
part4_height = 2.0;
part4_active = false;

// ── Motor genérico: resize (no-op) + linear_extrude sobre o SVG recebido ──
module extrude_slot(svg_path, height) {
    linear_extrude(height = height)
        resize([0, 0, 0], auto = [false, false, false])
            import(file = svg_path);
}

// ── Empilhamento em Z: ordem fixa pelo número da parte ─────────────────────
// Parte 1 é sempre a base (z=0); cada parte ativa seguinte empilha em cima da
// soma das alturas das partes ativas de número menor — nunca a partir de z=0
// para todas ao mesmo tempo (o que faria as peças se interpenetrarem em vez
// de empilhar). Partes inativas não contam altura nenhuma, então a "próxima"
// parte ativa sempre pousa exatamente onde a anterior terminou.
z_off_part1 = 0;
z_off_part2 = z_off_part1 + (part1_active ? part1_height : 0);
z_off_part3 = z_off_part2 + (part2_active ? part2_height : 0);
z_off_part4 = z_off_part3 + (part3_active ? part3_height : 0);

// ── Dispatcher de partes ───────────────────────────────────────────────────
// Peça: "part_1" | "part_2" | "part_3" | "part_4"
// Slots inativos (partN_active = false) não produzem geometria: o backend
// também remove essas partes de parts_to_render antes de empacotar o 3MF,
// então este guard é uma segunda camada de segurança contra STL vazio.
part = "part_1";

if (part == "part_1" && part1_active) {
    translate([0, 0, z_off_part1]) extrude_slot(part1_svg, part1_height);
} else if (part == "part_2" && part2_active) {
    translate([0, 0, z_off_part2]) extrude_slot(part2_svg, part2_height);
} else if (part == "part_3" && part3_active) {
    translate([0, 0, z_off_part3]) extrude_slot(part3_svg, part3_height);
} else if (part == "part_4" && part4_active) {
    translate([0, 0, z_off_part4]) extrude_slot(part4_svg, part4_height);
}
