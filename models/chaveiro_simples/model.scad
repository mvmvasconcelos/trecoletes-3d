// Fontes disponíveis (bundled na pasta do modelo)
use <Chewy-Regular.ttf>
use <Bangers-Regular.ttf>

// Parâmetros do modelo
text_line_1       = "Nome";
text_line_2       = "";
text_size_1       = 9;
text_size_2       = 7;
text_height       = 1;
font_name         = "Chewy:style=Regular";
text_halign       = "center";
spacing           = 1.0;
word_spacing      = 1.0;
line_spacing      = 1.0;

base_width        = 60;
base_height       = 45;
base_thickness    = 2;
base_radius       = 3;

outline_distance  = 1.0;
outline_height    = 0.4;
outline_mode      = "fill"; // fill/hollow

hole_outer_diameter = 5;
hole_inner_diameter = 3;

// Texto-para-SVG (injetado pelo backend)
chars1            = "";
char_xs1          = [];
chars2            = "";
char_xs2          = [];

// Ajuste de largura máxima  (0 = sem limitação)
max_width         = 0;
scale_x           = 1.0;

// Cores
base_color        = "#1B40D1";
letters_color     = "#FFFFFF";
outline_color     = "#00FFAA";

// Helpers
lines = (text_line_2 == "") ? [text_line_1] : [text_line_1, text_line_2];
sizes = (text_line_2 == "") ? [text_size_1] : [text_size_1, text_size_2];

function line_y(i) =
    len(lines) == 1 ? 0 :
    i == 0 ? (sizes[1] * line_spacing * 0.6) :
              -(sizes[0] * line_spacing * 0.6);

module text_2d() {
    if (len(chars1) > 0) {
        for (i = [0 : len(chars1) - 1])
            if (i < len(char_xs1))
                translate([char_xs1[i], line_y(0) - text_size_1/2, 0])
                    text(chars1[i], size = text_size_1, font = font_name,
                         halign = "left", valign = "baseline");

        if (len(chars2) > 0)
            for (i = [0 : len(chars2) - 1])
                if (i < len(char_xs2))
                    translate([char_xs2[i], line_y(1) - text_size_2/2, 0])
                        text(chars2[i], size = text_size_2, font = font_name,
                             halign = "left", valign = "baseline");
    } else {
        for (i = [0 : len(lines) - 1])
            translate([0, line_y(i), 0])
                text(lines[i], size = sizes[i], font = font_name,
                     halign = text_halign, valign = "center", spacing = spacing);
    }
}

module text_outline_2d() {
    if (outline_mode == "fill") {
        offset(r = outline_distance, $fn = 64)
            text_2d();
    } else {
        difference() {
            offset(r = outline_distance, $fn = 64)
                text_2d();
            text_2d();
        }
    }
}

module base_2d() {
    offset(r = base_radius)
        square([base_width - 2*base_radius, base_height - 2*base_radius], center = true);
}

module keyring_piece() {
    translate([-base_width/2, base_height/2, 0]) {
        difference() {
            translate([0, 0, base_thickness/2])
                cylinder(d = hole_outer_diameter, h = base_thickness, center = true, $fn = 96);
            translate([0, 0, base_thickness/2])
                cylinder(d = hole_inner_diameter, h = base_thickness + 2, center = true, $fn = 96);
        }
    }
}

module base_part() {
    union() {
        linear_extrude(height = base_thickness)
            base_2d();
        keyring_piece();
    }
}

module letters_part() {
    translate([0, 0, base_thickness])
        linear_extrude(height = text_height)
            text_2d();
}

module outline_part() {
    translate([0, 0, base_thickness])
        linear_extrude(height = outline_height)
            text_outline_2d();
}

module hole_part() {
    keyring_piece();
}

part = "all";

scale([scale_x, 1, 1]) {
    if (part == "all") {
        color(base_color)    base_part();
        color(outline_color) outline_part();
        color(letters_color) letters_part();
    } else if (part == "base") {
        color(base_color) base_part();
    } else if (part == "letters") {
        color(letters_color) letters_part();
    } else if (part == "outline") {
        color(outline_color) outline_part();
    } else if (part == "hole") {
        color(base_color) hole_part();
    }
}
