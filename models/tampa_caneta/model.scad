// Fontes disponíveis (bundled na pasta do modelo)
use <Chewy-Regular.ttf>
use <Bangers-Regular.ttf>

/*[Texto]*/
text_line_1    = "Vinicius";          // Linha principal
text_line_2    = "";                  // Linha secundária (deixe vazio para desativar)
text_size_1    = 9;                   // Tamanho da Linha 1, mm
text_size_2    = 10;                  // Tamanho da Linha 2, mm
font_name      = "Chewy:style=Regular";
letter_height  = 1.2;                 // Altura das letras em relevo, mm
base_height    = 12;                  // Altura da base, mm
outline_margin = 2.3;                 // Margem do contorno além do texto, mm
spacing        = 1.0;                 // Espaçamento entre letras (1.0 = normal)
line_spacing   = 1.0;                 // Fator de distância entre linhas

/*[Posicionamento por caractere — injetado pelo backend]*/
chars1   = "";   // Texto da linha 1, ex: "ALICE"
char_xs1 = [];   // Posições X de cada char (halign=left), ex: [-14.0, -9.0, ...]
chars2   = "";   // Texto da linha 2 (vazio = não usa)
char_xs2 = [];

/*[Largura Máxima]*/
// 0 = sem limite; >0 = o backend injeta scale_x para achatar o modelo
max_width = 0;
scale_x   = 1.0;   // injetado pelo backend quando max_width é atingido
body_min_x = 0;
body_max_x = 0;
body_span_x = 30;  // largura estimada final da peça em X, injetada pelo backend
body_span_y = 14;  // profundidade estimada final da peça em Y, injetada pelo backend

/*[Furação]*/
hole_orientation = "FRONTBACK";       // "FRONTBACK" | "TOPBOTTOM" | "NONE"
hole_diameter    = 8.2;               // mm — diâmetro do corpo cilíndrico do furo
hole_tip_diameter = 2.0;              // mm — ponta padrão BIC (fixa)
hole_cone_length = 23;                // mm — comprimento padrão do cone da tampa BIC
hole_length      = 150;               // comprimento do cutter (sempre passante), mm
hole_x           = 0;
hole_y           = 0;
hole_z           = base_height / 2;

/*[Preenchimento de Gaps]*/
fill_gap_rects = [];  // Retângulos para preencher gaps entre palavras, injetado pelo backend

/*[Cores]*/
base_color    = "#1B40D1";
letters_color = "#FFFFFF";

/*[Direção]*/
text_halign = "center";

// Arrays de linhas/tamanhos para cálculo de posição vertical
_lines = text_line_2 == "" ? [text_line_1] : [text_line_1, text_line_2];
_sizes = text_line_2 == "" ? [text_size_1] : [text_size_1, text_size_2];

// ── Posição Y de cada linha (centraliza o conjunto verticalmente) ─────────
function _line_y(i) =
    (len(_lines) == 1) ? 0 :
    (i == 0) ?  (_sizes[1] * line_spacing * 0.6) :
               -(_sizes[0] * line_spacing * 0.6);

// ── Preenchimento de gaps entre palavras ──────────────────────────────────
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

// ── Furo padrão de tampa BIC ──────────────────────────────────────────────
// A entrada da tampa é um cone fixo de 23 mm que sai de 2 mm e cresce até
// final_d. Depois dele, o restante do furo continua cilíndrico em final_d.
// O cutter segue longo para atravessar qualquer largura de peça.
// Orientação (centrada em Z=0 do módulo):
//   TOPBOTTOM rotate([90,0,0]) → ponta fina no FUNDO/COSTAS (+Y), aparece como "cima"
//   FRONTBACK rotate([0,-90,0]) → ponta fina à DIREITA (+X)
module tapered_hole_3d(final_d, length, tip_dia) {
    cone_len = min(hole_cone_length, length);
    tail_len = max(length - cone_len, 0);
    eps = 0.05;

    translate([0, 0, -length / 2])
        union() {
            translate([0, 0, -eps])
                cylinder(h = cone_len + eps, d1 = tip_dia, d2 = final_d, $fn = 96);

            if (tail_len > 0)
                translate([0, 0, cone_len])
                    cylinder(h = tail_len + eps, d = final_d, $fn = 96);
        }
}

// ── Base: usa as mesmas posições injetadas pelo backend ───────────────────
module base_2d() {
    // Renderação Nativa para resolver kerning com o bônus de offset(0.01) que mescla letras sobrepostas
    offset(delta = 0.01)
        text(text_line_1, size = text_size_1, font = font_name, halign = "left", valign = "center", spacing = spacing);
    
    if (text_line_2 != "") {
        translate([0, _line_y(1), 0])
            offset(delta = 0.01)
                text(text_line_2, size = text_size_2, font = font_name, halign = "left", valign = "center", spacing = spacing);
    }
    
    // Preencher gaps entre palavras se configurado
    if (len(fill_gap_rects) > 0)
        gap_fillers_2d();
}

module base_with_tunnel() {
    difference() {
        linear_extrude(height = base_height)
            offset(r = outline_margin, $fn = 60)
                base_2d();

        if (hole_orientation == "FRONTBACK") {
            _actual_right = (body_max_x != 0) ? body_max_x + outline_margin : (body_span_x / 2);
            translate([_actual_right - hole_length / 2, hole_y, hole_z])
                rotate([0, -90, 0])
                    tapered_hole_3d(hole_diameter, hole_length, hole_tip_diameter);
        } else if (hole_orientation == "TOPBOTTOM") {
            translate([hole_x, body_span_y / 2 - hole_length / 2, hole_z])
                rotate([90, 0, 0])
                    tapered_hole_3d(hole_diameter, hole_length, hole_tip_diameter);
        }
    }
}

module raised_letters() {
    translate([0, 0, base_height]) {
        linear_extrude(height = letter_height) {
            
            translate([0, _line_y(0), 0]) {
                if (fill_letter_holes) {
                    offset(delta = -5.0, join_type = "miter") offset(delta = 5.0, join_type = "miter") offset(delta = 0.01)
                        text(text_line_1, size = text_size_1, font = font_name, halign = "left", valign = "center", spacing = spacing);
                } else {
                    offset(delta = 0.01)
                        text(text_line_1, size = text_size_1, font = font_name, halign = "left", valign = "center", spacing = spacing);
                }
            }

            if (text_line_2 != "") {
                translate([0, _line_y(1), 0]) {
                    if (fill_letter_holes) {
                        offset(delta = -5.0, join_type = "miter") offset(delta = 5.0, join_type = "miter") offset(delta = 0.01)
                            text(text_line_2, size = text_size_2, font = font_name, halign = "left", valign = "center", spacing = spacing);
                    } else {
                        offset(delta = 0.01)
                            text(text_line_2, size = text_size_2, font = font_name, halign = "left", valign = "center", spacing = spacing);
                    }
                }
            }
            
        }
    }
}

// ── Dispatcher de partes ──────────────────────────────────────────────────
part = "all";

scale([scale_x, 1, 1]) {
    if (part == "all") {
        color(base_color)    base_with_tunnel();
        color(letters_color) raised_letters();
    } else if (part == "base") {
        color(base_color) base_with_tunnel();
    } else if (part == "letters") {
        color(letters_color) raised_letters();
    }
}
