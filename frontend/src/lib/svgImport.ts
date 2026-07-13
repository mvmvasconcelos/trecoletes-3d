import paper from 'paper';
import type { ImagePathShape } from '../types/editor2d';

export interface ParsedSvgImage {
    shapes: ImagePathShape[];
    /** Natural bounding-box width of `shapes` combined, in the SVG's own units. */
    width: number;
    /** Natural bounding-box height of `shapes` combined, in the SVG's own units. */
    height: number;
}

// Singleton headless paper.js canvas, reused across imports — mirrors the pattern in
// svgProcessor.ts. Calling paper.setup() repeatedly on fresh canvases accumulates
// projects in memory and makes geometry operations progressively slower.
//
// Uses a dedicated PaperScope (not the ambient `paper` global) so this module's project
// can't be silently swapped out by another headless paper.js consumer on the same page
// (e.g. svgProcessor.ts, used by the SVG-upload model pages) — paper.js's global `paper`
// object always points at whichever scope called `setup()`/became active most recently,
// so two independent `paper.setup()` callers sharing that global corrupt each other's state
// across navigations within this single-page app.
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
 * Parses raw SVG text into flat path shapes suitable for rendering as Konva.Path nodes.
 *
 * paper.js is used purely as a headless SVG parser/path-extractor here — no paper.js
 * canvas is ever shown to the user. It already handles the messy parts of SVG import
 * (shape-to-path expansion, nested groups/transforms flattened into absolute
 * coordinates) that a hand-rolled path parser would have to reimplement.
 *
 * Design choice for multi-path SVGs: rather than collapsing everything into a single
 * compound path (which would lose per-path fill colors on multi-color art) or requiring
 * a single-path SVG, every top-level Path/CompoundPath becomes its own `ImagePathShape`,
 * all normalized to share one local origin. The caller renders the whole list together
 * inside one Konva.Group, so the group behaves as a single manipulable layer while each
 * subpath keeps its own fill/stroke.
 */
export async function parseSvgToShapes(svgString: string): Promise<ParsedSvgImage> {
    return new Promise((resolve, reject) => {
        try {
            const project = getPaperProject();
            project.importSVG(svgString, {
                expandShapes: true,
                insert: true,
                onError: (err: unknown) => {
                    reject(err instanceof Error ? err : new Error(String(err)));
                },
                onLoad: (item: paper.Item | null) => {
                    try {
                        // Re-activate defensively: if paper.js ever invokes onLoad
                        // asynchronously, another headless consumer (e.g. svgProcessor.ts)
                        // could have activated its own scope in between.
                        _scope?.activate();
                        if (!item) {
                            reject(new Error('SVG vazio ou inválido.'));
                            return;
                        }

                        // Collect top-level path items, skipping children already owned by a
                        // CompoundPath (those are sub-paths, not independent shapes).
                        const allPaths: paper.PathItem[] = [];
                        item.getItems({ class: paper.PathItem }).forEach((child) => {
                            if (child.parent && child.parent.className === 'CompoundPath') return;
                            if (child.className === 'Path' || child.className === 'CompoundPath') {
                                allPaths.push(child as paper.PathItem);
                            }
                        });

                        // Drop fully invisible paths (no fill, no stroke) — e.g. hidden helper
                        // rects some SVG editors leave behind. Fall back to the unfiltered list
                        // if that filter removes everything, so we never produce zero shapes.
                        const visiblePaths = allPaths.filter((p) => p.fillColor || p.strokeColor);
                        const usablePaths = visiblePaths.length > 0 ? visiblePaths : allPaths;

                        if (usablePaths.length === 0) {
                            reject(new Error('Nenhum caminho vetorial encontrado no SVG.'));
                            return;
                        }

                        let bounds: paper.Rectangle | null = null;
                        usablePaths.forEach((p) => {
                            bounds = bounds ? bounds.unite(p.bounds) : p.bounds;
                        });
                        if (!bounds) bounds = item.bounds;
                        const bb = bounds as paper.Rectangle;

                        // Normalize each path so the combined bounding box starts at (0, 0),
                        // matching the "layer-local origin" contract of ImagePathShape.
                        const shapes: ImagePathShape[] = usablePaths.map((p) => {
                            p.translate(new paper.Point(-bb.left, -bb.top));
                            const d = p.pathData;
                            const fill = p.fillColor ? p.fillColor.toCSS(true) : null;
                            const stroke = p.strokeColor ? p.strokeColor.toCSS(true) : null;
                            return {
                                d,
                                // Stroke-only (lineart) paths keep fill=null; everything else
                                // defaults to solid black if the SVG didn't set an explicit color.
                                fill: fill ?? (stroke ? null : '#1a1a1a'),
                                stroke,
                                strokeWidth: p.strokeWidth || 0,
                            };
                        });

                        const width = bb.width;
                        const height = bb.height;
                        project.clear();
                        resolve({ shapes, width, height });
                    } catch (e) {
                        reject(e instanceof Error ? e : new Error(String(e)));
                    }
                },
            });
        } catch (e) {
            reject(e instanceof Error ? e : new Error(String(e)));
        }
    });
}
