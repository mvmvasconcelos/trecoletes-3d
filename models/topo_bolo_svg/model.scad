/*[SVG Inputs]*/
svg_linhas_path = "linhas.svg";

/*[Dimensões da Arte]*/
art_width  = 100;  // Largura da arte em mm
art_height = 60;   // Altura da arte em mm

/*[Aparência]*/
outline_thickness = 3.0;  // Espessura do contorno ao redor da arte (mm)

/*[Alturas]*/
base_height   = 1.6;  // Altura do contorno e das hastes (mm)
letter_height = 0.8;  // Altura do relevo da arte acima da base (mm)

/*[Hastes]*/
post_count   = 2;    // Número de hastes: 1 (centralizada) ou 2
post_spacing = 75;   // Distância entre as hastes — somente quando post_count=2 (mm)
post_width   = 4;    // Largura das hastes (mm)
post_length  = 90;   // Comprimento das hastes (mm)

/*[Cores]*/
base_color    = "#FFFFFF";  // Cor do contorno e hastes
letters_color = "#FF0000";  // Cor da arte em relevo

// ─── Variáveis internas ───────────────────────────────────────────────────────
$fn = 100;

// ─── Arte SVG ─────────────────────────────────────────────────────────────────
// Posicionada com a base em y=0, centralizada em x=0.
// Assim o contorno e as hastes ficam naturalmente alinhados abaixo da arte.
module art_svg() {
    translate([-art_width / 2, 0, 0])
        resize([art_width, art_height, 0], auto=[false, false, false])
            import(file = svg_linhas_path);
}

// ─── Base: contorno expandido + hastes ────────────────────────────────────────
module base_3d() {
    // Contorno: outline expandido da arte
    linear_extrude(base_height)
        offset(r = outline_thickness, $fn = 60)
            art_svg();

    // Hastes (palitos que ficam abaixo da arte para fixar no bolo)
    if (post_length > 0) {
        if (post_count == 1) {
            // Haste única centralizada em x=0
            translate([-post_width / 2, -post_length, 0])
                cube([post_width, post_length, base_height]);
            translate([0, -post_length, 0])
                cylinder(h = base_height, d = post_width);
        } else {
            for (m = [-1, 1]) {
                // Corpo da haste
                translate([m * post_spacing / 2 - post_width / 2, -post_length, 0])
                    cube([post_width, post_length, base_height]);
                // Ponta arredondada
                translate([m * post_spacing / 2, -post_length, 0])
                    cylinder(h = base_height, d = post_width);
            }
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
