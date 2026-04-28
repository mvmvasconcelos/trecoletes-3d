// cortador_bolacha_formato/model.scad
// Cortador de Bolacha com Formato Livre
//
// Diferente do cortador_bolacha (que tem carimbo + cortador):
//   - Sem carimbo — apenas o cortador.
//   - A silhueta SVG define DIRETAMENTE a borda externa do cortador.
//   - Se o SVG tiver 50×50 mm, a distância exterior entre as paredes é 50×50 mm.
//   - A parede é esculpida para DENTRO da silhueta por wall_thickness mm.

// Injetado pelo Backend
svg_silhueta_path = "silhueta.svg";

// Dimensões (injetadas pelo backend a partir da UI)
art_width  = 50.0;   // [mm] largura da silhueta = dimensão exterior do cortador
art_height = 50.0;   // [mm] altura da silhueta  = dimensão exterior do cortador

// Configurações
wall_height    = 15.0;
wall_thickness = 2.4;
brim_width     = 5.0;
sharp_edge     = true;
chamfer_height = 2.4; // Altura fixa para o chanfro no topo do cortador

// ============================================================
// silhoueta_shape: importa e escala a silhueta SVG.
// extra_r > 0 → expande para fora (usado pelo brim)
// extra_r < 0 → contrai para dentro (esculpe o interior do cortador)
// extra_r = 0 → forma exata do SVG = borda exterior do cortador
// ============================================================
module silhoueta_shape(extra_r = 0) {
    offset(r = extra_r, $fn = 128) {
        translate([-art_width / 2, -art_height / 2]) {
            resize([art_width, art_height], auto=[false, false]) {
                import(svg_silhueta_path);
            }
        }
    }
}

// ============================================================
// cortador: parede vazada seguindo a silhueta + brim de apoio na base
// ============================================================
module cortador() {
    color("IndianRed")
    if (sharp_edge) {
        // ── Parede reta de z=0 até onde começa o chanfro ──────────────────
        difference() {
            linear_extrude(height = wall_height - chamfer_height + 0.01) {
                silhoueta_shape();
            }
            translate([0, 0, -1])
            linear_extrude(height = wall_height + 2) {
                silhoueta_shape(extra_r = -wall_thickness);
            }
        }

        // ── Topo chanfrado: lâmina reduz de wall_thickness → 0.4 mm ────────
        // A subtração do interior é feita UMA VEZ fora do loop para evitar
        // chamar silhoueta_shape() repetidamente (pesado em SVGs complexos).
        translate([0, 0, wall_height - chamfer_height])
        difference() {
            union() {
                for (i = [0 : 9]) {
                    z = i * (chamfer_height / 10);
                    h = (chamfer_height / 10) + 0.01;
                    shrink_amount = (wall_thickness - 0.4) * (i / 9);
                    translate([0, 0, z])
                    linear_extrude(height = h) {
                        silhoueta_shape(extra_r = -shrink_amount);
                    }
                }
            }
            translate([0, 0, -0.01])
            linear_extrude(height = chamfer_height + 0.1) {
                silhoueta_shape(extra_r = -wall_thickness);
            }
        }
    } else {
        // ── Parede com topo plano (sem chanfro) ──────────────────────────
        difference() {
            linear_extrude(height = wall_height) {
                silhoueta_shape();
            }
            translate([0, 0, -1])
            linear_extrude(height = wall_height + 2) {
                silhoueta_shape(extra_r = -wall_thickness);
            }
        }
    }

    // ── Brim de apoio (z=0, altura=2mm) para boa aderência na mesa ────────
    color("FireBrick")
    linear_extrude(height = 2.0) {
        difference() {
            silhoueta_shape(extra_r = brim_width);
            silhoueta_shape();
        }
    }
}

// ============================================================
// Controle de Renderização
// ============================================================
part = "cortador";

if (part == "cortador") {
    mirror([1, 0, 0]) cortador();
}
