// Fonte usada no texto "Mesa N" (bundled na pasta do modelo)
use <ariblk.ttf>

/*[Mesa]*/
mesa_numero = 32;                              // Numero da mesa
mesa_font_size = 10.2;                          // Tamanho do texto "Mesa N", mm (12mm da referencia, -15% por pedido do usuario)
mesa_font = "Arial Black:style=Regular";

/*[QR Code — injetado pelo backend]*/
qr_module_count = 29;                          // Modulos por lado da matriz do QR
qr_dark_cells = [];                             // Lista [row,col] dos modulos escuros (row 0 = topo da imagem)
qr_size = 45;                                   // Tamanho final do QR, mm

/*[Espessuras]*/
base_height = 0.8;                              // Espessura da base branca, mm
emblem_height = 0.3;                            // Espessura do emblema preto, mm

/*[Posicoes fixas — extraidas do 3mf de referencia "Plaqueta QRCode.3mf"]*/
logo1_pos = [0.13554763799999137, 21.445409753674312];
logo2_pos = [5.5323367100000098, 31.665698999999989];
logo3_pos = [0.34603810300001214, 24.976644553674305];
logo4_pos = [0.45429039000001126, 34.058061553674321];
texto_pedido_pos = [0, 9.0926051184185894];
qr_pos = [0, -18.712203324946216];
texto_mesa_pos = [0, -47.748371107348632];

// ── Base (importada do 3mf de referencia, ja centrada em Z=[-0.4, 0.4]) ────
module base_part() {
    translate([0, 0, base_height / 2])
        import("base.stl");
}

// ── Logo (4 pecas importadas, ja centradas em Z=[-0.15, 0.15]) ────────────
module logo() {
    translate([logo1_pos[0], logo1_pos[1], emblem_height / 2]) import("logo1.stl");
    translate([logo2_pos[0], logo2_pos[1], emblem_height / 2]) import("logo2.stl");
    translate([logo3_pos[0], logo3_pos[1], emblem_height / 2]) import("logo3.stl");
    translate([logo4_pos[0], logo4_pos[1], emblem_height / 2]) import("logo4.stl");
}

module texto_pedido() {
    translate([texto_pedido_pos[0], texto_pedido_pos[1], emblem_height / 2])
        import("texto_faca_pedido.stl");
}

// ── QR Code: um cube 3D por modulo escuro ──────────────────────────────────
// row 0 da matriz = topo da imagem; Y do OpenSCAD cresce pra cima, por isso
// a linha e invertida ao posicionar. rotate(180) compensa a orientacao final
// de impressao (mesma convencao das pecas reaproveitadas do 3mf de referencia
// — ver nota no dispatcher).
// Usamos cube() (3D) em vez de square()+linear_extrude (2D): o OpenSCAD
// 2021.01 deste container tem um bug de uniao CGAL que descarta silenciosamente
// um dos lados ao unir um linear_extrude(for(...) square()) com outra
// geometria irma (logo/texto) — cubes 3D nao acionam esse bug.
module qr_code() {
    cell = qr_size / qr_module_count;
    translate([qr_pos[0], qr_pos[1], 0])
    rotate([0, 0, 180])
    translate([-qr_size / 2, -qr_size / 2, 0])
        for (rc = qr_dark_cells) {
            translate([rc[1] * cell, (qr_module_count - 1 - rc[0]) * cell, 0])
                cube([cell, cell, emblem_height]);
        }
}

// rotate(180) em Y (em vez de Z): ajustado apos teste fisico no Bambu Studio
// pelo usuario -- "Mesa N" ficava errado com a mesma compensacao em Z usada
// no resto do emblema; em Y ficou correto.
module texto_mesa() {
    // rotate(Y180) joga a extrusao para z=[-emblem_height,0]; o translate em Z
    // compensa para voltar a z=[0,emblem_height], igual ao resto do emblema.
    translate([texto_mesa_pos[0], texto_mesa_pos[1], emblem_height])
    rotate([0, 180, 0])
        linear_extrude(height = emblem_height)
            text(str("Mesa ", mesa_numero), size = mesa_font_size, font = mesa_font,
                 halign = "center", valign = "center");
}

module emblem() {
    logo();
    texto_pedido();
    qr_code();
    texto_mesa();
}

// ── Dispatcher de partes ───────────────────────────────────────────────────
// As pecas reaproveitadas do 3mf de referencia (base, logo, "Faca seu pedido")
// ja foram modeladas pelo usuario na orientacao correta para o fluxo de
// impressao (emblema encostado na mesa, peca virada apos impressa) -- por
// isso sao importadas sem nenhuma transformacao extra. O conteudo que GERAMOS
// (QR e "Mesa N") precisa da mesma compensacao, aplicada dentro de cada
// modulo (rotate(180), nao mirror -- confirmado comparando com a malha bruta
// do 3mf de referencia).
part = "all";

if (part == "all") {
    base_part();
    emblem();
} else if (part == "base") {
    base_part();
} else if (part == "emblem") {
    emblem();
}
