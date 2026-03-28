// Injetado pelo Backend
use <TAN-NIMBUS.ttf>
use <eastman.ttf>
svg_linhas_path   = "linhas.svg";
svg_silhueta_path = "silhueta.svg";  // reservado, não usado diretamente

// Dimensões (injetadas pelo backend a partir da UI)
art_width  = 70.0;   // [mm] largura alvo da arte
art_height = 70.0;   // [mm] altura alvo da arte

// Alturas e Configurações
base_height    = 2.0; 
line_height    = 4.0;
wall_height    = 15.0;
brim_width     = 5.0;
wall_thickness = 2.4;
silhouette_exp = 4.0; // [mm] espaçamento entre a borda da arte e a silhueta externa
folga          = 2.0;
line_offset    = 0.0; // [mm] expande as linhas da arte para fora (efeito de espessura do traço)
sharp_edge     = true;
chamfer_height = 2.4; // Altura fixa para o chanfro no topo do cortador
cutter_rounding = 2.0; // [mm] arredondamento dos cantos externos do cortador

// Formato do cortador: "silhouette" | "square" | "circle" | "rectangle" | "hexagon"
cutter_shape  = "silhouette";
cutter_width  = 80.0; // [mm] usado por quadrado/círculo/retângulo/hexágono
cutter_height = 80.0; // [mm] usado por retângulo/hexágono

// Centro da arte no espaço SCAD após resize([art_width, art_height]).
// Como svgProcessor.ts normaliza o SVG exportado para começar em (0,0),
// o conteúdo abrange de forma confiável de (0,0) → (art_width, art_height), então o centro
// fica sempre em (art_width/2, art_height/2).  O backend pode substituir isso.
art_center_x = art_width  / 2.0;
art_center_y = art_height / 2.0;

// ============================================================
// art_svg: redimensiona o SVG para o tamanho em mm com offset opcional da linha
// ============================================================
    // ── HISTÓRICO DE DEBUG DE CENTRALIZAÇÃO ──────────────────────
    // O SVG do frontend (paper.js) originalmente tinha o viewBox muito
    // maior que o conteúdo (ex: "0 0 500 500" mas as linhas em 90→410).
    // O resize() do OpenSCAD redimensiona a partir da origem, então o espaço vazio
    // também era redimensionado, tirando o centro de (art_width/2, art_height/2).
    //
    // Tentativa 1:  translate([-aw/2, +ah/2])   — ERRADO (assumiu inversão de Y)
    // Tentativa 2:  translate([-aw/2, -ah/2])   — fórmula correta MAS
    //               só funciona quando o conteúdo do SVG começa em (0,0).
    // Tentativa 3:  Correção no svgProcessor.ts para transladar cada PathItem
    //               individualmente. NÃO ajudou porque o exportSVG do paper.js
    //               ainda emitia o viewBox inteiro do tamanho do canvas.
    // Tentativa 4 (correção atual, 09/03/2026):
    //   A função normalize_svg_to_origin() do Backend (_svg_normalize.py)
    //   analisa os dados do path do SVG, encontra os limites reais da arte,
    //   adiciona o translate para começar de fato no zero (<g transform="translate(-mX,-mY)">)
    //   e define o viewBox como "0 0 contentW contentH". Após isso, o resize() do SCAD
    //   posiciona a arte perfeitamente de (0,0) → (art_width, art_height).
module art_svg() {
    translate([-art_width / 2, -art_height / 2]) {
        offset(r = line_offset) {
            resize([art_width, art_height], auto=[false, false]) {
                import(svg_linhas_path);
            }
        }
    }
}


// ============================================================
// silhoueta_shape: gera a silhueta orgânica a partir da arte
// Usa fechamento morfológico (expande→preenche buracos→encolhe) para que o
// resultado seja uma forma sólida sem vazados, mesmo para formatos de linhas de traço simples.
// O fill_r precisa ser > do que a metade do maior buraco presente no desenho da arte.
// ============================================================
fill_r = 20; // [mm] raio grande o suficiente para emendar e preencher qualquer buraco na arte

module silhoueta_shape(extra_r = 0) {
    offset(r = silhouette_exp + extra_r - fill_r) {
        offset(r = fill_r) {
            art_svg();
        }
    }
}

// ============================================================
// main_outline: direciona para o formato escolhido do cortador.
// Todas as formas são centralizadas em (0,0) — igual ao art_svg() acima.
// extra_r adiciona um offset uniforme para fora (espessura da parede / brim).
// ============================================================
module main_outline(extra_r = 0) {
    if (cutter_shape == "silhouette" || cutter_shape == "") {
        // silhoueta_shape é derivado do art_svg(), portanto já está em (0,0).
        silhoueta_shape(extra_r);
    } else if (cutter_shape == "square") {
        s = cutter_width + extra_r * 2;
        offset(r = cutter_rounding, $fn = 32)
            offset(delta = -cutter_rounding)
                square([s, s], center = true);
    } else if (cutter_shape == "circle") {
        circle(r = cutter_width / 2 + extra_r, $fn = 128);
    } else if (cutter_shape == "rectangle") {
        offset(r = cutter_rounding, $fn = 32)
            offset(delta = -cutter_rounding)
                square([cutter_width  + extra_r * 2, cutter_height + extra_r * 2], center = true);
    } else if (cutter_shape == "hexagon") {
        r_hex = (cutter_width / 2) / cos(30);
        offset(r = cutter_rounding, $fn = 32)
            offset(delta = -cutter_rounding)
                circle(r = r_hex + extra_r, $fn = 6);
    } else {
        silhoueta_shape(extra_r); // fallback
    }
}

// ============================================================
// Módulo: Carimbo
//   - Placa base (seguindo o formato e offset de main_outline)
//   - Arte em alto relevo no topo
// ============================================================
module carimbo() {
    color("SlateGray")
    difference() {
        linear_extrude(height = base_height) {
            main_outline(extra_r = -folga);
        }
        // Furo para o pegador (8mm diametro x 1mm profundidade, rente à mesa z=0)
        translate([0, 0, -0.1])
        cylinder(d = 8, h = 1.1, $fn = 64);
        
        // Marca d'água Principal
        translate([0, -11, -0.1])
        linear_extrude(height = 1.1) {
            text("ADOIS", font="TAN \\- NIMBUS:style=Regular", size=10, halign="center", valign="center");
        }
        
        // Marca d'água Secundária
        translate([0, -22, -0.1])
        linear_extrude(height = 1.1) {
            text("STUDIO", font="Eastman Condensed Alt Trial:style=Regular", size=4.5, halign="center", valign="center");
        }
    }

    color("WhiteSmoke")
    translate([0, 0, base_height])
    linear_extrude(height = line_height - base_height) {
        art_svg();
    }
}

// ============================================================
// Módulo: Cortador (Cookie Cutter)
//   - Parede vazada acompanhando a geometria externa (main_outline)
//   - Borda de proteção e apoio (brim) na base
// ============================================================
module cortador() {
    color("IndianRed")
    if (sharp_edge) {
        // Parede reta até a altura onde começa o chanfro da lâmina
        difference() {
            linear_extrude(height = wall_height - chamfer_height + 0.01) {
                main_outline(extra_r = wall_thickness);
            }
            translate([0, 0, -1])
            linear_extrude(height = wall_height + 2) {
                main_outline();
            }
        }
        
        // Topo chanfrado (camadas em degraus - stepped layers)
        // Reduz gradualmente da espessura bruta da parede até uma borda fina de 0.4mm
        // A subtração do contorno interno é feita UMA ÚNICA VEZ no nível 3D (fora do loop),
        // evitando chamar silhoueta_shape() 10x a mais. Reduz ~42% das chamadas pesadas.
        translate([0, 0, wall_height - chamfer_height])
        difference() {
            union() {
                for (i = [0 : 9]) {
                    z = i * (chamfer_height / 10);
                    h = (chamfer_height / 10) + 0.01;
                    shrink_amount = (wall_thickness - 0.4) * (i / 9);
                    translate([0, 0, z])
                    linear_extrude(height = h) {
                        main_outline(extra_r = wall_thickness - shrink_amount);
                    }
                }
            }
            translate([0, 0, -0.01])
            linear_extrude(height = chamfer_height + 0.1) {
                main_outline();
            }
        }
    } else {
        // Parede com topo plano normal
        difference() {
            linear_extrude(height = wall_height) {
                main_outline(extra_r = wall_thickness);
            }
            translate([0, 0, -1])
            linear_extrude(height = wall_height + 2) {
                main_outline();
            }
        }
    }

    color("FireBrick")
    // Borda de apoio (Brim) embaixo (Z=0) para grudar bem na mesa de impressão sem gerar suportes
    linear_extrude(height = 2.0) {
        difference() {
            main_outline(extra_r = wall_thickness + brim_width);
            main_outline(extra_r = wall_thickness);
        }
    }
}

// ============================================================
// Controle de Renderização
// Peça: "all" | "carimbo" | "cortador" | "carimbo_base" | "carimbo_arte"
// ============================================================
part = "all";

if (part == "all") {
    mirror([1, 0, 0]) {
        carimbo();
        translate([200, 0, 0]) cortador();
    }
} else if (part == "carimbo") {
    mirror([1, 0, 0]) carimbo();
} else if (part == "cortador") {
    mirror([1, 0, 0]) cortador();
} else if (part == "carimbo_base") {
    mirror([1, 0, 0]) {
        color("SlateGray")
        difference() {
            linear_extrude(height = base_height) {
                main_outline(extra_r = -folga);
            }
            // Furo para o pegador (8mm diametro x 1mm profundidade, rente à mesa z=0)
            translate([0, 0, -0.1])
            cylinder(d = 8, h = 1.1, $fn = 64);
            
            // Marca d'água Principal
            translate([0, -11, -0.1])
            linear_extrude(height = 1.1) {
                text("ADOIS", font="TAN \\- NIMBUS:style=Regular", size=10, halign="center", valign="center");
            }
            
            // Marca d'água Secundária
            //translate([0, -22, -0.1])
            //linear_extrude(height = 1.1) {
              //  text("STUDIO", font="Eastman Condensed Alt Trial:style=Regular", size=4.5, halign="center", valign="center");
            //}
        }
    }
} else if (part == "carimbo_arte") {
    mirror([1, 0, 0]) {
        color("WhiteSmoke")
        translate([0, 0, base_height])
        linear_extrude(height = line_height - base_height) {
            art_svg();
        }
    }
}
