// Path absoluto necessário: openscad-nightly (usado por este modelo, ver
// OPENSCAD_NIGHTLY_MODELS em backend/app/api/generator.py) não resolve o
// include relativo <BOSL2/...> — falha silenciosamente (só warning) e cyl()
// vira module indefinido, sumindo com a cápsula sem erro visível.
include </usr/share/openscad/libraries/BOSL2/std.scad>

/*[Texto]*/
text_line_1    = "Catiele";
text_line_2    = "Secretária";
text_size_1    = 10.0;
text_size_2    = 10.0;
font_name      = "Chewy:style=Regular";
letter_height  = 1.2;
base_height    = 13.0;
outline_margin = 2.5;
spacing        = 1.0;
line_spacing   = 0.85;

/*[Posicionamento por caractere — injetado pelo backend]*/
chars1   = "";
char_xs1 = [];
chars2   = "";
char_xs2 = [];

/*[Bounds do texto — injetados pelo backend]*/
body_min_x  = -18.5;
body_max_x  = 18.5;
body_span_x = 37.0;
scale_x     = 1.0;
line_1_min_x = -18.5;
line_1_max_x = 18.5;
line_2_min_x = -18.5;
line_2_max_x = 18.5;

/*[Geometria da tampa BIC]*/
tamanho_capsula = 35.0;
hole_diameter   = 8.1;
raio_bic        = hole_diameter / 2;
raio_ponta      = 3.0 / 2;
prof_cone       = 15.0;
eps             = 0.01;

/*[Cores]*/
base_color    = "#1B40D1";
letters_color = "#FFFFFF";

part = "all";

function get_line_y(type) =
    (type == "main") ? 0.0 :
    (type == "sec" && text_line_2 != "") ? ((text_size_1 + text_size_2) * 0.6 * line_spacing) :
    0.0;

function text_left_bound() = body_min_x != 0 ? body_min_x : -(body_span_x / 2);
function text_right_bound() = body_max_x != 0 ? body_max_x : (body_span_x / 2);
function primary_left_bound() = line_1_min_x != 0 ? line_1_min_x : text_left_bound();
function primary_right_bound() = line_1_max_x != 0 ? line_1_max_x : text_right_bound();

module draw_fallback_text(text_value, text_size, line_y, halign_mode) {
    translate([0, line_y, 0])
        text(text_value, size = text_size, font = font_name, halign = halign_mode, valign = "center", spacing = spacing);
}

module draw_text_line(chars, char_xs, text_value, text_size, line_y) {
    if (len(chars) > 0 && len(char_xs) > 0) {
        for (i = [0 : len(chars) - 1]) {
            if (i < len(char_xs)) {
                translate([char_xs[i], line_y - text_size / 2, 0])
                    text(chars[i], size = text_size, font = font_name, halign = "left", valign = "baseline");
            }
        }
    } else {
        draw_fallback_text(text_value, text_size, line_y, "center");
    }
}

module draw_text_2d() {
    draw_text_line(chars1, char_xs1, text_line_1, text_size_1, get_line_y("main"));

    if (text_line_2 != "") {
        draw_text_line(chars2, char_xs2, text_line_2, text_size_2, get_line_y("sec"));
    }
}

module text_base_2d() {
    offset(delta = 0.01)
        draw_text_2d();
}

module capsule_body(capsula_start_x, base_height, tamanho_capsula, raio_ext) {
    translate([capsula_start_x + (tamanho_capsula / 2), 0, base_height / 2])
        rotate([0, 90, 0])
            cyl(l = tamanho_capsula, r = raio_ext, rounding2 = raio_ext, $fn = 64);
}

module capsule_cutout(capsula_start_x, capsula_end_x, base_height, raio_bic, raio_ponta, parede_capsula, prof_cone, outline_margin) {
    fim_do_furo = capsula_end_x - parede_capsula;
    cone_start = fim_do_furo - prof_cone;
    furo_start_x = min(primary_left_bound() - outline_margin, capsula_start_x, 0) - 100.0;
    furo_length = cone_start - furo_start_x;

    translate([0, 0, base_height / 2]) {
        translate([furo_start_x, 0, 0])
            rotate([0, 90, 0])
                cylinder(r = raio_bic, h = furo_length + eps, $fn = 64);

        translate([cone_start, 0, 0])
            rotate([0, 90, 0])
                cylinder(r1 = raio_bic, r2 = raio_ponta, h = prof_cone, $fn = 64);
    }
}

module base_with_tunnel() {
    margem_fixa_capsula = 2.5;
    capsula_end_x = primary_right_bound() + margem_fixa_capsula;
    capsula_start_x = capsula_end_x - tamanho_capsula;
    raio_ext = max(base_height / 2, raio_bic + 0.01);
    parede_capsula = raio_ext - raio_bic;

    difference() {
        union() {
            linear_extrude(height = base_height)
                offset(r = outline_margin, $fn = 64)
                    text_base_2d();

            capsule_body(capsula_start_x, base_height, tamanho_capsula, raio_ext);
        }

        capsule_cutout(capsula_start_x, capsula_end_x, base_height, raio_bic, raio_ponta, parede_capsula, prof_cone, outline_margin);
    }
}

module raised_letters() {
    translate([0, 0, base_height]) {
        linear_extrude(height = letter_height) {
            draw_text_2d();
        }
    }
}

translate([-(primary_right_bound() + 2.5), 0, 0]) {
    scale([scale_x, 1, 1]) {
        if (part == "all") {
            color(base_color) base_with_tunnel();
            color(letters_color) raised_letters();
        } else if (part == "base") {
            color(base_color) base_with_tunnel();
        } else if (part == "letters") {
            color(letters_color) raised_letters();
        }
    }
}