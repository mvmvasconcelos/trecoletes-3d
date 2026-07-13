/**
 * Shared data model for the "Editor 2D" canvas (Konva-based).
 *
 * Group 2 defined the `'image'` layer type; Group 3 (this) adds `'text'`.
 * Every layer carries a stable id, a type discriminator, and Konva transform
 * state in common via `BaseLayer`.
 */

/** 2D affine transform Konva tracks for every layer on the canvas. */
export interface LayerTransform {
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
}

/**
 * A single filled/stroked subpath extracted from an imported SVG, already
 * normalized to start at the owning layer's local origin (0,0) — i.e. the
 * coordinates in `d` are relative to the layer's own bounding box, not the
 * page/stage. The layer's Konva transform (position/scale/rotation) is what
 * places it on the canvas.
 */
export interface ImagePathShape {
    /** SVG path "d" attribute data, ready to feed directly into Konva.Path. */
    d: string;
    fill: string | null;
    stroke: string | null;
    strokeWidth: number;
}

/** Discriminator for layer variants. */
export type LayerType = 'image' | 'text';

/**
 * One of the up to 4 "parts" a layer can be assigned to (Group 5). A part is
 * just a bucket of layer ids at this stage — height/color/material per part
 * is assigned later, in Group 7's generation panel, which is a separate
 * always-visible UI next to the 3D viewer (not built here). Layers with
 * `partId: null` are unassigned and excluded from generation.
 *
 * Hardcoded to exactly 4 values on purpose: any UI offering part choices
 * (see LayerPanel.tsx) must enumerate exactly `PartId` (never derive options
 * dynamically from something that could grow past 4), so "no 5th part" is
 * guaranteed by the type system instead of by ad-hoc validation.
 */
export type PartId = 'part_1' | 'part_2' | 'part_3' | 'part_4';

export interface BaseLayer {
    id: string;
    type: LayerType;
    /** Display name shown in the layer list, e.g. "Imagem 1". */
    name: string;
    transform: LayerTransform;
    /** Which of the up to 4 parts this layer belongs to, or `null` if unassigned. */
    partId: PartId | null;
}

/** An imported SVG/PNG rendered as one or more Konva.Path shapes in a group. */
export interface ImageLayer extends BaseLayer {
    type: 'image';
    shapes: ImagePathShape[];
    /** Natural (pre-scale) bounding box of `shapes`, in the SVG's own units. */
    width: number;
    height: number;
}

/**
 * A text string rendered to vector glyph outlines (via lib/textToPath.ts) and
 * rendered as one or more Konva.Path shapes in a group — same `shapes` shape
 * as ImageLayer, so EditorCanvas.tsx renders both layer types identically.
 */
export interface TextLayer extends BaseLayer {
    type: 'text';
    text: string;
    /** Basename (no extension) of the .ttf under backend/static/fonts/, e.g. "Chewy". */
    fontFamily: string;
    fontSize: number;
    shapes: ImagePathShape[];
    /** Natural (pre-scale) bounding box of `shapes`, in font units. */
    width: number;
    height: number;
}

export type EditorLayer = ImageLayer | TextLayer;

export function createDefaultTransform(x = 0, y = 0): LayerTransform {
    return { x, y, scaleX: 1, scaleY: 1, rotation: 0 };
}
