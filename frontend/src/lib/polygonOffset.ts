/**
 * Expands (or shrinks) `ImagePathShape` geometry outward by a fixed margin —
 * a real "path offset" / "outline"-to-fill operation, not a visual stroke effect.
 * Backs the Editor 2D "Duplicar + silhueta" action (Editor2D.tsx): duplicate the
 * selected layer, run its shapes through `offsetShapes`, and the result is a new
 * independent layer whose geometry is a true silhouette of the original, baked
 * into real path data — no OpenSCAD `offset()` involved (see DESIGN.md Decision 4:
 * the 3D engine stays a "dumb" pure extruder, all 2D geometry work happens here).
 *
 * paper.js is used purely as a headless geometry engine (parse `d` → polygon),
 * and clipper-lib does the actual polygon offsetting — paper.js has no offset
 * primitive of its own.
 *
 * Units: this module never touches canvas pixels. `margin` is expected in the
 * same units the input shapes' `d` coordinates already use — i.e. the layer's own
 * "natural" unit space (raw SVG units for an imported image, font units for text
 * at its rendered size — see ImageLayer/TextLayer.width/height in types/editor2d.ts).
 * The project has no explicit mm-to-unit ratio yet; callers that want "2mm" in a
 * real-world sense are, for now, treating that number as abstract editor units.
 * Reconciling that with real-world mm is left for the 3D-generation step (later
 * work), same as this module's caller (Editor2D.tsx) documents at its call site.
 */
import paper from 'paper';
import ClipperLib from 'clipper-lib';
import type { IntPoint as ClipperIntPoint, Path as ClipperPath, Paths as ClipperPaths } from 'clipper-lib';
import type { ImagePathShape } from '../types/editor2d';

// Dedicated headless PaperScope — same isolation pattern as lib/svgImport.ts and
// svgProcessor.ts (see their comments for the full rationale). This module is a
// THIRD independent headless paper.js consumer sharing this single-page app, so it
// must never touch the ambient `paper` global directly: paper.js's global `paper`
// object always points at whichever PaperScope called setup()/was activated last,
// and two consumers sharing it would silently corrupt each other's active project.
let _scope: paper.PaperScope | null = null;
let _paperCanvas: HTMLCanvasElement | null = null;

function getPaperProject(): paper.Project {
    if (!_scope) {
        _scope = new paper.PaperScope();
        _paperCanvas = document.createElement('canvas');
        _paperCanvas.width = 1000;
        _paperCanvas.height = 1000;
        _scope.setup(_paperCanvas);
    }
    _scope.activate();
    _scope.project.clear();
    return _scope.project;
}

// clipper-lib only works in integer coordinates ("the standard Clipper usage
// pattern": scale real-valued coordinates up before offsetting, back down after).
// Layer-local units here are either raw SVG units from an imported file or font
// units from opentype.js — both typically range from tens to a few thousand (see
// IMPORT_FIT_RATIO / textToPath.ts in pages/Editor2D.tsx). Scaling by 1000x gives
// sub-thousandth-unit precision (far finer than anything visibly different on
// screen) while keeping scaled coordinates (up to low millions) comfortably inside
// Clipper's safe integer range (documented as ±0x3FFFFFFF, ≈1.07e9).
const CLIPPER_SCALE = 1000;

// clipper-lib's round-join arc tolerance controls how many tiny straight segments
// approximate each rounded corner the offset introduces — and it is an ABSOLUTE
// value in whatever coordinate space you feed it, not relative to delta or to
// CLIPPER_SCALE. clipper-lib's own default (0.25) is tuned for callers that don't
// pre-scale their coordinates; left as-is here (in our 1000x-scaled space, 0.25
// scaled units = 0.00025 real units) it computes an extremely fine arc
// approximation regardless of margin size — for a typical few-unit margin that
// works out to ~150-200 segments per full circle, i.e. tens of extra segments at
// *every* vertex that needs a round join. On a complex path (hundreds/thousands of
// vertices) that multiplies out fast enough to be the actual performance risk this
// module has to avoid (see the acceptance criteria: silhouette of a ~1000-2000
// vertex path must finish in a few seconds). Re-scaling clipper's own default by
// CLIPPER_SCALE keeps the same *real-world* smoothness (imperceptible on screen)
// while keeping the segment count per round join small and independent of margin size.
const ARC_TOLERANCE_SCALED = 0.25 * CLIPPER_SCALE;

// Bezier curves must become straight-line segments before a polygon-offset library
// can touch them — the exact same technique, for the exact same reason, as
// svgProcessor.ts's `unified.simplify(25); unified.flatten(8);` before its
// OpenSCAD offset() export (see the comment there for the full "why"). The
// difference here: svgProcessor.ts works in real-world mm and can afford one fixed
// tolerance; this module runs directly on layer-local units whose absolute scale
// varies wildly (a 40-unit-tall letter vs. a 1000-unit imported SVG), so the
// tolerance is derived as a small fraction of the shapes' own combined size rather
// than a flat constant — otherwise a fixed tolerance would either butcher small
// text (too coarse) or flatten a large import into tens of thousands of segments
// (too fine, slow).
const FLATTEN_TOLERANCE_RATIO = 0.004; // 0.4% of the combined shapes' longest side
const FLATTEN_TOLERANCE_MIN = 0.05;
const FLATTEN_TOLERANCE_MAX = 4;

export interface OffsetResult {
    shapes: ImagePathShape[];
    /** Bounding-box width of the returned (already (0,0)-normalized) shapes. */
    width: number;
    /** Bounding-box height of the returned (already (0,0)-normalized) shapes. */
    height: number;
    /**
     * Translation that was applied to re-normalize the offset shapes back to a
     * (0,0)-origin bounding box, relative to the *input* shapes' local origin.
     * Expanding outward moves the top-left corner into negative coordinates (e.g.
     * roughly -margin, -margin); this is how far it got shifted back. Callers that
     * need to keep the new layer visually centered on the source layer (e.g.
     * Editor2D.tsx's "duplicate + silhouette" action) use this to adjust the new
     * layer's transform.
     */
    originShiftX: number;
    originShiftY: number;
}

function formatCoord(n: number): number {
    // 2-decimal precision mirrors textToPath.ts's `toPathData(2)` — plenty for
    // on-screen rendering, keeps the `d` string compact.
    return Math.round(n * 100) / 100;
}

function polygonToPathData(points: ClipperIntPoint[]): string {
    if (points.length === 0) return '';
    const first = points[0];
    let d = `M ${formatCoord(first.X / CLIPPER_SCALE)} ${formatCoord(first.Y / CLIPPER_SCALE)}`;
    for (let i = 1; i < points.length; i++) {
        const p = points[i];
        d += ` L ${formatCoord(p.X / CLIPPER_SCALE)} ${formatCoord(p.Y / CLIPPER_SCALE)}`;
    }
    d += ' Z';
    return d;
}

/**
 * Flattens a parsed paper.js Path/CompoundPath into its closed polygon subpaths,
 * already scaled into clipper-lib's integer coordinate space.
 */
function extractScaledSubpaths(item: paper.PathItem, flattenTolerance: number): ClipperPath[] {
    item.flatten(flattenTolerance);
    const children: paper.Path[] =
        item.className === 'CompoundPath' ? ((item as paper.CompoundPath).children as paper.Path[]) : [item as paper.Path];

    const subpaths: ClipperPath[] = [];
    for (const child of children) {
        // Silhouette/offset geometry only makes sense for closed regions. Force-close
        // any open subpath (e.g. stroke-only lineart without an explicit "Z" in the
        // source `d`) so it still offsets as a filled polygon instead of being
        // misinterpreted as a degenerate zero-area line.
        child.closed = true;
        const points: ClipperIntPoint[] = child.segments.map((seg) => ({
            X: Math.round(seg.point.x * CLIPPER_SCALE),
            Y: Math.round(seg.point.y * CLIPPER_SCALE),
        }));
        if (points.length >= 3) subpaths.push(points);
    }
    return subpaths;
}

/**
 * Expands every shape in `shapes` outward by `margin` (layer-local units — see
 * module doc). Each input shape becomes an independent offset+union operation
 * (so touching/overlapping subpaths within one shape merge, e.g. adjacent letters
 * in one text layer), keeping that shape's own fill/stroke. Shapes with empty `d`
 * (e.g. textToPath.ts's whitespace-only fallback) pass through unchanged.
 *
 * Positive `margin` expands outward (the "silhouette" use case); negative shrinks
 * inward. Shapes that fully collapse under a large negative margin are dropped
 * from the result.
 */
export function offsetShapes(shapes: ImagePathShape[], margin: number): OffsetResult {
    const project = getPaperProject();
    const parsedItems: paper.PathItem[] = [];

    try {
        // Pass 1: parse everything and measure the combined bounds, so the flatten
        // tolerance (a % of size) is based on the whole layer, not a single shape —
        // keeps multi-shape layers visually consistent.
        let combinedBounds: paper.Rectangle | null = null;
        for (const shape of shapes) {
            if (!shape.d) continue;
            const item = paper.PathItem.create(shape.d);
            parsedItems.push(item);
            combinedBounds = combinedBounds ? combinedBounds.unite(item.bounds) : item.bounds.clone();
        }

        if (!combinedBounds) {
            // Nothing parseable (e.g. a layer made only of empty/whitespace shapes) —
            // nothing to offset, hand shapes back unchanged.
            return { shapes, width: 0, height: 0, originShiftX: 0, originShiftY: 0 };
        }

        const longestSide = Math.max(combinedBounds.width, combinedBounds.height, 1);
        const flattenTolerance = Math.min(
            FLATTEN_TOLERANCE_MAX,
            Math.max(FLATTEN_TOLERANCE_MIN, longestSide * FLATTEN_TOLERANCE_RATIO)
        );

        const deltaScaled = margin * CLIPPER_SCALE;

        // Pass 2: offset each parsed shape independently.
        const rawResults: { d: string; fill: string | null; stroke: string | null; strokeWidth: number }[] = [];
        let parsedIndex = 0;
        for (const shape of shapes) {
            if (!shape.d) {
                rawResults.push({ d: '', fill: shape.fill, stroke: shape.stroke, strokeWidth: shape.strokeWidth });
                continue;
            }
            const item = parsedItems[parsedIndex++];
            const subpaths = extractScaledSubpaths(item, flattenTolerance);
            if (subpaths.length === 0) {
                rawResults.push({ d: '', fill: shape.fill, stroke: shape.stroke, strokeWidth: shape.strokeWidth });
                continue;
            }

            const offset = new ClipperLib.ClipperOffset(2, ARC_TOLERANCE_SCALED);
            offset.AddPaths(subpaths, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
            const solution: ClipperPaths = [];
            offset.Execute(solution, deltaScaled);

            if (solution.length === 0) {
                // Fully collapsed under a large negative margin — drop this shape.
                continue;
            }

            const d = solution.map(polygonToPathData).join(' ');
            rawResults.push({ d, fill: shape.fill, stroke: shape.stroke, strokeWidth: shape.strokeWidth });
        }

        // Pass 3: re-normalize the combined result back to a (0,0)-origin bounding
        // box, matching ImagePathShape's "layer-local origin" contract, using the
        // SAME dedicated scope to re-parse the produced `d` strings and measure
        // bounds (cheap: already-flattened polygons, no more curve work to do).
        let resultBounds: paper.Rectangle | null = null;
        const resultItems: (paper.PathItem | null)[] = [];
        for (const r of rawResults) {
            if (!r.d) {
                resultItems.push(null);
                continue;
            }
            const item = paper.PathItem.create(r.d);
            resultItems.push(item);
            resultBounds = resultBounds ? resultBounds.unite(item.bounds) : item.bounds.clone();
        }

        if (!resultBounds) {
            return { shapes: rawResults, width: 0, height: 0, originShiftX: 0, originShiftY: 0 };
        }

        const originShiftX = -resultBounds.left;
        const originShiftY = -resultBounds.top;

        const normalizedShapes: ImagePathShape[] = rawResults.map((r, i) => {
            const item = resultItems[i];
            if (!item) return { d: '', fill: r.fill, stroke: r.stroke, strokeWidth: r.strokeWidth };
            item.translate(new paper.Point(originShiftX, originShiftY));
            return { d: item.pathData, fill: r.fill, stroke: r.stroke, strokeWidth: r.strokeWidth };
        });

        return {
            shapes: normalizedShapes,
            width: resultBounds.width,
            height: resultBounds.height,
            originShiftX,
            originShiftY,
        };
    } finally {
        // Clear the whole shared project rather than removing items one by one —
        // simpler, and guaranteed to catch every item this call inserted (both
        // the parsed inputs and the intermediate result items above), so repeated
        // "Duplicar + silhueta" clicks across a session don't accumulate items in
        // memory (same rationale as the singleton comment on getPaperProject()).
        project.clear();
    }
}
