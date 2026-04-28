// ============================================================
// carimbo_eva_svg — Carimbo EVA a partir de Arte SVG
// Partes: segurador, molde_base, molde_arte, forma
// ============================================================

// Injetado pelo Backend
svg_linhas_path   = "linhas.svg";
svg_silhueta_path = "silhueta.svg";

// Dimensões da arte (injetadas pelo backend a partir da UI)
art_width  = 70.0;
art_height = 70.0;
art_center_x = art_width  / 2.0;
art_center_y = art_height / 2.0;

// Parâmetros de ajuste
line_offset         = 0.0;   // [px → mm via scad_multiplier 0.3] expande as linhas da arte
form_margin         = 1.5;   // [mm] margem extra ao redor da silhueta no furo da forma
art_relief_positive = true;  // true=relevo saliente, false=relevo afundado (cavidade)

// Espessuras fixas das peças
segurador_height  = 3.0;     // [mm] espessura do segurador
molde_base_height = 2.0;     // [mm] espessura da base do molde
molde_art_height  = 1.0;     // [mm] espessura do relevo da arte no molde
forma_height      = 10.0;    // [mm] espessura total da forma

// Formato e dimensões do molde/forma
mold_shape    = "rectangle"; // "circle" | "rectangle" | "organic"
mold_width    = 80.0;        // [mm] largura (usado em circle/rectangle)
mold_height   = 80.0;        // [mm] altura  (usado em circle/rectangle)
mold_rounding = 3.0;         // [mm] arredondamento dos cantos (apenas rectangle)
mold_border   = 8.0;         // [mm] espessura mínima da borda (usado em organic)

// fill_r: raio suficientemente grande para fechar buracos na silhueta orgânica
// Deve ser > metade do maior vazio interno na arte.
fill_r = 20;

// Pinos de alinhamento (meias-esferas nos cantos do molde_base / furos na forma)
use_alignment_pins = true;   // true = gera pinos e furos
pin_diameter       = 5.0;    // [mm] diâmetro do pino (meia-esfera)
pin_tolerance      = 0.25;   // [mm] folga extra no furo (diâmetro furo = pin_diameter + pin_tolerance)
pin_inset          = 4.5;    // [mm] FIXO: = pin_radius(2.5) + 2mm folga de borda
// Dimensões do molde são calculadas pelo frontend para garantir:
//   - 2mm entre pino e borda do molde (= pin_inset)
//   - 2mm entre borda do pino e furo da forma
// Fórmula: mold_dim = art_dim + 2×form_margin + pin_diameter + 2×pin_inset + 2×gap_pino_furo

// Peça a renderizar (injetado pelo backend)
part = "all";

// ── SVG ART IMPORT ────────────────────────────────────────────────────────────
// O backend normaliza o SVG para começar em (0,0), então o conteúdo abrange
// de forma confiável de (0,0) → (art_width, art_height).
// O translate centraliza a arte em torno da origem (0,0).
module art_svg() {
    translate([-art_width / 2, -art_height / 2]) {
        offset(r = line_offset) {
            resize([art_width, art_height], auto=[false, false]) {
                import(svg_linhas_path);
            }
        }
    }
}

// ── SILHUETA SÓLIDA ────────────────────────────────────────────────────────────
// Usa fechamento morfológico (expande→preenche buracos→encolhe) para produzir
// uma silhueta contínua e sólida mesmo em artes com traços simples.
module silhueta_shape(extra_r = 0) {
    offset(r = extra_r - fill_r) {
        offset(r = fill_r) {
            art_svg();
        }
    }
}

// ── CONTORNO EXTERNO DO MOLDE E DA FORMA ─────────────────────────────────────
// circle:   elipse com semi-eixos mold_width/2 e mold_height/2
// rectangle: retângulo com cantos arredondados
// organic:  silhueta da arte expandida por mold_border mm
module mold_outline() {
    if (mold_shape == "circle") {
        scale([mold_width / 2, mold_height / 2])
            circle(r = 1, $fn = 128);
    } else if (mold_shape == "organic") {
        offset(r = mold_border) silhueta_shape();
    } else {
        offset(r = mold_rounding, $fn = 32)
            offset(delta = -mold_rounding)
                square([mold_width, mold_height], center = true);
    }
}

// ── POSIÇÕES DOS PINOS ──────────────────────────────────────────────────────
// Retângulo: pinos nos 4 cantos, a pin_inset mm de cada borda.
// Círculo / Orgânico: pinos nos 4 eixos cardinais (±X,0) e (0,±Y),
//   centros a form_margin + pin_radius + 2mm além da borda da silhueta.
module pin_corners() {
    px = (mold_shape == "rectangle")
        ? (mold_width/2  - pin_inset)
        : (art_width/2  + form_margin + pin_diameter/2 + 2);
    py = (mold_shape == "rectangle")
        ? (mold_height/2 - pin_inset)
        : (art_height/2 + form_margin + pin_diameter/2 + 2);
    if (mold_shape == "rectangle") {
        // 4 cantos
        for (sx = [-1, 1]) for (sy = [-1, 1])
            translate([sx * px, sy * py, 0]) children();
    } else {
        // 4 eixos cardinais
        translate([ px,  0, 0]) children();
        translate([-px,  0, 0]) children();
        translate([  0,  py, 0]) children();
        translate([  0, -py, 0]) children();
    }
}

// ── SEGURADOR ────────────────────────────────────────────────────────────────
// Silhueta da arte extrudada com segurador_height mm de espessura.
// Cabo (Segurador.stl) fixado ao centro, sobre a face plana.
// O STL já é centrado em XY (±4.5mm) e tem base em Z=0.
module segurador() {
    union() {
        linear_extrude(height = segurador_height)
            silhueta_shape();
        translate([0, 0, segurador_height])
            import("segurador_handle.stl");
    }
}

// ── MOLDE BASE ───────────────────────────────────────────────────────────────
// Em modo positivo (art_relief_positive=true):
//   Base plana de molde_base_height mm no formato do mold_outline.
// Em modo negativo (art_relief_positive=false):
//   Base completa de (molde_base_height + molde_art_height) mm com
//   a arte subtraída como cavidade na camada superior.
module molde_base() {
    union() {
        if (art_relief_positive) {
            linear_extrude(height = molde_base_height)
                mold_outline();
        } else {
            difference() {
                linear_extrude(height = molde_base_height + molde_art_height)
                    mold_outline();
                translate([0, 0, molde_base_height])
                    linear_extrude(height = molde_art_height + 0.1)
                        art_svg();
            }
        }
        // Pinos de alinhamento: meias-esferas salientes no topo
        if (use_alignment_pins) {
            pin_corners()
                translate([0, 0, molde_base_height])
                    sphere(d = pin_diameter, $fn = 32);
        }
    }
}

// ── MOLDE ARTE ───────────────────────────────────────────────────────────────
// Em modo positivo:  relevo de molde_art_height mm sobreposto à molde_base.
// Em modo negativo:  placeholder mínimo (arte já integrada na molde_base).
module molde_arte() {
    if (art_relief_positive) {
        translate([0, 0, molde_base_height - 0.1])
            linear_extrude(height = molde_art_height + 0.1)
                art_svg();
    } else {
        // Placeholder mínimo para evitar geometria vazia no OpenSCAD
        cube([0.1, 0.1, 0.1]);
    }
}

// ── FORMA ────────────────────────────────────────────────────────────────────
// Base de forma_height mm no formato mold_outline com furo no formato da
// silhueta do segurador (+ form_margin mm de folga).
// Serve como guia/gabarito para recortar o EVA.
module forma() {
    difference() {
        linear_extrude(height = forma_height)
            mold_outline();
        // Furo da silhueta (guia de recorte)
        translate([0, 0, -0.1])
            linear_extrude(height = forma_height + 0.2)
                silhueta_shape(extra_r = form_margin);
        // Furos hemisféricos nos cantos para receber os pinos do molde_base
        if (use_alignment_pins) {
            pin_corners()
                sphere(d = pin_diameter + pin_tolerance, $fn = 32);
        }
    }
}

// ── DISPATCHER ───────────────────────────────────────────────────────────────
if (part == "all") {
    segurador();
    translate([0, 0, 20]) { molde_base(); molde_arte(); }
    translate([0, 0, 50]) forma();
} else if (part == "segurador") {
    segurador();
} else if (part == "molde_base") {
    molde_base();
} else if (part == "molde_arte") {
    molde_arte();
} else if (part == "forma") {
    forma();
}
