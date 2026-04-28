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
form_margin         = 0.4;   // [mm] margem extra ao redor da silhueta no furo da forma
art_relief_positive = true;  // true=relevo saliente, false=relevo afundado (cavidade)

// Espessuras fixas das peças
segurador_height  = 3.0;     // [mm] espessura do segurador
molde_base_height = 2.0;     // [mm] espessura da base do molde
molde_art_height  = 1.0;     // [mm] espessura do relevo da arte no molde
forma_height      = 10.0;    // [mm] espessura total da forma

// Formato e dimensões do molde/forma
mold_shape    = "rectangle"; // "circle" (elipse) | "rectangle" (retângulo)
mold_width    = 80.0;        // [mm] largura do molde/forma
mold_height   = 80.0;        // [mm] altura do molde/forma
mold_rounding = 3.0;         // [mm] arredondamento dos cantos (apenas no modo retângulo)

// fill_r: raio suficientemente grande para fechar buracos na silhueta orgânica
// Deve ser > metade do maior vazio interno na arte.
fill_r = 20;

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
// circle: elipse com semi-eixos mold_width/2 e mold_height/2
// rectangle: retângulo com cantos arredondados
module mold_outline() {
    if (mold_shape == "circle") {
        scale([mold_width / 2, mold_height / 2])
            circle(r = 1, $fn = 128);
    } else {
        offset(r = mold_rounding, $fn = 32)
            offset(delta = -mold_rounding)
                square([mold_width, mold_height], center = true);
    }
}

// ── SEGURADOR ────────────────────────────────────────────────────────────────
// Silhueta da arte extrudada com segurador_height mm de espessura.
// Usado como "carimbo" manual para pressionar no EVA.
module segurador() {
    linear_extrude(height = segurador_height)
        silhueta_shape();
}

// ── MOLDE BASE ───────────────────────────────────────────────────────────────
// Em modo positivo (art_relief_positive=true):
//   Base plana de molde_base_height mm no formato do mold_outline.
// Em modo negativo (art_relief_positive=false):
//   Base completa de (molde_base_height + molde_art_height) mm com
//   a arte subtraída como cavidade na camada superior.
module molde_base() {
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
        translate([0, 0, -0.1])
            linear_extrude(height = forma_height + 0.2)
                silhueta_shape(extra_r = form_margin);
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
