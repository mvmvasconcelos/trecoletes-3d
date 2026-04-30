/*[SVG Inputs]*/
svg_linhas_path = "linhas.svg";

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

/*[Cores]*/
base_color    = "#FFFFFF";  // Cor do contorno e haste
letters_color = "#FF0000";  // Cor da arte em relevo

// ─── Variáveis internas ───────────────────────────────────────────────────────
$fn = 100;

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

// ─── Arte em relevo ───────────────────────────────────────────────────────────
module svg_3d() {
    translate([0, 0, base_height])
        linear_extrude(letter_height)
            art_svg();
}

// ─── Dispatcher de partes ─────────────────────────────────────────────────────
part = "all";

if (part == "base") {
    color(base_color) base_3d();
} else if (part == "svg") {
    color(letters_color) svg_3d();
} else {
    color(base_color)    base_3d();
    color(letters_color) svg_3d();
}
