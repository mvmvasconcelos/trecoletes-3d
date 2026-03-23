/*[Parametros]*/
diametros = [7.2, 7.5, 7.8]; // mm
margin = 1.4; // mm
part = "all";

// Perfil externo dinamico (mm)
block_len = 35;

// Perfil interno nominal da caneta (mm)
cone_len = 23;
tip_d = 2.0;

// Funcoes auxiliares
function _max(v, i=0, m=0) = i == len(v) ? m : _max(v, i+1, v[i] > m ? v[i] : m);
function _sum(v, i=0, s=0) = i == len(v) ? s : _sum(v, i+1, s + v[i]);
function _sum_range(v, a, b) = a > b ? 0 : v[a] + _sum_range(v, a+1, b);
function _safe_d(v) = v < tip_d ? tip_d : v;
function hole_x(ds, mg, i) = mg * (i + 1) + _sum_range(ds, 0, i - 1) + _safe_d(ds[i]) / 2;

safe_ds = [for (d = diametros) _safe_d(d)];
n = len(safe_ds);
block_w = _sum(safe_ds) + margin * (n + 1);
block_h = _max(safe_ds) + margin * 2;
label_size = max(1.5, margin * 1.4);

tail_len = block_len - cone_len; // 2 mm

eps = 0.05;

module tapered_hole(final_d) {
    union() {
        // Trecho conico: 0-23 mm, d2 -> diametro final
        translate([0, -eps, 0])
            rotate([-90, 0, 0])
                cylinder(
                    h = cone_len + eps,
                    d1 = tip_d,
                    d2 = final_d,
                    $fn = 96
                );

        // Trecho cilindrico final: 23-25 mm, diametro constante
        translate([0, cone_len, 0])
            rotate([-90, 0, 0])
                cylinder(
                    h = tail_len + eps,
                    d = final_d,
                    $fn = 96
                );
    }
}

module body() {
    difference() {
        cube([block_w, block_len, block_h]);

        for (i = [0 : n - 1]) {
            translate([hole_x(safe_ds, margin, i), 0, block_h / 2])
                tapered_hole(safe_ds[i]);

            // Etiqueta do diametro em baixo relevo na face frontal (Y=0)
            translate([hole_x(safe_ds, margin, i), -0.01, label_size * 0.75])
                rotate([-90, 0, 0])
                    mirror([0, 1, 0])
                        linear_extrude(1.5)
                            text(
                                str(safe_ds[i]),
                                size = label_size,
                                halign = "center",
                                valign = "center",
                                $fn = 32
                            );
        }
    }
}

if (part == "body") {
    body();
} else {
    body();
}
