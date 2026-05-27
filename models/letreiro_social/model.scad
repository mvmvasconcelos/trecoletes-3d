// ─── Letreiro Social — 3 partes: base, borda, letras ──────────────────────
// Modelo para impressão multicolor (AMS / 3 extrusoras)
// Sem use <> necessário — fontes carregadas via OPENSCAD_FONT_PATH

/*[Texto]*/
text_line_1 = "@trecoletes";      // Texto do letreiro
text_size_1 = 20;                 // Tamanho do texto, mm
font_name   = "Chewy:style=Regular";
spacing     = 1.0;                // Espaçamento entre letras (1.0 = normal)

/*[Alturas das Peças]*/
letter_height = 2.0;   // Altura visível das letras acima da borda, mm
border_height = 2.0;   // Espessura da borda, mm
base_height   = 2.0;   // Espessura da base, mm

/*[Margens de Offset]*/
border_margin     = 3.0;  // Margem da borda além do texto, mm
base_extra_margin = 3.0;  // Margem adicional da base além da borda, mm

/*[Posicionamento por caractere — injetado pelo backend]*/
chars1   = "";   // Caracteres da linha 1 (ex: "@trecoletes")
char_xs1 = [];   // Posições X de cada char (halign=left)

/*[Centralização — injetado pelo backend]*/
body_min_x = 0;
body_max_x = 0;
body_min_y = 0;   // Limite Y inferior real do glifo (espaço SCAD), injetado pelo backend
body_max_y = 0;   // Limite Y superior real do glifo (espaço SCAD), injetado pelo backend
_center_x  = (body_min_x + body_max_x) / 2;

/*[Forma da Base]*/
base_corner_radius = 0;  // Raio dos cantos da base, mm (0 = automático: metade da altura = pill/estádio)

/*[Cores]*/
base_color    = "#C8A46E";
border_color  = "#2D7A3A";
letters_color = "#FFFFFF";

// ─── Constantes internas ──────────────────────────────────────────────────
RECESS   = 1;     // Profundidade do rebaixo de encaixe, mm (fixo)
// _FILL_R: proporcional ao tamanho do texto (≥ raio dos contadores da fonte).
// 15 % do text_size funciona bem para fontes médias a grandes (Chewy, Roboto…).
_FILL_R  = max(text_size_1 * 0.15, 2.0);
$fn      = 60;

// Alturas efetivas (garantem que o rebaixo não ultrapasse a espessura da peça)
_base_h   = max(base_height, RECESS + 0.4);
_border_h = max(border_height, RECESS + 0.4);

// ─── Silhueta 2D: texto (raw — apenas para borda_2d interno) ─────────────
module text_2d() {
    if (len(chars1) > 0) {
        for (i = [0 : len(chars1) - 1])
            if (i < len(char_xs1))
                translate([char_xs1[i], -text_size_1 / 2, 0])
                    text(chars1[i], size = text_size_1, font = font_name,
                         halign = "left", valign = "baseline");
    } else {
        text(text_line_1, size = text_size_1, font = font_name,
             halign = "center", valign = "center", spacing = spacing);
    }
}

// ─── Silhueta 2D: texto sólido (sem buracos internos) ────────────────────
// Aplica fechamento morfológico por caractere para eliminar os "contadores"
// de letras como a, c, d, e, g, o, p, q — evitando que o amarelo da base
// apareça através dos buracos.
module text_2d_solid() {
    // Fechamento morfológico com offset circular (r) para preservar as
    // curvas da fonte sem criar espigões miter. Preenche os contadores
    // (buracos internos) de letras como a, c, d, e, g, o, p, q.
    // Aplicado POR CARACTERE para não mesclar letras adjacentes.
    if (len(chars1) > 0) {
        for (i = [0 : len(chars1) - 1])
            if (i < len(char_xs1))
                translate([char_xs1[i], -text_size_1 / 2, 0])
                    offset(r = -_FILL_R)
                        offset(r = _FILL_R)
                            text(chars1[i], size = text_size_1, font = font_name,
                                 halign = "left", valign = "baseline");
    } else {
        offset(r = -_FILL_R)
            offset(r = _FILL_R)
                text(text_line_1, size = text_size_1, font = font_name,
                     halign = "center", valign = "center", spacing = spacing);
    }
}

// ─── Silhueta 2D: borda (1º offset sobre o texto) ────────────────────────
// Fechamento morfológico (dilata + erode) na string completa para:
//   1. preencher gaps entre letras adjacentes
//   2. suavizar a silhueta superior/inferior (sem ondulações por letra)
// _close_r = 50 % do text_size suaviza variações de altura das letras.
module borda_2d() {
    _close_r = max(text_size_1 * 0.5, border_margin * 2);
    offset(r = border_margin)
        offset(r = -_close_r)
            offset(r = _close_r)
                text_2d();
}

// ─── Silhueta 2D: base (retângulo arredondado tipo badge) ─────────────────
// Fórmula (conforme especificado):
//   Altura = text_size_1 + 2×border_margin + 2×base_extra_margin
//   Largura = (body_max_x - body_min_x) + 2×border_margin + 2×base_extra_margin
//
// Por que text_size_1 e não o height real do glifo:
//   borda_2d() usa _close_r = text_size/2. Isso faz o fechamento morfológico
//   produzir um "stadium" de diâmetro ≈ text_size, independente da altura real
//   do glifo. Usar a altura real do glifo (< text_size) resultaria em base menor
//   que a borda. Logo: max(glyph_height, text_size_1) garante contenção.
//
// Centro Y: médio dos bounds reais do glifo (injetado pelo backend).
// Fallback (sem injeção do backend): usa text_size_1 / 2 como meio.
module base_silhueta_2d() {
    _total_margin = border_margin + base_extra_margin;
    // Altura efetiva: nunca menor que text_size_1
    _glyph_h = (body_max_y - body_min_y > 0.1)
                ? (body_max_y - body_min_y)
                : text_size_1;
    _text_h   = max(_glyph_h, text_size_1);
    // Centro Y real = média dos bounds Y do glifo (ou 0 no fallback)
    _center_y = (body_max_y - body_min_y > 0.1)
                ? (body_min_y + body_max_y) / 2
                : 0;
    // Dimensões finais do retângulo
    _rect_h = _text_h + 2 * _total_margin;
    _rect_w = body_max_x - body_min_x + 2 * _total_margin;
    // Raio do canto: 0 = automático (metade da altura → pill/estádio)
    _corner_r = (base_corner_radius > 0)
                  ? min(base_corner_radius, _rect_h / 2)
                  : _rect_h / 2;
    if (len(chars1) > 0) {
        _inner_w = max(_rect_w - 2 * _corner_r, 0.1);
        _inner_h = max(_rect_h - 2 * _corner_r, 0.1);
        translate([_center_x, _center_y])
            offset(r = _corner_r)
                square([_inner_w, _inner_h], center = true);
    } else {
        offset(r = base_extra_margin)
            borda_2d();
    }
}

// ─── Peça: Letras ─────────────────────────────────────────────────────────
// Encaixam 1mm (RECESS) dentro da borda e sobressaem letter_height acima.
module letras_3d() {
    // As letras usam text() direto — os contadores (buracos internos) ficam
    // visíveis como aberturas para a cor da borda abaixo, que é o visual
    // desejado. A borda (text_2d_solid) já garante que o amarelo da base
    // não apareça nesses buracos.
    z = _base_h + _border_h - 2 * RECESS;
    translate([0, 0, z]) {
        if (len(chars1) > 0) {
            for (i = [0 : len(chars1) - 1])
                if (i < len(char_xs1))
                    translate([char_xs1[i], -text_size_1 / 2, 0])
                        linear_extrude(height = letter_height + RECESS)
                            text(chars1[i], size = text_size_1, font = font_name,
                                 halign = "left", valign = "baseline");
        } else {
            linear_extrude(height = letter_height + RECESS)
                text(text_line_1, size = text_size_1, font = font_name,
                     halign = "center", valign = "center", spacing = spacing);
        }
    }
}

// ─── Peça: Borda ──────────────────────────────────────────────────────────
// Encaixa 1mm (RECESS) dentro da base e tem rebaixo no topo para as letras.
module borda_3d() {
    translate([0, 0, _base_h - RECESS])
        difference() {
            linear_extrude(height = _border_h)
                borda_2d();
            // Rebaixo para encaixar as letras (1mm de profundidade no topo)
            translate([0, 0, _border_h - RECESS])
                linear_extrude(height = RECESS + 0.01)
                    text_2d_solid();
        }
}

// ─── Peça: Base ───────────────────────────────────────────────────────────
// Tem rebaixo no topo para encaixar a borda.
module base_3d() {
    difference() {
        linear_extrude(height = _base_h)
            base_silhueta_2d();
        // Rebaixo para encaixar a borda (1mm de profundidade no topo)
        translate([0, 0, _base_h - RECESS])
            linear_extrude(height = RECESS + 0.01)
                borda_2d();
    }
}

// ─── Dispatcher de partes ─────────────────────────────────────────────────
part = "all";

translate([-_center_x, 0, 0]) {
    if (part == "all") {
        color(base_color)    base_3d();
        color(border_color)  borda_3d();
        color(letters_color) letras_3d();
    } else if (part == "base") {
        color(base_color) base_3d();
    } else if (part == "borda") {
        color(border_color) borda_3d();
    } else if (part == "letras") {
        color(letters_color) letras_3d();
    }
}
