import paper from 'paper';

export interface ProcessedSVG {
    originalSvg: string;     // The unmodified input SVG text
    thickenedSvg: string;    // The SVG paths thickened by the offset
    silhouetteSvg: string;   // The unified filled outer bounds
    offsetX: number;         // Center correction info
    offsetY: number;
    width: number;           // Actual content width
    height: number;          // Actual content height
}

/**
 * Initializes paper.js in a headless/hidden canvas just for calculations.
 */
function initPaper(): paper.Project {
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 1000;
    paper.setup(canvas);
    return paper.project;
}

function injectPaddedViewBox(svgStr: string, cbWidth: number, cbHeight: number): string {
    let result = svgStr;
    // Remove explicit dimensions on the root SVG element to force a fluid container
    // We restrict the match strictly to the <svg > root tag so we don't destroy stroke-width=".." on children
    result = result.replace(/(<svg\b[^>]*) width="[^"]*"/ig, '$1');
    result = result.replace(/(<svg\b[^>]*) height="[^"]*"/ig, '$1');
    result = result.replace(/(<svg\b[^>]*) viewBox="[^"]*"/ig, '$1');
    
    // Add safe padded margin for UI centering
    const px = Math.max(cbWidth * 0.15, 10);
    const py = Math.max(cbHeight * 0.15, 10);
    const vx = -px;
    const vy = -py;
    const vw = cbWidth + px * 2;
    const vh = cbHeight + py * 2;

    // Use regex to locate `<svg` to unconditionally insert the new scaled viewBox
    result = result.replace(/^<svg\b/i, `<svg viewBox="${vx} ${vy} ${vw} ${vh}" width="100%" height="100%"`);
    return result;
}

/**
 * Parses raw SVG string into paper.js items and extracts paths.
 */
export async function processSvgFile(
    svgString: string,
    thickness: number = 0.5,
    silhouetteOffset: number = 3.0,
    preserveFill: boolean = true
): Promise<ProcessedSVG | null> {
    return new Promise((resolve, reject) => {
        try {
            const project = initPaper();

            // Import the original SVG
            project.importSVG(svgString, {
                expandShapes: true,
                insert: true,
                onError: (err: any) => reject(err),
                onLoad: (item: paper.Item) => {
                    // Remove invisible paths (like empty canvas rectangles) before any calculation
                    const toRemove: paper.Item[] = [];
                    item.getItems({ class: paper.PathItem }).forEach((child) => {
                        if (child.parent && child.parent.className === 'CompoundPath') {
                            return; // It's a member of a CompoundPath, skip
                        }
                        if (!child.strokeColor && !child.fillColor) {
                            toRemove.push(child);
                        }
                    });
                    toRemove.forEach(c => c.remove());

                    // 1. Traverse and extract all valid path items
                    const allPaths: paper.PathItem[] = [];
                    item.getItems({ class: paper.PathItem }).forEach((child) => {
                        if (child.className === 'Path' || child.className === 'CompoundPath') {
                            allPaths.push(child as paper.PathItem);
                        }
                    });

                    if (allPaths.length === 0) {
                        reject(new Error("No valid vector paths found in SVG."));
                        return;
                    }

                    // Normalize: translate everything so the content bounding box
                    // starts at (0, 0). This ensures the exported SVG has
                    // viewBox="0 0 W H", so OpenSCAD resize() places the art
                    // reliably at (0,0)→(art_width, art_height) in SCAD space.
                    let cb: paper.Rectangle | null = null;
                    item.getItems({ class: paper.PathItem }).forEach((child) => {
                        if (child.parent && child.parent.className === 'CompoundPath') {
                            return;
                        }
                        if (!cb) cb = child.bounds;
                        else cb = cb.unite(child.bounds);
                    });
                    if (!cb) cb = item.bounds;

                    // FIXED: translate each path individually to bake coords into path data.
                    // (Group.translate adds a <g transform> that OpenSCAD ignores.)
                    const dx = -cb.left;
                    const dy = -cb.top;
                    item.getItems({ class: paper.PathItem }).forEach((child) => {
                        // Only translate top level path items to avoid double translation
                        if (child.parent && child.parent.className === 'CompoundPath') {
                            return;
                        }
                        child.translate(new paper.Point(dx, dy));
                    });



                    // 2. Thicken: set strokeWidth geometrically on cloned filled paths.
                    // Paper.js exports stroke as SVG attribute. OpenSCAD respects stroke-width
                    // when importing SVG, expanding the rendered geometry.
                    const thickenedItem = item.clone();
                    thickenedItem.getItems({ class: paper.PathItem }).forEach((child: paper.Item) => {
                        if (child.parent && child.parent.className === 'CompoundPath') {
                            return;
                        }
                        const pathChild = child as paper.Path;
                        if (thickness > 0) {
                            pathChild.strokeWidth = thickness;
                            pathChild.strokeJoin = 'round';
                            pathChild.strokeCap = 'round';
                            // Use fill color as stroke so it blends and expands outward
                            pathChild.strokeColor = pathChild.fillColor || new paper.Color('black');
                        }
                    });

                    const exportOptions = { asString: true, bounds: 'content' } as any;
                    let thickenedSvgStr = thickenedItem.exportSVG(exportOptions) as string;
                    thickenedItem.remove();

                    const thickenedSvg = injectPaddedViewBox(thickenedSvgStr, cb.width, cb.height);

                    // 3. Generate Silhouette (The Outer Cookie Cutter Rim)
                    // We unite all paths into a single solid block, remove internal holes, and then expand it by silhouetteOffset.
                    let unified: paper.PathItem | null = null;

                    // First pass: unite everything to get a single exterior.
                    allPaths.forEach(path => {
                        // temporarily make everything filled to unite them solid
                        path.fillColor = new paper.Color('black');
                        if (!unified) {
                            unified = path.clone() as paper.PathItem;
                        } else {
                            const newUnion = unified.unite(path);
                            unified.remove();
                            unified = newUnion as paper.PathItem;
                        }
                    });

                    if (!unified) {
                        reject(new Error("Failed to unite paths."));
                        return;
                    }

                    // If the union created a CompoundPath, we only want the outermost boundary (no holes for the cutter base)
                    if ((unified as paper.Item).className === 'CompoundPath') {
                        // Keep only the children with the largest area or clockwise orientation
                        // A naive approach is to just take the first child (often the outer hull in simple SVGs)
                        const compound = unified as paper.CompoundPath;
                        if (compound.children.length > 0) {
                            // Sort by area, largest is likely the bounding hull
                            let largestHull = compound.children[0] as paper.Path;
                            let maxArea = Math.abs(largestHull.area);

                            for (let i = 1; i < compound.children.length; i++) {
                                const child = compound.children[i] as paper.Path;
                                if (Math.abs(child.area) > maxArea) {
                                    maxArea = Math.abs(child.area);
                                    largestHull = child;
                                }
                            }
                            const singlePath = new paper.Path(largestHull.segments);
                            singlePath.closed = true;
                            (unified as paper.Item).remove();
                            unified = singlePath;
                        }
                    }

                    // Expand the robust hull for the cutter silhouette
                    // Simple paper.js hack for offset: give it a thick stroke, and export!
                    unified.fillColor = new paper.Color('black');
                    unified.strokeColor = new paper.Color('black');
                    unified.strokeWidth = silhouetteOffset * 2; // Expand in all directions
                    unified.strokeJoin = 'round';

                    const silhouetteSvgRaw = unified.exportSVG(exportOptions) as string;
                    const silhouetteSvg = injectPaddedViewBox(silhouetteSvgRaw, cb.width, cb.height);

                    project.clear();

                    resolve({
                        originalSvg: svgString,
                        thickenedSvg: thickenedSvg,
                        silhouetteSvg: silhouetteSvg,
                        offsetX: 0,
                        offsetY: 0,
                        width: cb.width,
                        height: cb.height
                    });
                }
            });
        } catch (e) {
            reject(e);
        }
    });
}
