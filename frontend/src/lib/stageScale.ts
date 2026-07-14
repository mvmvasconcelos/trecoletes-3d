/**
 * Shared between EditorCanvas.tsx (applies the zoom to the Konva Stage) and
 * Editor2D.tsx (needs the same visible-unit-space extent to size/center new
 * layers) — kept in its own module rather than exported from EditorCanvas.tsx
 * so that component file only exports the component (react-refresh lint rule).
 */

// Bambu A1 print bed size. Canvas/layer units equal real-world millimeters
// (see "Editor units vs. real-world millimeters" in serializePartToSvg.ts),
// so this 256x256 unit square directly represents the 256x256mm print bed.
export const PRINT_BED_SIZE_MM = 256;

// How much of the smaller viewport dimension the print bed guide should fill
// by default — found via manual QA that rendering 1 unit = 1 screen pixel
// left the 256x256mm guide looking like a tiny square lost in a much larger
// (container-pixel-sized) canvas. Zooming the Stage so the bed fills most of
// the view (CAD/slicer convention) fixes that without changing any
// underlying unit-space data — it's a pure view transform.
const GUIDE_FILL_RATIO = 0.9;

/**
 * The Stage-level zoom that makes the 256x256mm print bed fill
 * `GUIDE_FILL_RATIO` of the smaller container dimension. Both EditorCanvas.tsx
 * (applies it as the Stage's scaleX/scaleY) and Editor2D.tsx (centers/sizes
 * new layers within the same visible unit-space extent) must use this exact
 * formula — any drift between the two would make new imports land off-center
 * or the wrong apparent size relative to what's actually on screen.
 */
export function computeStageScale(containerWidth: number, containerHeight: number): number {
    if (containerWidth <= 0 || containerHeight <= 0) return 1;
    return (Math.min(containerWidth, containerHeight) * GUIDE_FILL_RATIO) / PRINT_BED_SIZE_MM;
}
