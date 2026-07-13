/**
 * Renders text to vector path shapes using a server-hosted .ttf font, so a
 * "text layer" in the Editor 2D can be manipulated (moved/scaled/rotated)
 * through the exact same Konva.Path machinery svgImport.ts feeds for
 * imported SVG/PNG layers — see `ImagePathShape` in ../types/editor2d.
 */
import * as opentype from 'opentype.js';
import type { ImagePathShape } from '../types/editor2d';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export interface FontOption {
    /** Basename (no extension) of the .ttf file under backend/static/fonts/. */
    file: string;
    /** Label shown in the font picker. */
    label: string;
}

// Canonical font list for this editor. Mirrors the `font_name` parameter options
// shared by the OpenSCAD-backed models (see e.g. models/letreiro_social/config.json,
// models/chaveiro_simples/config.json) — that's the project's existing source of
// truth for "which fonts do we ship". Those configs use libfontconfig-style values
// like "Bree Serif:style=Regular"; the on-disk .ttf filenames under
// backend/static/fonts/ replace spaces with underscores (e.g. "Bree_Serif.ttf").
// The two aren't always byte-identical, so the mapping below is explicit rather
// than derived at runtime from either source.
export const FONT_OPTIONS: FontOption[] = [
    { file: 'Chewy', label: 'Chewy' },
    { file: 'Bangers', label: 'Bangers' },
    { file: 'Leckerli_One', label: 'Leckerli One' },
    { file: 'Pacifico', label: 'Pacifico' },
    { file: 'Comic_Neue', label: 'Comic Neue' },
    { file: 'Oswald', label: 'Oswald' },
    { file: 'Bree_Serif', label: 'Bree Serif' },
];

export const DEFAULT_FONT_FILE = FONT_OPTIONS[0].file;

// Module-level cache of parsed fonts, keyed by file basename. Re-typing or
// resizing text re-runs textToPath() on every keystroke, but the network
// fetch + opentype.parse() only happens once per font per page load.
const fontCache = new Map<string, Promise<opentype.Font>>();

function loadFont(fontFile: string): Promise<opentype.Font> {
    let pending = fontCache.get(fontFile);
    if (!pending) {
        pending = fetch(`${API_BASE}/static/fonts/${fontFile}.ttf`)
            .then((res) => {
                if (!res.ok) {
                    throw new Error(`Não foi possível carregar a fonte "${fontFile}".`);
                }
                return res.arrayBuffer();
            })
            .then((buffer) => opentype.parse(buffer));
        // Don't cache a failed load — a transient network error shouldn't
        // permanently poison this font for the rest of the session.
        pending.catch(() => fontCache.delete(fontFile));
        fontCache.set(fontFile, pending);
    }
    return pending;
}

export interface TextToPathResult {
    shapes: ImagePathShape[];
    /** Natural (pre-scale) bounding-box width of the rendered glyphs, in font units. */
    width: number;
    /** Natural (pre-scale) bounding-box height of the rendered glyphs, in font units. */
    height: number;
}

const TEXT_FILL_COLOR = '#1a1a1a';

/**
 * Builds a text path by composing each character's own glyph outline directly
 * (via `charToGlyph`), advancing by its own advance width — bypassing
 * opentype.js's GSUB-based shaping pipeline (ligatures, contextual
 * substitution) that `font.getPath()` runs for a whole string. Some bundled
 * fonts (e.g. Bangers, Oswald) contain a GSUB lookup type opentype.js doesn't
 * implement ("substFormat 2" contextual substitution) and throw on
 * `font.getPath()` for ordinary text, not just edge cases — this is the
 * fallback for those. We don't need ligatures/contextual substitution for
 * this editor's use case (outline-to-3D-print paths, not rich text layout),
 * so losing them in the fallback path is an acceptable, deliberate trade-off.
 */
function getPathPerGlyph(font: opentype.Font, text: string, x: number, y: number, fontSize: number): opentype.Path {
    const scale = fontSize / font.unitsPerEm;
    const path = new opentype.Path();
    let cursorX = x;
    for (const ch of text) {
        const glyph = font.charToGlyph(ch);
        path.extend(glyph.getPath(cursorX, y, fontSize));
        cursorX += (glyph.advanceWidth ?? 0) * scale;
    }
    return path;
}

/** `font.getPath()`, falling back to `getPathPerGlyph` if the font's GSUB table
 * trips an opentype.js parsing limitation (see `getPathPerGlyph`'s doc). */
function getTextPath(font: opentype.Font, text: string, x: number, y: number, fontSize: number): opentype.Path {
    try {
        return font.getPath(text, x, y, fontSize);
    } catch {
        return getPathPerGlyph(font, text, x, y, fontSize);
    }
}

/**
 * Fetches (or reuses a cached) .ttf font and converts `text` at `fontSize` into
 * one ImagePathShape whose `d` is normalized to start at the layer-local origin
 * (0,0), matching svgImport.ts's contract so both layer types render identically.
 */
export async function textToPath(text: string, fontFile: string, fontSize: number): Promise<TextToPathResult> {
    // opentype.js produces an empty command list (and a degenerate bounding box)
    // for whitespace-only/empty input — fall back to a single space so callers
    // always get a valid, finite-sized (if empty-looking) shape instead of NaNs.
    const renderText = text.length > 0 ? text : ' ';
    const font = await loadFont(fontFile);

    const rawPath = getTextPath(font, renderText, 0, 0, fontSize);
    const bbox = rawPath.getBoundingBox();
    const hasFiniteBounds =
        Number.isFinite(bbox.x1) && Number.isFinite(bbox.y1) && Number.isFinite(bbox.x2) && Number.isFinite(bbox.y2);

    if (!hasFiniteBounds) {
        // Nothing but whitespace glyphs (no ink) — return an empty, zero-size shape
        // rather than feeding Infinity/NaN into the layer's transform math.
        return { shapes: [{ d: '', fill: TEXT_FILL_COLOR, stroke: null, strokeWidth: 0 }], width: 0, height: 0 };
    }

    const width = Math.max(bbox.x2 - bbox.x1, 0);
    const height = Math.max(bbox.y2 - bbox.y1, 0);

    // Re-render translated so the combined bounding box starts at (0, 0),
    // matching the "layer-local origin" contract of ImagePathShape.
    const normalizedPath = getTextPath(font, renderText, -bbox.x1, -bbox.y1, fontSize);
    const d = normalizedPath.toPathData(2);

    return {
        shapes: [{ d, fill: TEXT_FILL_COLOR, stroke: null, strokeWidth: 0 }],
        width,
        height,
    };
}
