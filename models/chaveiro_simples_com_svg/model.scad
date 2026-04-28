// Fontes disponíveis (bundled na pasta do modelo)
use <Chewy-Regular.ttf>
use <Bangers-Regular.ttf>

/*[Texto]*/
text_line_1    = "Vinicius";          // Linha principal
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

/*[Arte SVG]*/
svg_linhas_path = "linhas.svg";       // Caminho do SVG (injetado pelo backend)
art_height      = 12;                 // Altura da arte em mm
art_width       = 12;                 // Largura da arte em mm (calculada pelo frontend)
svg_gap         = 2.0;                // Espaço entre o fim do texto e a arte, mm
svg_offset_x    = 0;                  // Ajuste manual horizontal, mm
svg_offset_y    = 0;                  // Ajuste manual vertical, mm

/*[Posicionamento por caractere — injetado pelo backend]*/
chars1   = "";
char_xs1 = [];
chars2   = "";
char_xs2 = [];
body_min_x = 0;
body_max_x = 0;
body_span_x = 0;

/*[Preenchimento de Gaps]*/
fill_gap_rects = [];

// ── Posição Y de cada linha ───────────────────────────────────────────────
_lines = text_line_2 == "" ? [text_line_1] : [text_line_1, text_line_2];
_sizes = text_line_2 == "" ? [text_size_1] : [text_size_1, text_size_2];

function _line_y(i) =
    (len(_lines) == 1) ? 0 :
    (i == 0) ?  (_sizes[1] * line_spacing * 0.6) :
               -(_sizes[0] * line_spacing * 0.6);

// ── Argola: posicionada na borda esquerda do texto ───────────────────────
final_ring_x = (body_min_x != 0 || body_max_x != 0)
    ? body_min_x - outline_margin + ring_offset_x
    : ((body_span_x > 0) ? -(body_span_x / 2) + ring_offset_x : ring_offset_x);
final_ring_y = ring_offset_y;

// ── Posição do SVG: à direita do texto, centralizado verticalmente ───────
// Borda esquerda da arte = body_max_x + svg_gap + svg_offset_x
// Centro X da arte = borda esquerda + art_width/2
svg_cx = (body_max_x != 0)
    ? body_max_x + svg_gap + art_width / 2 + svg_offset_x
    : art_width / 2 + svg_gap + svg_offset_x;
svg_cy = svg_offset_y;

// ── Módulo: Arte SVG 2D ───────────────────────────────────────────────────
// O SVG foi normalizado pelo backend (origem em 0,0). Redimensionamos para
// [art_width × art_height] e centralizamos em (svg_cx, svg_cy).
module art_svg_2d() {
    translate([svg_cx - art_width / 2, svg_cy - art_height / 2, 0])
        resize([art_width, art_height, 0], auto = [false, false, false])
            import(file = svg_linhas_path);
}

// ── Módulo: Arte SVG extrudada ────────────────────────────────────────────
module raised_svg() {
    translate([svg_cx - art_width / 2, svg_cy - art_height / 2, 0])
        linear_extrude(height = letter_height)
            resize([art_width, art_height, 0], auto = [false, false, false])
                import(file = svg_linhas_path);
}

// ── Furo da argola ────────────────────────────────────────────────────────
module hole() {
    translate([final_ring_x, final_ring_y, -0.1])
        cylinder(d = ring_inner_diameter, h = base_height + 0.2, $fn = 50);
}

// ── Preenchimento de gaps entre linhas ────────────────────────────────────
module gap_fillers_2d() {
    for (rect = fill_gap_rects) {
        x = rect[0]; y = rect[1]; w = rect[2]; h = rect[3];
        translate([x, y, 0]) square([w, h], center = true);
    }
}

// ── Base 2D: texto + arte SVG ─────────────────────────────────────────────
module base_2d() {
    if (len(chars1) > 0) {
        // Linha 1: per-character (posições injetadas pelo backend)
        for (i = [0 : len(chars1) - 1])
            if (i < len(char_xs1))
                translate([char_xs1[i], _line_y(0) - text_size_1 / 2, 0])
                    text(chars1[i], size = text_size_1, font = font_name,
                         halign = "left", valign = "baseline");
        // Linha 2 (opcional)
        if (len(chars2) > 0)
            for (i = [0 : len(chars2) - 1])
                if (i < len(char_xs2))
                    translate([char_xs2[i], _line_y(1) - text_size_2 / 2, 0])
                        text(chars2[i], size = text_size_2, font = font_name,
                             halign = "left", valign = "baseline");
        // Preencher gaps entre linhas
        if (len(fill_gap_rects) > 0)
            gap_fillers_2d();
        // Arte SVG (sempre incluída)
        art_svg_2d();
    } else {
        // Fallback: text() convencional
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
        // Arte SVG (sempre incluída)
        art_svg_2d();
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

// ── Letras + Arte em relevo ───────────────────────────────────────────────
module _one_char(ch_code, x, y, sz) {
    translate([x, y - sz / 2, 0])
        linear_extrude(height = letter_height)
            text(ch_code, size = sz, font = font_name,
                 halign = "left", valign = "baseline");
}

module raised_letters() {
    translate([0, 0, base_height]) {
        if (len(chars1) > 0) {
            // Linha 1: per-character
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
        // Arte SVG em relevo (sempre incluída)
        raised_svg();
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
