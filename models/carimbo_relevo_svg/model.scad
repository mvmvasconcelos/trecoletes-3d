include <BOSL2/std.scad>

// =====================================================================
// CARIMBO EM RELEVO - SVG
// Duas placas unidas por dobradiça impressa: lado esquerdo com relevo
// positivo (macho, espelhado) e lado direito com cavidade negativa
// (fêmea), a partir de uma mesma arte SVG.
// =====================================================================

/*[SVG Inputs]*/
svg_linhas_path = "linhas.svg";
art_width        = 60;   // largura real da arte já normalizada pelo backend, mm
art_height       = 20;   // altura real da arte já normalizada pelo backend, mm

/*[Dimensões da Placa]*/
aba_x     = 70.0;   // largura total de cada lado do carimbo
gap_x     = 0.8;    // fresta horizontal entre as duas placas, no eixo da dobradiça
margem_xy = 5.0;    // margem entre a arte e a borda externa da placa (e acima/abaixo em Y)

/*[Relevo]*/
plate_z  = 4.0;    // espessura da placa base
relevo_z = 2.0;    // altura do relevo positivo (lado macho), acima da placa
femea_z  = 2.5;    // profundidade da cavidade negativa (lado fêmea)
folga_xy = 0.35;   // folga radial da cavidade fêmea ao redor do contorno da arte

/*[Dobradiça]*/
hinge_axis_z = 4.0;   // altura do eixo da dobradiça acima da base da placa
hinge_r      = 4.0;   // raio dos nós cilíndricos da dobradiça
pin_r        = 1.8;   // raio do pino/eixo da dobradiça
tol          = 0.6;   // folga genérica de montagem, reaproveitada em vários encaixes

$fn = 64;

assert(aba_x >= art_width + margem_xy,
    "Largura da Aba precisa ser >= largura da arte + Margem da Arte (a arte não cabe na placa com essa margem).");
assert(hinge_r > pin_r + tol,
    "Raio dos Nós precisa ser maior que Raio do Pino + Folga de Montagem (parede da dobradiça ficaria negativa).");

plate_x = aba_x;
plate_y = art_height + (margem_xy * 2);
inner_y = plate_y / 5.0;
// Centro da arte no eixo X: encostada na borda externa (margem_xy de folga),
// sobrando o restante de aba_x como espaço livre do lado da dobradiça.
logo_centro_x = (aba_x + gap_x) - margem_xy - (art_width / 2);
h_out = (plate_y / 2) - inner_y - tol;

// ── ARTE SVG ─────────────────────────────────────────────────────────────
// O backend normaliza o SVG para começar em (0,0); resize com auto=false
// garante que a arte assuma exatamente [art_width, art_height] centrada na origem.
module art_svg() {
    translate([-art_width / 2, -art_height / 2, 0])
        resize([art_width, art_height, 0], auto = [false, false, false])
            import(file = svg_linhas_path);
}

module lado_esquerdo() {
    difference() {
        union() {
            // Placa Esquerda
            move([-plate_x - gap_x, -plate_y/2, 0])
                cube([plate_x, plate_y, plate_z]);

            // Blocos da dobradiça
            move([-hinge_r, inner_y + tol, 0])
                cube([hinge_r, h_out, plate_z]);
            move([-hinge_r, -plate_y/2, 0])
                cube([hinge_r, h_out, plate_z]);

            // Cilindros externos da dobradiça
            move([0, inner_y + tol, hinge_axis_z])
                xrot(-90) cylinder(r = hinge_r, h = h_out);
            move([0, -plate_y/2, hinge_axis_z])
                xrot(-90) cylinder(r = hinge_r, h = h_out);

            // Logo Macho (Esquerdo) - Relevo Positivo Espelhado
            move([-logo_centro_x, 0, plate_z])
                linear_extrude(height = relevo_z)
                    xflip()
                        art_svg();
        }
        // Furo passante para o pino da dobradiça
        move([0, 0, hinge_axis_z])
            xrot(90) cylinder(r = pin_r + tol, h = plate_y + 2, center = true);
        // Folga para o nó central da dobradiça direita girar sem colar na placa
        move([0, -(inner_y + tol), hinge_axis_z])
            xrot(-90) cylinder(r = hinge_r + tol, h = (inner_y + tol) * 2);
    }
}

module lado_direito() {
    difference() {
        union() {
            // Placa Direita
            move([gap_x, -plate_y/2, 0])
                cube([plate_x, plate_y, plate_z]);

            // Bloco central da dobradiça
            move([0, -inner_y, 0])
                cube([hinge_r, inner_y * 2, plate_z]);

            // Cilindro central da dobradiça
            move([0, -inner_y, hinge_axis_z])
                xrot(-90) cylinder(r = hinge_r, h = inner_y * 2);

            // Pino central (eixo da dobradiça)
            move([0, 0, hinge_axis_z])
                xrot(90) cylinder(r = pin_r, h = plate_y, center = true);
        }
        // Logo Fêmea (Direito) - Cavidade Negativa Alargada
        move([logo_centro_x, 0, plate_z - femea_z])
            linear_extrude(height = femea_z + 1)
                offset(r = folga_xy)
                    art_svg();
        // Folga para os nós externos da dobradiça esquerda girarem sem colar na placa
        move([0, inner_y, hinge_axis_z])
            xrot(-90) cylinder(r = hinge_r + tol, h = h_out + tol);
        move([0, -plate_y/2, hinge_axis_z])
            xrot(-90) cylinder(r = hinge_r + tol, h = h_out + tol);
    }
}

// ── SAÍDA ────────────────────────────────────────────────────────────────
// Peça única (dobradiça impressa de uma vez): "part" injetado pelo backend
// não altera a geometria, só o nome do arquivo — não há dispatcher aqui.
lado_esquerdo();
lado_direito();
