/**
 * Serializes ALL active `PartGroup`s (lib/partGrouping.ts) at once into one SVG
 * string per part, ready to upload as `partN_svg` fields to
 * `POST /api/generate_parametric/editor_generico` (Group 6's backend model).
 *
 * This is the flattening step `partGrouping.ts` explicitly hands off to Group 7:
 * each layer's `shapes[].d` is local-origin-relative (see ImagePathShape's doc in
 * types/editor2d.ts); this module applies that layer's Konva `transform`
 * (translate → rotate → scale, Konva's composition order) to every shape's path
 * data so all of a part's layers land correctly positioned relative to each other
 * in one shared coordinate space, then bakes the result into flat SVGs.
 *
 * ── Why ALL parts are serialized together, sharing ONE bounding box ──────────
 * (Fix for a bug found during manual QA after Group 7 shipped, confirmed live
 * against the backend: two parts positioned relative to each other on the
 * canvas — e.g. a base shape on `part_1` and an inset design on `part_2` —
 * came back in the generated `.3mf` both anchored at their own independent
 * (0,0), losing the relative offset entirely.)
 *
 * If each part's SVG were normalized to *its own* tight content bbox
 * independently (the original per-part approach), every part's local (0,0)
 * would land at a different point in the shared canvas, and OpenSCAD has no
 * way to know how to put them back together — `_pack_bambu_3mf` only
 * normalizes the combined mesh set's Z (so everything sits on the print bed),
 * it never re-aligns parts in X/Y. Computing ONE union bounding box across
 * *every active part's* (already layer-transformed) shapes, and shifting every
 * part by that SAME amount, means each part's SVG keeps its true position
 * relative to the others — a part with no content near the shared origin will
 * simply have empty space in that region of its own viewBox, which is exactly
 * what preserves the relative offset.
 *
 * ── Why bake the transform into `d` instead of emitting a per-shape SVG
 *    `transform="..."` attribute ────────────────────────────────────────────
 * The backend would normally run uploaded part SVGs through
 * `backend/app/api/_svg_normalize.py::normalize_svg_to_origin`, which finds the
 * content bounding box by regex-scanning every `d="..."` attribute directly —
 * it has no notion of a `transform` attribute on `<path>`/`<g>`. For
 * `editor_generico` specifically that normalization step is now skipped
 * entirely server-side (`models/editor_generico/config.json`'s
 * `skip_svg_normalize: true`, honored in `generator.py`) precisely *because*
 * it would independently re-tighten each part's viewBox to its own content
 * again, undoing the shared-frame fix above. Baking the transform into `d` up
 * front (via paper.js, matching the technique lib/svgImport.ts and
 * lib/polygonOffset.ts already use for the exact same reason) is kept anyway —
 * it's still the simplest way to get one flat, dependency-free SVG per part.
 *
 * ── Why every part's viewBox/width/height use the SAME shared size, not each
 *    part's own tight content size ────────────────────────────────────────────
 * OpenSCAD's `import()` + the model's literal no-op
 * `resize([0,0,0], auto=[false,false,false])` (models/editor_generico/model.scad)
 * derives the extruded part's physical size from the SVG's `width`/`height`
 * attributes (taken as literal millimeters) scaled against its `viewBox`. Using
 * the shared composition's width/height for every part (even a part whose own
 * content only fills a small corner of it) is what makes each part's SVG
 * coordinate space — and therefore its final 3D position — consistent with
 * every other part's. This only works because `normalize_svg_to_origin` is
 * skipped for this model (see above); it would otherwise rewrite each part's
 * viewBox back down to that part's own tight content, silently reintroducing
 * the misalignment this module exists to prevent.
 *
 * ── Editor units vs. real-world millimeters ──────────────────────────────────
 * The Editor 2D canvas has no established mm-per-unit ratio (see
 * lib/polygonOffset.ts's module doc and Editor2D.tsx's `DEFAULT_SILHOUETTE_MARGIN`
 * comment, both of which explicitly leave this reconciliation to this group).
 * This module makes that call: 1 canvas/layer-local unit = 1mm, applied directly
 * with no extra scale factor. This is the simplest, most deterministic choice
 * given no other conversion factor exists anywhere in the app; users can resize a
 * layer freely on the canvas (which changes its `transform.scaleX/scaleY`) before
 * generating if the resulting physical size isn't what they want.
 *
 * ── Z (height) stacking ────────────────────────────────────────────────────
 * Handled entirely in `models/editor_generico/model.scad`, not here: each
 * active part is translated up by the summed height of every lower-numbered
 * active part before being extruded, so `part_1` is always the physical base
 * and higher-numbered active parts stack on top of it in order. This module
 * only ever produces 2D (X/Y) geometry.
 */
import paper from 'paper';
import ClipperLib from 'clipper-lib';
import type { Path as ClipperPath, Paths as ClipperPaths } from 'clipper-lib';
import type { PartGroup } from './partGrouping';
import type { LayerTransform, PartId } from '../types/editor2d';

// Dedicated headless PaperScope — same isolation pattern as lib/svgImport.ts,
// lib/polygonOffset.ts and svgProcessor.ts (see their module docs for the full
// rationale). This is a fourth independent headless paper.js consumer sharing
// this single-page app, so it must never touch the ambient `paper` global.
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

/**
 * Builds the affine matrix for a layer's Konva transform, matching Konva's own
 * composition order World = Translate(x,y) ∘ Rotate(rotation) ∘ Scale(scaleX,scaleY)
 * applied to a local-origin-relative point (no offsetX/offsetY/skew — this editor
 * never sets those). This is the same order Editor2D.tsx's
 * `handleDuplicateSilhouette` derives by hand for its origin-shift correction.
 *
 * paper.Matrix(a, b, c, d, tx, ty) matches the standard SVG `matrix(a,b,c,d,e,f)`
 * convention: x' = a*x + c*y + tx, y' = b*x + d*y + ty.
 */
function layerMatrix(t: LayerTransform): paper.Matrix {
    const rad = (t.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return new paper.Matrix(
        t.scaleX * cos, t.scaleX * sin,
        -t.scaleY * sin, t.scaleY * cos,
        t.x, t.y
    );
}

const SVG_NS = 'http://www.w3.org/2000/svg';

// clipper-lib integer-coordinate scale — same convention/rationale as
// lib/polygonOffset.ts (see that module's doc for why 1000x).
const CLIPPER_SCALE = 1000;

// Morphological "closing" radius (grow then shrink by this amount) applied to
// every shape below, in mm (this module's units — see module doc). Fixes a
// real defect found via manual QA: some fonts' glyph outlines are *designed*
// to have adjacent letters touch (e.g. a connected-script style), but the
// actual bezier boundary can meet at a near-zero-width point rather than a
// robust bridge. Browsers render that fine (anti-aliased fill hides a
// sub-pixel gap/pinch), but OpenSCAD's exact CGAL-based extrusion does not —
// it was confirmed (via a real generated job, letters "x"+"t" in the Chewy
// font) to produce a non-watertight mesh with a visible gap exactly at that
// pinch point, even though the source SVG was a single, "clean" closed path
// with no separate hole polygons. A small closing pass welds any such
// near-zero-width connection into a real minimum-width bridge. 0.3mm is
// deliberately tiny — far below any feature size a font's actual letter
// counters (the holes in "e", "o", etc.) would have, so genuine holes survive
// closing unchanged; only pathological pinches this thin get fixed. Applied
// here (not just in lib/polygonOffset.ts's silhouette path) because the bug
// reproduces on plain, un-offset text too — this is the shared step every
// layer (text, image, silhouette) passes through before upload, so it's the
// right place for a fix that must cover all of them.
const CLOSE_DELTA_MM = 0.3;

// Bezier-to-polygon flatten tolerance for the repair pass, in mm (this module's
// units — see module doc: 1 unit = 1mm, unlike lib/polygonOffset.ts's abstract
// editor units, so a FIXED real-world tolerance is the right call here rather
// than one scaled to the shape's own size). Every shape gets flattened before
// going through Clipper (it only understands polygons, not curves) — too
// coarse a tolerance visibly facets what should be smooth letter curves at
// larger print sizes (found via manual QA: a ~550mm-wide composition came out
// visibly polygonal with a size-relative tolerance capped at 4mm). 0.1mm is
// well below anything a nozzle can resolve, so curves stay visually smooth
// regardless of how big the composition is.
const FLATTEN_TOLERANCE_MM = 0.1;

function toClipperSubpaths(item: paper.PathItem, flattenTolerance: number): ClipperPath[] {
    const flat = item.clone({ insert: false }) as paper.PathItem;
    flat.flatten(flattenTolerance);
    const children: paper.Path[] =
        flat.className === 'CompoundPath' ? ((flat as paper.CompoundPath).children as paper.Path[]) : [flat as paper.Path];
    const subpaths: ClipperPath[] = [];
    for (const child of children) {
        child.closed = true;
        const points: ClipperPath = child.segments.map((seg) => ({
            X: Math.round(seg.point.x * CLIPPER_SCALE),
            Y: Math.round(seg.point.y * CLIPPER_SCALE),
        }));
        if (points.length >= 3) subpaths.push(points);
    }
    return subpaths;
}

function closingOffset(paths: ClipperPaths, deltaScaled: number): ClipperPaths {
    const offset = new ClipperLib.ClipperOffset(2, 250);
    offset.AddPaths(paths, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
    const solution: ClipperPaths = [];
    offset.Execute(solution, deltaScaled);
    return solution;
}

function clipperPathToData(points: ClipperPath): string {
    if (points.length === 0) return '';
    const first = points[0];
    let d = `M ${(first.X / CLIPPER_SCALE).toFixed(2)} ${(first.Y / CLIPPER_SCALE).toFixed(2)}`;
    for (let i = 1; i < points.length; i++) {
        const p = points[i];
        d += ` L ${(p.X / CLIPPER_SCALE).toFixed(2)} ${(p.Y / CLIPPER_SCALE).toFixed(2)}`;
    }
    return d + ' Z';
}

/**
 * Welds any near-zero-width pinch in `item`'s boundary into a robust minimum
 * width (see `CLOSE_DELTA_MM` doc), while leaving genuinely open regions
 * (real letter counters, deliberate cutouts) untouched. Returns fresh SVG
 * path data; falls back to `item.pathData` unchanged if the shape has too few
 * points to offset (e.g. a degenerate/empty shape).
 */
function repairPathData(item: paper.PathItem): string {
    const subpaths = toClipperSubpaths(item, FLATTEN_TOLERANCE_MM);
    if (subpaths.length === 0) return item.pathData;

    const deltaScaled = CLOSE_DELTA_MM * CLIPPER_SCALE;
    const grown = closingOffset(subpaths, deltaScaled);
    if (grown.length === 0) return item.pathData;
    const closed = closingOffset(grown, -deltaScaled);
    if (closed.length === 0) return item.pathData;

    return closed.map(clipperPathToData).join(' ');
}

interface FlatShape {
    item: paper.PathItem;
    fill: string | null;
}

/**
 * Flattens every layer of every `group` into transform-free paper.js items, all
 * still living in the same shared coordinate space (the canvas/world space each
 * layer's `transform` already positions it in) — no per-part origin shift yet.
 */
function collectTransformedItems(groups: PartGroup[]): Map<PartId, FlatShape[]> {
    const perPart = new Map<PartId, FlatShape[]>();
    for (const group of groups) {
        const items: FlatShape[] = [];
        for (const layer of group.layers) {
            const matrix = layerMatrix(layer.transform);
            for (const shape of layer.shapes) {
                if (!shape.d) continue;
                const item = paper.PathItem.create(shape.d);
                item.transform(matrix);
                // OpenSCAD's SVG importer extrudes path geometry regardless of CSS-style
                // fill/stroke coloring — the part's actual print color comes from the
                // per-part color picker (extrusor_partN), not from the SVG. A concrete
                // fill (never "none") here just maximizes the odds every shape — including
                // stroke-only lineart, which carries fill: null (see ImagePathShape doc) —
                // is reliably imported as solid geometry.
                items.push({ item, fill: shape.fill ?? '#1a1a1a' });
            }
        }
        perPart.set(group.partId, items);
    }
    return perPart;
}

/**
 * Serializes every active part in `groups` into one SVG string per part, all
 * sharing a single coordinate frame so their relative positions on the Editor 2D
 * canvas are preserved in the generated 3D output. See module doc for the full
 * rationale. Returns a map from `partId` to SVG string; a part with genuinely no
 * drawable content gets a minimal 1x1mm placeholder SVG rather than being
 * omitted (callers still need something to upload for every active slot).
 */
export function serializePartsToSvg(groups: PartGroup[]): Partial<Record<PartId, string>> {
    const project = getPaperProject();
    try {
        const perPartItems = collectTransformedItems(groups);
        const allItems: paper.PathItem[] = [];
        for (const items of perPartItems.values()) {
            for (const { item } of items) allItems.push(item);
        }

        const result: Partial<Record<PartId, string>> = {};

        if (allItems.length === 0) {
            // Degenerate: every layer in every part had only empty shapes (shouldn't
            // happen — groupLayersByPart guarantees >=1 layer per group — but a
            // layer's own shapes could theoretically be empty). Emit minimal,
            // well-formed but content-free SVGs so the caller always has something
            // to upload for each active slot.
            for (const group of groups) {
                result[group.partId] = `<svg xmlns="${SVG_NS}" viewBox="0 0 1 1" width="1mm" height="1mm"></svg>`;
            }
            return result;
        }

        // ONE union bounding box across every active part's content — this shared
        // frame is what preserves each part's position relative to the others.
        let bounds: paper.Rectangle | null = null;
        for (const item of allItems) {
            bounds = bounds ? bounds.unite(item.bounds) : item.bounds.clone();
        }
        const bb = bounds as paper.Rectangle;

        // Shift every item (across all parts) by the same amount, so the shared
        // frame's top-left lands at (0,0) — same normalization as before, just
        // computed once for the whole composition instead of per part.
        const shift = new paper.Point(-bb.left, -bb.top);
        for (const item of allItems) item.translate(shift);

        // Guard against a zero-area composition, which would otherwise produce an
        // invalid viewBox/width/height of 0.
        const width = Math.max(bb.width, 0.01);
        const height = Math.max(bb.height, 0.01);

        for (const group of groups) {
            const items = perPartItems.get(group.partId) ?? [];
            const pathEls = items
                .map(({ item, fill }) => `<path d="${repairPathData(item)}" fill="${fill}" />`)
                .join('');
            result[group.partId] =
                `<svg xmlns="${SVG_NS}" viewBox="0 0 ${width} ${height}" width="${width}mm" height="${height}mm">${pathEls}</svg>`;
        }

        return result;
    } finally {
        // Clear the whole shared project (same rationale as lib/polygonOffset.ts):
        // simpler than removing items one by one, and guarantees no leftover items
        // accumulate across repeated "Gerar 3D" clicks in a session.
        project.clear();
    }
}
