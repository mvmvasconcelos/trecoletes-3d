/*[SVG Inputs]*/
svg_linhas_path = "linhas.svg";
svg_verso_path  = "verso.svg";  // Arte espelhada na face inferior

/*[Dimensões da Arte]*/
art_width  = 35;  // Largura da arte em mm
art_height = 35;  // Altura da arte em mm

/*[Aparência]*/
base_shape        = "organic";  // "organic" | "circle" | "square"
outline_thickness = 2.5;        // Espessura do contorno ao redor da arte (mm)

/*[Alturas]*/
base_height   = 0.8;  // Altura do contorno e da haste (mm)
letter_height = 0.8;  // Altura do relevo da arte acima da base (mm)

/*[Haste]*/
post_x_offset = 0;    // Deslocamento horizontal da haste (mm)
post_y_offset = 0;    // Deslocamento vertical do ponto de conexão da haste (mm)
post_width    = 4;    // Largura da haste (mm)
post_length   = 120;  // Comprimento da haste (mm)
tip_cylinder  = true; // Adiciona cilindro decorativo na ponta inferior da haste
tip_diameter  = 8;    // Diâmetro do cilindro na ponta (mm)

/*[Arte do Verso]*/
verso_enable = false;  // Ativa arte espelhada na face inferior (0,2 mm colada na mesa)
verso_width  = 25;     // Largura da arte do verso (mm)
verso_height = 25;     // Altura da arte do verso (mm)

/*[Cores]*/
base_color    = "#FFFFFF";  // Cor do contorno e haste
letters_color = "#FF0000";  // Cor da arte em relevo
verso_color   = "#FFFFFF";  // Cor da arte do verso

// ─── Variáveis internas ───────────────────────────────────────────────────────
$fn = 100;

// Quando verso ativo, toda a estrutura sobe 0,2 mm para o verso ficar colado na mesa.
verso_layer_height = 0.2;
z_off = verso_enable ? verso_layer_height : 0;

// ─── Arte SVG ─────────────────────────────────────────────────────────────────
// Posicionada com a base em y=0, centralizada em x=0.
// O backend normaliza o SVG para (0,0), então resize forçado garante escala correta.
module art_svg() {
    translate([-art_width / 2, 0, 0])
        resize([art_width, art_height, 0], auto = [false, false, false])
            import(file = svg_linhas_path);
}

// ─── Forma do fundo (2D) ──────────────────────────────────────────────────────
// organic: silhueta da arte expandida por outline_thickness (segue o contorno)
// circle:  círculo centrado na arte, raio = metade do maior eixo + outline_thickness
// square:  retângulo com cantos arredondados centralizado na arte
module base_2d() {
    if (base_shape == "circle") {
        translate([0, art_height / 2])
            circle(r = max(art_width, art_height) / 2 + outline_thickness, $fn = 128);
    } else if (base_shape == "square") {
        translate([0, art_height / 2])
            offset(r = outline_thickness, $fn = 32)
                square([art_width, art_height], center = true);
    } else {
        // organic: expande a silhueta da arte
        offset(r = outline_thickness, $fn = 60)
            art_svg();
    }
}

// ─── Base: fundo + haste ──────────────────────────────────────────────────────
module base_3d() {
    translate([0, 0, z_off]) {
        linear_extrude(base_height)
            base_2d();

        // Haste única centralizada (ou com deslocamento), estende-se abaixo da arte
        if (post_length > 0) {
            translate([post_x_offset - post_width / 2, post_y_offset - post_length, 0])
                cube([post_width, post_length, base_height]);
            // Ponta arredondada inferior da haste (meia-aresta)
            translate([post_x_offset, post_y_offset - post_length, 0])
                cylinder(h = base_height, d = post_width);
            // Cilindro decorativo na ponta — centrado na extremidade da haste
            if (tip_cylinder) {
                translate([post_x_offset, post_y_offset - post_length, 0])
                    cylinder(h = base_height, d = tip_diameter);
            }
        }
    }
}

// ─── Arte em relevo ───────────────────────────────────────────────────────────
module svg_3d() {
    translate([0, 0, z_off + base_height])
        linear_extrude(letter_height)
            art_svg();
}

// ─── Arte do Verso (2D) ──────────────────────────────────────────────────────
// Centrada em (0,0) para espelhamento simétrico em X.
module verso_svg_2d() {
    translate([-verso_width / 2, -verso_height / 2, 0])
        resize([verso_width, verso_height, 0], auto = [false, false, false])
            import(file = svg_verso_path);
}

// ─── Arte do Verso (3D) ──────────────────────────────────────────────────────
// 0,2 mm na face inferior (z=0), espelhada em X, centrada na área da arte frontal.
// Quando impresso com esta face na mesa, a arte lê corretamente ao virar a peça.
module verso_3d() {
    if (verso_enable) {
        linear_extrude(verso_layer_height)
            translate([0, art_height / 2, 0])
                scale([-1, 1, 1])
                    verso_svg_2d();
    }
}

// ─── Dispatcher de partes ─────────────────────────────────────────────────────
part = "all";

if (part == "base") {
    color(base_color) base_3d();
} else if (part == "svg") {
    color(letters_color) svg_3d();
} else if (part == "verso") {
    color(verso_color) verso_3d();
} else {
    color(base_color)    base_3d();
    color(letters_color) svg_3d();
    if (verso_enable) color(verso_color) verso_3d();
}
