// Chaveiro Sindicato — nome espelhado na face inferior (primeira camada)
// O chaveiro STL mede 30×60×3mm com origem em (0,0,0).
// O nome é impresso como primeira camada (0,2mm) encostada na mesa,
// espelhado horizontalmente para que leia correto ao virar a peça.

/*[Texto]*/
text_line_1 = "SSPMVA";   // Nome (linha 1)
text_line_2 = "";          // Nome (linha 2 — preenchido automaticamente pelo frontend ao detectar espaço)

/*[Tamanho]*/
text_size_1 = 10;          // Tamanho do Nome, mm

/*[Internos — não expor na UI]*/
// Centro do chaveiro após rotação 90° horária (STL original 30×60 vira 60×30)
stl_cx       = 30.0;
stl_cy       = 15.0;

// Espessura da camada de nome (1ª camada de impressão)
nome_height  = 0.2;

// Altura da camada de nome que separa o corpo da mesa
corpo_z      = nome_height;

// Espaçamento vertical entre as duas linhas (fração da altura do texto)
line_sep_fac = 1.2;

/*[Dispatcher]*/
part = "all";

// ── Geometria 2D do texto ─────────────────────────────────────────────────────
module texto_2d() {
    if (text_line_2 != "") {
        // Duas linhas: linha 1 acima do centro, linha 2 abaixo
        sep = text_size_1 * line_sep_fac;
        translate([0,  sep / 2, 0])
            text(text_line_1, size = text_size_1,
                 font = "Arial Black:style=Regular",
                 halign = "center", valign = "center");
        translate([0, -sep / 2, 0])
            text(text_line_2, size = text_size_1,
                 font = "Arial Black:style=Regular",
                 halign = "center", valign = "center");
    } else {
        text(text_line_1, size = text_size_1,
             font = "Arial Black:style=Regular",
             halign = "center", valign = "center");
    }
}

// ── Parte: nome ───────────────────────────────────────────────────────────────
// Texto espelhado em X (mirror horizontal) centrado no chaveiro, extrudado 0,2mm.
// Espelhado para que, ao virar a peça (que foi impressa com este lado na mesa),
// o nome leia normalmente.
module nome() {
    translate([stl_cx, stl_cy, 0])
        scale([-1, 1, 1])
            linear_extrude(height = nome_height)
                texto_2d();
}

// ── Parte: corpo ─────────────────────────────────────────────────────────────
// STL original do chaveiro, rotacionado 90° horário (rotate -90° em Z) e
// transladado para manter o modelo em coordenadas positivas (Y += 30).
// Elevado por nome_height para sentar sobre a camada de nome.
module corpo() {
    translate([0, 0, corpo_z])
        translate([0, 30, 0])
            rotate([0, 0, -90])
                import("chaveiro_sindicato.stl");
}

// ── Dispatcher ───────────────────────────────────────────────────────────────
if (part == "all") {
    color("#1B40D1") corpo();
    color("#FFFFFF")  nome();
} else if (part == "corpo") {
    corpo();
} else if (part == "nome") {
    nome();
}
