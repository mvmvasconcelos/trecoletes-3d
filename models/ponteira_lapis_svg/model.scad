/*[SVG Inputs]*/
svg_linhas_path  = "linhas.svg";
art_width        = 50;
art_height       = 50;

/*[Dimensions & Settings]*/
letter_height    = 1.2;     // Height of the raised art (extrusion), mm
base_height      = 10;      // Height (size) of the base, mm
outline_margin   = 2.6;     // How far the outline expands beyond the text, mm

/*[Hole Settings]*/
hole_type        = "CIRCLE";      // ["CIRCLE", "HEXAGON"]
hole_orientation = "TOPBOTTOM";   // ["FRONTBACK", "TOPBOTTOM", "NONE"]
hole_diameter    = 7.5;           // mm
hole_length      = 500;           // mm
hole_x           = 0;
hole_y           = 0;
hole_z           = base_height / 2;

/*[Colors]*/
base_color    = "#1B40D1";
letters_color = "#FFFFFF";

// ── SVG ART IMPORT ────────────────────────────────────────────────────────────
// In the new architecture, the SVG is normalized by the backend to start at (0,0)
// The resize function handles automatic proportional scaling if the third dimension or one is 0.
module art_svg() {
    translate([-art_width / 2, -art_height / 2, 0]) {
        resize([art_width, art_height, 0], auto=[false, false, false])
            import(file=svg_linhas_path);
    }
}

// Em `cortador_cookie` o frontend manda `art_height` também.
// Mas para manter a proporção exata ditada apenas pelo SVG de entrada (sem achatar), 
// podemos depender apenas do `art_width` na visualização SCAD usando resize([w, 0, 0], auto=true).

// ── BASE COM FURO ─────────────────────────────────────────────────────────────
module base_with_tunnel() {
    difference() {
        linear_extrude(height = base_height)
            offset(delta = outline_margin, chamfer=true)
                art_svg();

        if (hole_orientation == "FRONTBACK") {
            translate([hole_x, hole_y, hole_z])
                rotate([0, 90, 0])
                    cylinder(
                        d      = hole_diameter,
                        h      = hole_length,
                        center = true,
                        $fn    = (hole_type == "HEXAGON") ? 6 : 100
                    );
        }
        else if (hole_orientation == "TOPBOTTOM") {
            translate([hole_x, hole_y, hole_z])
                rotate([90, 0, 0])
                    cylinder(
                        d      = hole_diameter,
                        h      = hole_length,
                        center = true,
                        $fn    = (hole_type == "HEXAGON") ? 6 : 100
                    );
        }
    }
}

// ── ARTE EM RELEVO ──────────────────────────────────────────────────────────
module raised_art() {
    translate([0, 0, base_height - 0.1])
        linear_extrude(height = letter_height + 0.1)
            art_svg();
}

// ── DISPATCHER (for 3MF Export) ─────────────────────────────────────────────
part = "all";

if (part == "all") {
    color(base_color) base_with_tunnel();
    color(letters_color) raised_art();
} else if (part == "base") {
    color(base_color) base_with_tunnel();
} else if (part == "svg") {
    color(letters_color) raised_art();
}
