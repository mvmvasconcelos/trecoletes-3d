/**
 * Groups the editor's flat `layers` array by `partId` (Group 5).
 *
 * This is the hand-off point for Group 7 (generation panel / height+color
 * assignment): call `groupLayersByPart(layers)` to get one entry per part
 * that actually has at least one layer assigned, in a stable `part_1..part_4`
 * order. Unassigned layers (`partId: null`) and empty parts are omitted —
 * Group 7 should treat "not present in this array" as "nothing to generate
 * for that part".
 *
 * Each entry's `layers` are still full `EditorLayer` objects (image or text),
 * each carrying its own `shapes: ImagePathShape[]` (already-flattened SVG
 * path data, see types/editor2d.ts) and `transform`. Group 7 is expected to
 * apply each layer's `transform` to its `shapes[].d` paths when serializing
 * a part to SVG for the backend — that flattening step is out of scope here.
 */
import type { EditorLayer, PartId } from '../types/editor2d';

/** Canonical, fixed order of the 4 possible parts — never derive this list dynamically. */
export const ALL_PART_IDS: readonly PartId[] = ['part_1', 'part_2', 'part_3', 'part_4'];

export interface PartGroup {
    partId: PartId;
    layers: EditorLayer[];
}

/**
 * Groups `layers` by `partId`, skipping unassigned layers (`partId: null`)
 * and skipping parts with zero layers assigned. Result is ordered
 * `part_1, part_2, part_3, part_4` (only the non-empty ones), so it is stable
 * across renders regardless of layer insertion order.
 */
export function groupLayersByPart(layers: EditorLayer[]): PartGroup[] {
    const groups: PartGroup[] = [];
    for (const partId of ALL_PART_IDS) {
        const layersForPart = layers.filter((layer) => layer.partId === partId);
        if (layersForPart.length > 0) {
            groups.push({ partId, layers: layersForPart });
        }
    }
    return groups;
}
