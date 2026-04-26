// Fontes disponíveis — encontradas via OPENSCAD_FONT_PATH (backend/static/fonts/)
use <Chewy.ttf>
use <Leckerli_One.ttf>
use <Pacifico.ttf>

/*[Texto]*/
text_line_1  = "Feliz";        // Linha principal
text_line_2  = "Aniversário";  // Linha 2 (vazio = desativar)
text_size_1  = 30;             // Tamanho da Linha 1 (mm)
text_size_2  = 30;             // Tamanho da Linha 2 (mm)
font_name    = "Chewy:style=Regular";

/*[Aparência]*/
text_boldness     = 1.5;  // Espessura extra das letras (mm)
outline_thickness = 3.0;  // Espessura do contorno além das letras (mm)
text_spacing      = 1.0;  // Espaçamento entre letras (1.0 = normal)
line_gap          = 5;    // Espaço adicional entre linhas (mm)

/*[Alturas]*/
base_height   = 1.6;  // Altura do contorno e das hastes (mm)
letter_height = 0.8;  // Altura do relevo das letras acima da base (mm)

/*[Hastes]*/
post_spacing = 75;   // Distância entre as hastes (mm)
post_width   = 4;    // Largura das hastes (mm)
post_length  = 90;   // Comprimento das hastes (mm)

/*[Cores]*/
base_color    = "#FFFFFF";  // Cor do contorno e hastes
letters_color = "#FF0000";  // Cor das letras

// ─── Variáveis internas ───────────────────────────────────────────────────────
$fn = 100;

_has_line2 = len(text_line_2) > 0;

// Posição Y da baseline de cada linha:
//  • Linha 2 (inferior): baseline em y = 0
//  • Linha 1 (superior): baseline em y = text_size_2 + line_gap
function _line_y(i) =
    !_has_line2 ? 0 :
    (i == 0)    ? text_size_2 + line_gap :
                  0;

// ─── Geometria 2D ─────────────────────────────────────────────────────────────
module _line_text(line_idx) {
    translate([0, _line_y(line_idx), 0])
        text(
            text    = (line_idx == 0) ? text_line_1 : text_line_2,
            size    = (line_idx == 0) ? text_size_1  : text_size_2,
            font    = font_name,
            spacing = text_spacing,
            halign  = "center",
            valign  = "baseline"
        );
}

module all_text_2d() {
    _line_text(0);
    if (_has_line2) _line_text(1);
}

// ─── Base: contorno expandido + hastes ────────────────────────────────────────
module base_3d() {
    // Contorno: outline expandido de todas as linhas
    linear_extrude(base_height)
        offset(r = text_boldness + outline_thickness, $fn = 60)
            all_text_2d();

    // Hastes
    if (post_length > 0) {
        for (m = [-1, 1]) {
            // Corpo da haste (cubo centrado em x = m * post_spacing/2)
            translate([m * post_spacing / 2 - post_width / 2, -post_length, 0])
                cube([post_width, post_length, base_height]);
            // Ponta arredondada
            translate([m * post_spacing / 2, -post_length, 0])
                cylinder(h = base_height, d = post_width);
        }
    }
}

// ─── Letras em relevo ─────────────────────────────────────────────────────────
module letters_3d() {
    translate([0, 0, base_height])
        linear_extrude(letter_height)
            offset(r = text_boldness, $fn = 60)
                all_text_2d();
}

// ─── Dispatcher de partes ─────────────────────────────────────────────────────
part = "all";

if (part == "base") {
    color(base_color) base_3d();
} else if (part == "letters") {
    color(letters_color) letters_3d();
} else {
    color(base_color)    base_3d();
    color(letters_color) letters_3d();
}
