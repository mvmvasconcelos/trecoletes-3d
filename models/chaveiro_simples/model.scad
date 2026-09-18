// Fontes disponíveis (bundled na pasta do modelo)
use <Chewy-Regular.ttf>
use <Bangers-Regular.ttf>

/*[Texto]*/
text_line_1    = "Verônica";          // Linha principal
text_line_2    = "";                  // Linha secundária (deixe vazio para desativar)
text_size_1    = 12;                  // Tamanho da Linha 1, mm
text_size_2    = 10;                  // Tamanho da Linha 2, mm
font_name      = "Chewy:style=Regular";
base_height    = 2.0;                 // Espessura da Base, mm
letter_height  = 2.0;                 // Espessura do Relevo, mm
outline_margin = 2.3;                 // Margem do contorno além do texto, mm
spacing        = 1.0;                 // Espaçamento entre letras (1.0 = normal)
line_spacing   = 1.0;                 // Fator de distância entre linhas

/*[Argola]*/
ring_position_mode  = "left"; // "left" | "top" | "custom"
ring_outer_diameter = 6.0;
ring_inner_diameter = 3.0;
ring_offset_x = -0.6; // usado só no modo "custom"
ring_offset_y = 6.0;  // usado só no modo "custom"

/*[Cores]*/
base_color    = "#1B40D1";
letters_color = "#FFFFFF";

/*[Preenchimento da Base]*/
fill_base_holes = false;

/*[Posicionamento por caractere — injetado pelo backend]*/
chars1   = "";   
char_xs1 = [];   
chars2   = "";   // Texto da linha 2 (vazio = não usa)
char_xs2 = [];
body_min_x = 0; // Injetado pelo backend
body_max_x = 0; // Injetado pelo backend
body_span_x = 0; // Injetado pelo backend
body_max_y = 0; // Injetado pelo backend — SUBestima a altura real (testado:
                // sempre igual ou abaixo do topo real da tinta), por isso só
                // serve como âncora "com certeza dentro do texto", nunca pra
                // decidir a folga de segurança do furo (isso usa a tabela por
                // fonte, que precisa SOBREestimar).

/*[Preenchimento de Gaps]*/
fill_gap_rects = [];  // Retângulos para preencher gaps entre linhas, injetado pelo backend

// Arrays de linhas/tamanhos para cálculo de posição vertical
_lines = text_line_2 == "" ? [text_line_1] : [text_line_1, text_line_2];
_sizes = text_line_2 == "" ? [text_size_1] : [text_size_1, text_size_2];

// ── Posição Y de cada linha (centraliza o conjunto verticalmente) ─────────
function _line_y(i) =
    (len(_lines) == 1) ? 0 :
    (i == 0) ?  (_sizes[1] * line_spacing * 0.6) :
               -(_sizes[0] * line_spacing * 0.6);

// ── Posição da argola ──────────────────────────────────────────────────────
// "left" é o preset já existente (borda esquerda, centralizado em Y).
// "top" fica centralizado em X (texto já é centralizado em x=0 pelo backend)
// e usa uma estimativa de altura baseada só em text_size_1 — NÃO nos bounds
// físicos da fonte (body_min/max_y, injetados pelo backend), porque medição
// mostrou erro de ~3mm no topo pra fontes decorativas como Chewy (a análise
// de fonte em Python não bate com o que o OpenSCAD renderiza; a base bate,
// só o topo diverge — bug pré-existente, fora de escopo consertar aqui).
// A argola fica centrada em (topo estimado + raio interno): a borda do furo
// interno para exatamente na folga de segurança (não corta letra), e a borda
// externa da argola necessariamente mergulha na base por 1x a espessura do
// anel (raio externo - raio interno) — union() só gera peça conectada de
// verdade se as formas se sobrepõem; só "encostar" sem sobrepor deixa a
// argola solta, flutuando (testado e comprovado insuficiente).
// "custom" usa os offsets manuais a partir da borda esquerda (comportamento
// anterior, preservado para quem já ajustava manualmente).
//
// A folga usa 3 faixas por caractere (testei alfabeto + acentos nas 6
// fontes): minúscula comum (baixa) < maiúscula/ascendente/dígito (média) <
// acentuada (alta, pior caso — Pacifico chega a 1.14x o tamanho). Usar só o
// pior caso da fonte inteira (ex.: nomes sem acento) deixava a argola muito
// mais alta do que precisava, e o conector até ela ficava comprido/feio —
// olhar os caracteres reais do nome encolhe a folga no caso comum.
_tier1_chars    = "acemnorsuvwxz";                     // minúscula baixa
_accented_chars = "ÁÉÍÓÚÂÊÔÃÕÀÜáéíóúâêôãõàü";           // acentuada

function _char_tier(ch) =
    (len(search(ch, _accented_chars)) > 0) ? 3 :
    (len(search(ch, _tier1_chars)) > 0) ? 1 :
    2; // maiúscula, dígito, ascendente (b,d,f,h,k,l,t) ou pontuação: assume médio

function _text_max_tier(t, i = 0, acc = 1) =
    (i >= len(t)) ? acc :
    _text_max_tier(t, i + 1, max(acc, _char_tier(t[i])));

function _ring_top_factor(fname, tier) =
    (fname == "Chewy:style=Regular")        ? (tier == 3 ? 0.95 : tier == 2 ? 0.70 : 0.45) :
    (fname == "Bangers:style=Regular")      ? (tier == 3 ? 1.20 : tier == 2 ? 0.70 : 0.65) :
    (fname == "Leckerli One:style=Regular") ? (tier == 3 ? 1.10 : tier == 2 ? 0.70 : 0.35) :
    (fname == "Pacifico:style=Regular")     ? (tier == 3 ? 1.30 : tier == 2 ? 0.95 : 0.30) :
    (fname == "Comic Neue:style=Regular")   ? (tier == 3 ? 0.90 : tier == 2 ? 0.60 : 0.30) :
    (fname == "Oswald:style=Regular")       ? (tier == 3 ? 1.10 : tier == 2 ? 0.75 : 0.45) :
    1.30; // fonte desconhecida: pior caso medido (tier 3 do Pacifico)

_ring_left_x = (body_min_x != 0 || body_max_x != 0) ? body_min_x - outline_margin : ((body_span_x > 0) ? -(body_span_x / 2) : 0);
_ring_top_y  = _line_y(0) + text_size_1 * _ring_top_factor(font_name, _text_max_tier(text_line_1)); // topo estimado da linha 1, com folga

final_ring_x = (ring_position_mode == "top")  ? 0
             : (ring_position_mode == "left") ? _ring_left_x
             : _ring_left_x + ring_offset_x; // custom
final_ring_y = (ring_position_mode == "top")  ? (_ring_top_y + ring_inner_diameter / 2)
             : (ring_position_mode == "left") ? 0
             : ring_offset_y; // custom

/*[Direção]*/
text_halign = "left";

module hole() {
    translate([final_ring_x, final_ring_y, -0.1])
        cylinder(d = ring_inner_diameter, h = base_height + 0.2, $fn = 50);
}

// ── Preenchimento de gaps entre linhas ───────────────────────────────────
module gap_fillers_2d() {
    for (rect = fill_gap_rects) {
        x = rect[0];
        y = rect[1];
        w = rect[2];
        h = rect[3];
        translate([x, y, 0])
            square([w, h], center = true);
    }
}

module base_2d() {
    if (len(chars1) > 0) {
        // Linha 1: per-character (posições injetadas pelo backend)
        for (i = [0 : len(chars1) - 1])
            if (i < len(char_xs1))
                translate([char_xs1[i], _line_y(0) - text_size_1/2, 0])
                    text(chars1[i], size = text_size_1, font = font_name,
                         halign = "left", valign = "baseline");
        // Linha 2 (opcional)
        if (len(chars2) > 0)
            for (i = [0 : len(chars2) - 1])
                if (i < len(char_xs2))
                    translate([char_xs2[i], _line_y(1) - text_size_2/2, 0])
                        text(chars2[i], size = text_size_2, font = font_name,
                             halign = "left", valign = "baseline");
        // Preencher gaps entre linhas se configurado
        if (len(fill_gap_rects) > 0)
            gap_fillers_2d();
    } else {
        // Fallback: text() convencional (quando backend não injeta posições)
        if (fill_base_holes) {
            for (i = [0 : len(_lines) - 1])
                translate([0, _line_y(i), 0])
                    offset(delta = -5.0, join_type = "miter") 
                        offset(delta = 5.0, join_type = "miter") 
                            offset(delta = 0.01)
                                text(_lines[i], size = _sizes[i], font = font_name,
                                     halign = "center", valign = "center", spacing = spacing);
        } else {
            for (i = [0 : len(_lines) - 1])
                translate([0, _line_y(i), 0])
                    offset(delta = 0.01)
                        text(_lines[i], size = _sizes[i], font = font_name,
                             halign = "center", valign = "center", spacing = spacing);
        }
    }
}

module ring_2d() {
    translate([final_ring_x, final_ring_y, 0])
        circle(d = ring_outer_diameter, $fn = 50);
}

// Conecta fisicamente a argola do preset "top" à base. Sem isso a argola só
// "quase encosta" no contorno (testado e comprovado insuficiente — a folga
// de segurança contra letras varia demais por fonte pra confiar num toque
// exato). A ponte desce até o baseline da linha 1, que está sempre dentro/
// abaixo da tinta real, garantindo sobreposição de verdade com o contorno.
module ring_top_connector_2d() {
    // body_max_y (subestimado, ver comentário acima) encosta a base da haste
    // bem mais perto do texto do que o baseline. Sem injeção (fallback raro,
    // preview sem backend), cai pro baseline — mais longo, mas ainda seguro.
    conn_bottom = (body_max_y != 0) ? body_max_y : (_line_y(0) - text_size_1 / 2);
    stem_r = ring_inner_diameter / 2;
    hull() {
        translate([0, final_ring_y, 0]) circle(r = stem_r, $fn = 30);
        translate([0, conn_bottom, 0])  circle(r = stem_r, $fn = 30);
    }
}

module base_with_hole() {
    difference() {
        linear_extrude(height = base_height) {
            union() {
                offset(r = outline_margin, $fn = 60)
                    base_2d();
                ring_2d();
                if (ring_position_mode == "top")
                    ring_top_connector_2d();
            }
        }
        hole();
    }
}

// ── Letras em relevo: um extrude por caractere ────────────────────────────
module _one_char(ch_code, x, y, sz) {
    translate([x, y - sz/2, 0])
        linear_extrude(height = letter_height)
            text(ch_code, size = sz, font = font_name,
                 halign = "left", valign = "baseline");
}

module raised_letters() {
    translate([0, 0, base_height]) {
        if (len(chars1) > 0) {
            // Linha 1: per-character (sem even-odd)
            for (i = [0 : len(chars1) - 1])
                if (i < len(char_xs1))
                    _one_char(chars1[i], char_xs1[i], _line_y(0), text_size_1);
            // Linha 2 (opcional)
            if (len(chars2) > 0)
                for (i = [0 : len(chars2) - 1])
                    if (i < len(char_xs2))
                        _one_char(chars2[i], char_xs2[i], _line_y(1), text_size_2);
        } else {
            // Fallback: text() convencional
            for (i = [0 : len(_lines) - 1])
                translate([0, _line_y(i), 0])
                    linear_extrude(height = letter_height)
                        text(_lines[i], size = _sizes[i], font = font_name,
                             halign = "center", valign = "center", spacing = spacing);
        }
    }
}

// ── Dispatcher de partes ──────────────────────────────────────────────────
part = "all";

if (part == "all") {
    color(base_color)    base_with_hole();
    color(letters_color) raised_letters();
} else if (part == "base") {
    color(base_color) base_with_hole();
} else if (part == "letters") {
    color(letters_color) raised_letters();
}
