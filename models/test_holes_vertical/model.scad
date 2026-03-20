/*[Configurações]*/
holes  = [5, 5.2];  // diâmetros a testar (mm)
margin = 2;          // margem entre furos e bordas (mm)

// ── funções auxiliares ─────────────────────────────────────────────────────
function _max(v, i=0, m=0)   = i == len(v) ? m : _max(v, i+1, v[i] > m ? v[i] : m);
function _sum(v, i=0, s=0)   = i == len(v) ? s : _sum(v, i+1, s + v[i]);
function _sum_range(v, a, b) = a > b ? 0 : v[a] + _sum_range(v, a+1, b);

// Centro X do furo i (furos lado a lado em X)
function hole_x(h, mg, i) = mg*(i+1) + _sum_range(h, 0, i-1) + h[i]/2;

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
    max_d = _max(holes);

    w = _sum(holes) + margin * (n + 1);
    d = 15;
    h = max_d + margin * 2;

    difference() {
        cube([w, d, h]);

        for (i = [0 : n - 1]) {
            // Furo passante ao longo de Y
            translate([hole_x(holes, margin, i), -1, h / 2])
                rotate([-90, 0, 0])
                    cylinder(h = d + 2, d = holes[i], $fn = 64);

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
