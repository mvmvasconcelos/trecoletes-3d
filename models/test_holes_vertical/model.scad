/*[Configurações]*/
holes  = [5, 5.2];  // medidas a testar (mm): circulo=diametro, hexagono=lado a lado
margin = 2;          // margem entre furos e bordas (mm)
hole_type = "CIRCLE"; // "CIRCLE" | "HEXAGON"

// ── funções auxiliares ─────────────────────────────────────────────────────
function _max(v, i=0, m=0)   = i == len(v) ? m : _max(v, i+1, v[i] > m ? v[i] : m);
function _sum(v, i=0, s=0)   = i == len(v) ? s : _sum(v, i+1, s + v[i]);
function _sum_range(v, a, b) = a > b ? 0 : v[a] + _sum_range(v, a+1, b);

// Em hexágono, usamos a medida entre lados opostos (flat-to-flat).
// O cylinder(d=..., $fn=6) usa a medida entre vértices opostos (corner-to-corner).
// Conversão: d_corner = d_flat * 2 / sqrt(3).
function hole_cut_d(raw_d) = hole_type == "HEXAGON" ? raw_d * 2 / sqrt(3) : raw_d;

// Centro X do furo i (furos lado a lado em X)
function hole_x(h, mg, i) = mg*(i+1) + _sum_range(h, 0, i-1) + hole_cut_d(h[i])/2;

// ── módulo principal ───────────────────────────────────────────────────────
// Cubo de teste de furos passantes (eixo Y, frente → fundo).
//
//   Largura (X)      = sum(holes) + margin*(n+1)  — cresce com mais furos
//   Profundidade (Y) = 15 mm (fixo)
//   Altura (Z)       = max(holes) + margin*2
//
// Exemplo com 1 furo de 5 mm, margem 2: 9 × 15 × 9 mm
//
module test_holes_vertical() {
    n     = len(holes);
    max_d = _max([for (h = holes) hole_cut_d(h)]);

    w = _sum([for (h = holes) hole_cut_d(h)]) + margin * (n + 1);
    d = 15;
    h = max_d + margin * 2;

    difference() {
        cube([w, d, h]);

        for (i = [0 : n - 1]) {
            // Furo passante ao longo de Y
            translate([hole_x(holes, margin, i), -1, h / 2])
                rotate([-90, 0, 0])
                    cylinder(h = d + 2,
                             d = hole_cut_d(holes[i]),
                             $fn = (hole_type == "HEXAGON") ? 6 : 64);

            // Diâmetro em baixo relevo na face frontal (Y=0)
            // Alinhado ao centro X do furo, na margem inferior
            translate([hole_x(holes, margin, i), -0.01, margin * 0.5])
                rotate([-90, 0, 0])
                    mirror([0, 1, 0])
                        linear_extrude(0.51)
                            text(str(holes[i]),
                                 size   = max(0.5, margin * 0.7),
                                 halign = "center",
                                 valign = "center",
                                 $fn    = 32);
        }
    }
}

test_holes_vertical();
