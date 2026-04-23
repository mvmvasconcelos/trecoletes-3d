// Fontes disponíveis (bundled na pasta do modelo)
use <Chewy-Regular.ttf>
use <Bangers-Regular.ttf>

/*[Texto]*/
text_line_1    = "Verônica";          // Linha principal
text_line_2    = "";                  // Linha secundária (deixe vazio para desativar)
text_size_1    = 12;                  // Tamanho da Linha 1, mm
text_size_2    = 10;                  // Tamanho da Linha 2, mm
font_name      = "Chewy:style=Regular";
base_height    = 2.0;                 // Espessura da Base, mm
letter_height  = 2.0;                 // Espessura do Relevo, mm
outline_margin = 2.3;                 // Margem do contorno além do texto, mm
spacing        = 1.0;                 // Espaçamento entre letras (1.0 = normal)
line_spacing   = 1.0;                 // Fator de distância entre linhas

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
chars2   = "";   // Texto da linha 2 (vazio = não usa)
char_xs2 = [];
body_min_x = 0; // Injetado pelo backend
body_max_x = 0; // Injetado pelo backend
body_span_x = 0; // Injetado pelo backend

/*[Preenchimento de Gaps]*/
fill_gap_rects = [];  // Retângulos para preencher gaps entre linhas, injetado pelo backend

// Arrays de linhas/tamanhos para cálculo de posição vertical
_lines = text_line_2 == "" ? [text_line_1] : [text_line_1, text_line_2];
_sizes = text_line_2 == "" ? [text_size_1] : [text_size_1, text_size_2];

// ── Posição Y de cada linha (centraliza o conjunto verticalmente) ─────────
function _line_y(i) =
    (len(_lines) == 1) ? 0 :
    (i == 0) ?  (_sizes[1] * line_spacing * 0.6) :
               -(_sizes[0] * line_spacing * 0.6);

// Cálculo automático da argola: se temos a largura total, ela vai para a borda esquerda
final_ring_x = (body_min_x != 0 || body_max_x != 0) ? body_min_x - outline_margin + ring_offset_x : ((body_span_x > 0) ? -(body_span_x / 2) + ring_offset_x : ring_offset_x);
final_ring_y = 0 + ring_offset_y; // Inicia em 0 conforme solicitado

/*[Direção]*/
text_halign = "left";

module hole() {
    translate([final_ring_x, final_ring_y, -0.1])
        cylinder(d = ring_inner_diameter, h = base_height + 0.2, $fn = 50);
}

// ── Preenchimento de gaps entre linhas ───────────────────────────────────
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
    if (len(chars1) > 0) {
        // Linha 1: per-character (posições injetadas pelo backend)
        for (i = [0 : len(chars1) - 1])
            if (i < len(char_xs1))
                translate([char_xs1[i], _line_y(0) - text_size_1/2, 0])
                    text(chars1[i], size = text_size_1, font = font_name,
                         halign = "left", valign = "baseline");
        // Linha 2 (opcional)
        if (len(chars2) > 0)
            for (i = [0 : len(chars2) - 1])
                if (i < len(char_xs2))
                    translate([char_xs2[i], _line_y(1) - text_size_2/2, 0])
                        text(chars2[i], size = text_size_2, font = font_name,
                             halign = "left", valign = "baseline");
        // Preencher gaps entre linhas se configurado
        if (len(fill_gap_rects) > 0)
            gap_fillers_2d();
    } else {
        // Fallback: text() convencional (quando backend não injeta posições)
        if (fill_base_holes) {
            for (i = [0 : len(_lines) - 1])
                translate([0, _line_y(i), 0])
                    offset(delta = -5.0, join_type = "miter") 
                        offset(delta = 5.0, join_type = "miter") 
                            offset(delta = 0.01)
                                text(_lines[i], size = _sizes[i], font = font_name,
                                     halign = "center", valign = "center", spacing = spacing);
        } else {
            for (i = [0 : len(_lines) - 1])
                translate([0, _line_y(i), 0])
                    offset(delta = 0.01)
                        text(_lines[i], size = _sizes[i], font = font_name,
                             halign = "center", valign = "center", spacing = spacing);
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

// ── Letras em relevo: um extrude por caractere ────────────────────────────
module _one_char(ch_code, x, y, sz) {
    translate([x, y - sz/2, 0])
        linear_extrude(height = letter_height)
            text(ch_code, size = sz, font = font_name,
                 halign = "left", valign = "baseline");
}

module raised_letters() {
    translate([0, 0, base_height]) {
        if (len(chars1) > 0) {
            // Linha 1: per-character (sem even-odd)
            for (i = [0 : len(chars1) - 1])
                if (i < len(char_xs1))
                    _one_char(chars1[i], char_xs1[i], _line_y(0), text_size_1);
            // Linha 2 (opcional)
            if (len(chars2) > 0)
                for (i = [0 : len(chars2) - 1])
                    if (i < len(char_xs2))
                        _one_char(chars2[i], char_xs2[i], _line_y(1), text_size_2);
        } else {
            // Fallback: text() convencional
            for (i = [0 : len(_lines) - 1])
                translate([0, _line_y(i), 0])
                    linear_extrude(height = letter_height)
                        text(_lines[i], size = _sizes[i], font = font_name,
                             halign = "center", valign = "center", spacing = spacing);
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
