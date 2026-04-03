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

/*[Letras Preenchidas]*/
fill_letter_holes = false;

/*[Posicionamento por caractere — injetado pelo backend]*/
chars1   = "";   
char_xs1 = [];   
body_span_x = 0; // Injetado pelo backend

// Cálculo automático da argola: se temos a largura total, ela vai para a borda esquerda
final_ring_x = (body_span_x > 0) ? -(body_span_x / 2) + ring_offset_x : ring_offset_x;
final_ring_y = 0 + ring_offset_y; // Inicia em 0 conforme solicitado

/*[Direção]*/
text_halign = "left";

module hole() {
    translate([final_ring_x, final_ring_y, -0.1])
        cylinder(d = ring_inner_diameter, h = base_height + 0.2, $fn = 50);
}

module base_2d() {
    if (len(chars1) > 0) {
        for (i = [0 : len(chars1) - 1])
            if (i < len(char_xs1))
                translate([char_xs1[i], -text_size_1/2, 0])
                    text(chars1[i], size = text_size_1, font = font_name,
                         halign = "left", valign = "baseline");
    } else {
        text(text_line_1, size = text_size_1, font = font_name,
             halign = text_halign, valign = "center", spacing = spacing);
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

// Quando fill_letter_holes=true, executamos um delta>0 seguido de delta<0 para preencher O, A, P.
module _one_char(ch_code, x, y, sz) {
    translate([x, y - sz/2, 0]) {
        linear_extrude(height = letter_height) {
            if (fill_letter_holes) {
                offset(delta = -5.0, join_type = "miter") 
                    offset(delta = 5.0, join_type = "miter") 
                        text(ch_code, size = sz, font = font_name,
                             halign = "left", valign = "baseline");
            } else {
                text(ch_code, size = sz, font = font_name,
                     halign = "left", valign = "baseline");
            }
        }
    }
}

module raised_letters() {
    translate([0, 0, base_height]) {
        if (len(chars1) > 0) {
            for (i = [0 : len(chars1) - 1])
                if (i < len(char_xs1))
                    _one_char(chars1[i], char_xs1[i], 0, text_size_1);
        } else {
            // Fallback
            translate([0, 0, 0])
                linear_extrude(height = letter_height)
                    text(text_line_1, size = text_size_1, font = font_name,
                         halign = text_halign, valign = "center", spacing = spacing);
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
