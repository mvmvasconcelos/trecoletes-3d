/*[Configurações]*/
texto       = "TESTE";        // Texto a ser testado
tamanho     = 10;             // Tamanho do texto (altura), mm
tolerancias = [0.2, 0.4];     // Tolerâncias a testar (mm)
margem      = 2;              // Margem entre cavidades e bordas (mm)

// ── Constantes ─────────────────────────────────────────────────────────────
plate_thickness = 3;          // Espessura da chapa, mm
text_thickness  = 2;          // Espessura do texto positivo, mm
gap             = 2;          // Espaço entre linhas de cavidades (mm)
separation      = 10;         // Distância entre chapa e texto positivo na view "all"

// ── Funções auxiliares ─────────────────────────────────────────────────────
function _max(v, i=0, m=0) = i == len(v) ? m : _max(v, i+1, v[i] > m ? v[i] : m);
function _sum(v, i=0, s=0) = i == len(v) ? s : _sum(v, i+1, s + v[i]);

// ── Métricas do texto ──────────────────────────────────────────────────────
// n_chars é injetado pelo frontend (len numérico de `texto`) — evita undef no OpenSCAD 2021.
n_chars     = 5;              // sobrescrito pelo frontend via -D n_chars=N
text_width  = tamanho * n_chars * 0.9;
text_height = tamanho;

// ── Dimensões ──────────────────────────────────────────────────────────────
// Largura da chapa: acomoda a cavidade mais larga (maior tolerância)
function plate_w(tols, mg) = text_width + 2 * _max(tols) + 2 * mg;

// Altura de cada linha de cavidade no eixo Y (profundidade no plano XY)
function row_h(tol, mg) = text_height + 2 * tol + 2 * mg;

// Profundidade total da chapa (Y): margens + linhas + gaps entre linhas
function plate_d(tols, mg) =
    2 * mg
    + _sum([for (j=[0 : len(tols)-1]) row_h(tols[j], mg)])
    + (len(tols) > 1 ? (len(tols) - 1) * gap : 0);

// Y inferior da linha i (recursivo — evita range [0:-1] no OpenSCAD 2021)
function _row_bot(tols, mg, i) =
    i == 0 ? mg : _row_bot(tols, mg, i-1) + row_h(tols[i-1], mg) + gap;

// Centro Y da cavidade i (coordenadas internas, antes do translate de centralização)
function cav_y(tols, mg, i) = _row_bot(tols, mg, i) + row_h(tols[i], mg) / 2;

// ── Módulo da chapa negativa ───────────────────────────────────────────────
module chapa_negativa() {
    n = len(tolerancias);
    w = plate_w(tolerancias, margem);
    d = plate_d(tolerancias, margem);

    // Centraliza em XY ao redor da origem para visualização correta no viewer
    translate([-w/2, -d/2, 0])
    difference() {
        cube([w, d, plate_thickness]);

        // Cavidades empilhadas em Y, centradas em X, uma por tolerância
        for (i = [0 : n - 1]) {
            translate([w/2, cav_y(tolerancias, margem, i), plate_thickness / 2])
                linear_extrude(height = plate_thickness + 2, center = true)
                    offset(r = tolerancias[i])
                        text(texto, size = tamanho, halign = "center", valign = "center",
                             font = "Liberation Sans:style=Regular");
        }

        // Rótulos de tolerância gravados na face superior (Z = plate_thickness)
        for (i = [0 : n - 1]) {
            translate([margem * 0.4, cav_y(tolerancias, margem, i), plate_thickness - 0.01])
                linear_extrude(0.51)
                    text(str(tolerancias[i], "mm"),
                         size   = max(1.5, margem * 0.7),
                         halign = "left",
                         valign = "center",
                         $fn    = 32);
        }
    }
}

// ── Módulo do texto positivo ───────────────────────────────────────────────
// Peça de referência: tamanho FIXO (sem offset) — é ela que se encaixa nas cavidades.
// Standalone: centrado na origem para impressão direta.
// View "all": deslocado em Y negativo (abaixo da chapa no plano).
module texto_positivo() {
    linear_extrude(height = text_thickness)
        text(texto, size = tamanho, halign = "center", valign = "center",
             font = "Liberation Sans:style=Regular");
}

// ── Dispatcher de partes ───────────────────────────────────────────────────
// part vem do backend como -D part="..." (generate_parametric)
part = "all";

if (part == "chapa_negativa") {
    chapa_negativa();
} else if (part == "texto_positivo") {
    texto_positivo();
} else {
    // "all": visualização combinada — chapa centrada + texto positivo abaixo em Y
    chapa_negativa();
    d = plate_d(tolerancias, margem);
    // separation = gap between plate bottom edge and TOP of texto_positivo
    // With valign="center", center is at -(d/2 + separation + text_height/2)
    translate([0, -(d/2 + separation + text_height/2), 0])
        linear_extrude(height = text_thickness)
            text(texto, size = tamanho, halign = "center", valign = "center",
                 font = "Liberation Sans:style=Regular");
}