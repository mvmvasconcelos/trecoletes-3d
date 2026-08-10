include <BOSL2/std.scad>

// =====================================================================
//  CAIXA COM TAMPA DESLIZANTE EM CANALETA  (OpenSCAD + BOSL2)
// =====================================================================

// ---------------------------------------------------------------------
// 1) DIMENSÕES INTERNAS DA CAIXA -- em mm (expostas na UI)
// ---------------------------------------------------------------------
ix = 78.0;      // largura interna  (X)
iy = 100.0;     // comprimento interno (Y)
iz = 35.0;      // altura interna   (Z)

// ---------------------------------------------------------------------
// 2) PARÂMETROS DE FABRICAÇÃO -- expostos na UI
// ---------------------------------------------------------------------
wall = 2.8;           // espessura das paredes e do fundo
tol  = 0.1;           // folga/tolerância de encaixe (usada em cada face de contato)

// ---------------------------------------------------------------------
// 2.1) Demais parâmetros de fabricação -- fixos (não expostos na UI)
// ---------------------------------------------------------------------
lid_thickness = wall; // espessura da tampa deslizante
chamfer       = 1.0;  // perna do chanfro de 45° da canaleta
top_land      = wall; // material acima da canaleta, fechando o topo da parede
top_chamfer   = chamfer; // chanfro de 45° na quina superior interna das 3 paredes altas
notch_depth   = 0.5;  // profundidade do rasgo na parede de trás
bottom_chamfer = top_chamfer; // chanfro de 45° na aresta inferior externa da BASE

// --- trava (detent): saliência no piso da canaleta + rebaixo na tampa ---
detent_len    = 4.0;  // comprimento da trava no sentido do deslizamento (Y)
detent_width  = 0.8;  // largura da trava (X)
detent_height = 1.0;  // altura do disco acima do piso da canaleta
detent_y      = 12.0; // distância da frente onde fica a trava (aprox.)

// --- pega (meia-lua) atravessando a tampa ---
half_moon_w = 20.0;   // largura da base plana (diâmetro) do corte, em X
half_moon_d = 5.0;    // profundidade (bojo) do corte, em Y

gap_for_printing = 5.0;    // espaço entre caixa e tampa no layout de impressão

$fn = 32;   // resolução das superfícies curvas (esferas da trava)

eps = 0.01;  // folga numérica mínima para garantir uniões/cortes limpos

// =====================================================================
//  Dimensões derivadas (calculadas automaticamente)
// =====================================================================
channel_h = lid_thickness + 2 * tol;

outer_x = ix + 2 * wall;
outer_y = iy + 2 * wall;

wall_h  = iz + channel_h + top_land;
outer_z = wall + wall_h;

front_wall_h = wall + iz;

channel_z0 = wall + iz;
channel_z1 = channel_z0 + channel_h;

lid_x_dim = ix + 2 * chamfer - 2 * tol;
lid_y_dim = (outer_y - wall) + notch_depth - tol;
lid_x0    = (outer_x - lid_x_dim) / 2;

// posição X do centro de cada saliência (no meio da profundidade da canaleta)
detent_x_left  = wall - chamfer / 2;
detent_x_right = outer_x - wall + chamfer / 2;

// =====================================================================
//  Verificações básicas dos parâmetros
// =====================================================================
assert(chamfer < wall, "chamfer precisa ser menor que 'wall' (espessura da parede)");
assert(channel_h > chamfer, "chamfer maior que a canaleta: aumente lid_thickness/tol ou diminua chamfer");
assert(chamfer < lid_thickness, "chamfer não pode ser maior/igual à espessura da tampa");
assert(ix > 2 * chamfer, "ix muito pequeno para o chanfro escolhido");
assert(2 * chamfer < lid_x_dim, "chamfer muito grande para a largura da tampa resultante");
assert(top_chamfer < top_land, "top_chamfer precisa ser menor que 'top_land'");
assert(top_chamfer < wall, "top_chamfer precisa ser menor que 'wall' (senão fura a face externa)");
assert(notch_depth < wall, "notch_depth precisa ser menor que 'wall' (espessura da parede)");
assert(bottom_chamfer < wall, "bottom_chamfer precisa ser menor que 'wall' (altura da base)");
assert(2 * bottom_chamfer < outer_x, "bottom_chamfer grande demais para a largura da base");
assert(detent_height > tol, "detent_height precisa ser maior que 'tol' para a trava engatar");
assert(detent_height < lid_thickness, "detent_height deve ser menor que a espessura da tampa");
assert(detent_width < chamfer, "detent_width precisa ser menor que 'chamfer', senão fura a parede");
assert(detent_y > 0 && detent_y < (outer_y - wall), "detent_y fora do comprimento útil da canaleta");
assert(half_moon_w < lid_x_dim, "half_moon_w maior que a largura da tampa");
assert(wall + half_moon_d < lid_y_dim, "meia-lua mais longa que a tampa");


// =====================================================================
//  Helper: extrusão de um perfil 2D (X,Z) ao longo do eixo Y
// =====================================================================
module profile_solid_y(pts, length) {
    mapped_pts = [for (p = pts) [p[0], -p[1]]];
    rotate([-90, 0, 0])
    linear_extrude(height=length)
    polygon(mapped_pts);
}

// =====================================================================
//  Peças da caixa
// =====================================================================
module base_part() {
    cube([outer_x, outer_y, wall]);
}

left_base_wedge  = [[0, 0], [bottom_chamfer, 0], [0, bottom_chamfer]];
right_base_wedge = [[outer_x, 0], [outer_x - bottom_chamfer, 0], [outer_x, bottom_chamfer]];
back_base_wedge  = [[0, 0], [bottom_chamfer, 0], [0, bottom_chamfer]];

module base_chamfer_cuts() {
    translate([0, -eps, 0])
        profile_solid_y(left_base_wedge, outer_y + 2 * eps);
    translate([0, -eps, 0])
        profile_solid_y(right_base_wedge, outer_y + 2 * eps);

    translate([-eps, outer_y, 0])
        rotate([0, 0, -90])
        profile_solid_y(back_base_wedge, outer_x + 2 * eps);
}

left_profile = [
    [0, 0],
    [0, wall_h],
    [wall, wall_h],                                  // topo quadrado
    [wall, iz + channel_h],                          // desce face interna
    [wall - chamfer, iz + channel_h - chamfer],      // fim do chanfro de 45°
    [wall - chamfer, iz],                            // desce reto
    [wall, iz],                                      // volta ao piso
    [wall, 0]
];

right_profile = [for (p = left_profile) [wall - p[0], p[1]]];
pocket_length = (outer_y - wall) + eps;

module left_wall() {
    translate([0, 0, wall])
        profile_solid_y(left_profile, pocket_length);
}

module right_wall() {
    translate([outer_x - wall, 0, wall])
        profile_solid_y(right_profile, pocket_length);
}

module back_wall() {
    difference() {
        translate([0, outer_y - wall, wall])
            cube([outer_x, wall, wall_h]);

        notch_w = lid_x_dim + 2 * tol;
        translate([lid_x0 - tol, outer_y - wall - eps, channel_z0])
            cube([notch_w, notch_depth + eps, channel_h]);
    }
}

module front_wall() {
    cube([outer_x, wall, front_wall_h]);
}

module top_chamfer_cut() {
    m = 2 * wall;
    hull() {
        translate([wall, -m, outer_z - 2 * top_chamfer])
            cube([outer_x - 2 * wall, (outer_y - wall) + m, top_chamfer]);

        translate([wall - top_chamfer, -m, outer_z])
            cube([outer_x - 2 * wall + 2 * top_chamfer,
                  (outer_y - wall + top_chamfer) + m, top_chamfer]);
    }
}

module detent_disc(semi_y, semi_z, thick_x) {
    scale([1, semi_y, semi_z])
        rotate([0, 90, 0])
        cylinder(h=thick_x, r=1, center=false);
}

module detent_bumps() {
    translate([detent_x_left - detent_width / 2, detent_y, channel_z0])
        detent_disc(detent_len / 2, detent_height, detent_width);

    translate([detent_x_right - detent_width / 2, detent_y, channel_z0])
        detent_disc(detent_len / 2, detent_height, detent_width);
}

module box_body() {
    color("BurlyWood") {
        union() {
            difference() {
                union() {
                    base_part();
                    left_wall();
                    right_wall();
                    back_wall();
                    front_wall();
                }
                base_chamfer_cuts();
                top_chamfer_cut();
            }
            detent_bumps();
        }
    }
}

// =====================================================================
//  Tampa deslizante
// =====================================================================
lid_profile = [
    [0, 0],
    [0, lid_thickness - chamfer],
    [chamfer, lid_thickness],
    [lid_x_dim - chamfer, lid_thickness],
    [lid_x_dim, lid_thickness - chamfer],
    [lid_x_dim, 0]
];

module half_moon_cut() {
    cx = lid_x_dim / 2;
    difference() {
        translate([cx, wall, -eps])
            scale([half_moon_w / 2, half_moon_d, 1])
            cylinder(h=lid_thickness + 2 * eps, r=1, center=false);

        translate([cx - (half_moon_w + 2) / 2, wall - (half_moon_d + 2), -eps - 1])
            cube([half_moon_w + 2, half_moon_d + 2, lid_thickness + 4]);
    }
}

module lid() {
    color("SaddleBrown") {
        difference() {
            profile_solid_y(lid_profile, lid_y_dim);

            dx = (detent_width + 2 * tol) / 2;

            translate([detent_x_left - lid_x0 - dx, detent_y, -tol])
                detent_disc(detent_len / 2 + tol, detent_height + tol, detent_width + 2 * tol);

            translate([detent_x_right - lid_x0 - dx, detent_y, -tol])
                detent_disc(detent_len / 2 + tol, detent_height + tol, detent_width + 2 * tol);

            half_moon_cut();
        }
    }
}

// =====================================================================
//  Dispatcher de partes (caixa e tampa são objetos impressos separados,
//  posicionados lado a lado, prontos para fatiar sem sobreposição)
// =====================================================================
part = "all";

if (part == "caixa") {
    box_body();
} else if (part == "tampa") {
    translate([lid_x0, outer_y + gap_for_printing, 0])
        lid();
} else {
    box_body();
    translate([lid_x0, outer_y + gap_for_printing, 0])
        lid();
}
