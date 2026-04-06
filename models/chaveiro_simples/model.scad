// Fontes disponíveis (bundled na pasta do modelo)
use <Chewy-Regular.ttf>
use <Bangers-Regular.ttf>

/*[Texto]*/
text_line_1    = "Verônica";          // Linha principal
text_size_1    = 12;                  // Tamanho do Texto, mm
font_name      = "Chewy:style=Regular";
base_height    = 2.0;                 // Espessura da Base, mm
letter_height  = 2.0;                 // Espessura do Relevo, mm
outline_margin = 2.3;                 // Margem do contorno além do texto, mm
spacing        = 1.0;                 // Espaçamento entre letras (1.0 = normal)

/*[Argola]*/
ring_outer_diameter = 6.0;
ring_inner_diameter = 3.0;
ring_offset_x = -0.6;
ring_offset_y = 6.0;

/*[Cores]*/
base_color    = "#1B40D1";
letters_color = "#FFFFFF";

/*[Preenchimento da Base]*/
fill_base_holes = false;

/*[Posicionamento por caractere — injetado pelo backend]*/
chars1   = "";   
char_xs1 = [];   
body_min_x = 0; // Injetado pelo backend
body_max_x = 0; // Injetado pelo backend
body_span_x = 0; // Injetado pelo backend

// Cálculo automático da argola: se temos a largura total, ela vai para a borda esquerda
final_ring_x = (body_min_x != 0 || body_max_x != 0) ? body_min_x - outline_margin + ring_offset_x : ((body_span_x > 0) ? -(body_span_x / 2) + ring_offset_x : ring_offset_x);
final_ring_y = 0 + ring_offset_y; // Inicia em 0 conforme solicitado

/*[Direção]*/
text_halign = "left";

module hole() {
    translate([final_ring_x, final_ring_y, -0.1])
        cylinder(d = ring_inner_diameter, h = base_height + 0.2, $fn = 50);
}

module base_2d() {
    // Usar Renderização Nativa do OpenSCAD garante o kerning (espaçamento) perfeito do FreeType.
    // O offset(delta=0.01) funde todas as letras que se tocam, anulando matematicamente o problema de 'buracos' da regra even-odd natural do OpenSCAD!
    if (fill_base_holes) {
        offset(delta = -5.0, join_type = "miter") 
            offset(delta = 5.0, join_type = "miter") 
                offset(delta = 0.01)
                    text(text_line_1, size = text_size_1, font = font_name, halign = text_halign, valign = "center", spacing = spacing);
    } else {
        offset(delta = 0.01) {
            text(text_line_1, size = text_size_1, font = font_name, halign = text_halign, valign = "center", spacing = spacing);
        }
    }
}

module ring_2d() {
    translate([final_ring_x, final_ring_y, 0])
        circle(d = ring_outer_diameter, $fn = 50);
}

module base_with_hole() {
    difference() {
        linear_extrude(height = base_height) {
            union() {
                offset(r = outline_margin, $fn = 60)
                    base_2d();
                ring_2d();
            }
        }
        hole();
    }
}

module raised_letters() {
    translate([0, 0, base_height]) {
        linear_extrude(height = letter_height) {
            offset(delta = 0.01)
                text(text_line_1, size = text_size_1, font = font_name, halign = text_halign, valign = "center", spacing = spacing);
        }
    }
}

// ── Dispatcher de partes ──────────────────────────────────────────────────
part = "all";

if (part == "all") {
    color(base_color)    base_with_hole();
    color(letters_color) raised_letters();
} else if (part == "base") {
    color(base_color) base_with_hole();
} else if (part == "letters") {
    color(letters_color) raised_letters();
}
