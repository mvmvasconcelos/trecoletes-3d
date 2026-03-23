/*[Parametros]*/
folga = 0.2; // mm
part = "all";

// Bloco externo fixo (mm)
block_len = 25;
block_w = 10;
block_h = 10;

// Perfil interno nominal da caneta (mm)
cone_len = 23;
tip_d_nominal = 2.0;
base_d_nominal = 7.2;

// Evita diametros invalidos
function _max2(a, b) = a > b ? a : b;

tip_d = _max2(0.2, tip_d_nominal + folga);
base_d = _max2(tip_d, base_d_nominal + folga);

tail_len = block_len - cone_len; // 2 mm
start_x = -block_len / 2;
cone_end_x = start_x + cone_len;

eps = 0.05;

module body() {
    difference() {
        cube([block_len, block_w, block_h], center = true);

        union() {
            // Trecho conico: 0-23 mm, d2 -> d7.2
            translate([start_x - eps, 0, 0])
                rotate([0, 90, 0])
                    cylinder(
                        h = cone_len + eps,
                        d1 = tip_d,
                        d2 = base_d,
                        $fn = 96
                    );

            // Trecho cilindrico final: 23-25 mm, d7.2 constante
            translate([cone_end_x, 0, 0])
                rotate([0, 90, 0])
                    cylinder(
                        h = tail_len + eps,
                        d = base_d,
                        $fn = 96
                    );
        }
    }
}

if (part == "body") {
    body();
} else {
    body();
}
