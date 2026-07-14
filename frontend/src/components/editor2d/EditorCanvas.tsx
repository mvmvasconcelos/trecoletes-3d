import { useEffect, useRef, useState } from 'react';
import Konva from 'konva';
import { Stage, Layer, Group, Path, Rect, Transformer } from 'react-konva';
import type { EditorLayer, LayerTransform } from '../../types/editor2d';
import type { PartSettingsMap } from '../../lib/partSettings';
import { PRINT_BED_SIZE_MM, computeStageScale } from '../../lib/stageScale';

interface EditorCanvasProps {
    layers: EditorLayer[];
    selectedIds: string[];
    /** Click/tap on an individual shape. `shift: true` toggles it in/out of the
     * current selection; otherwise it replaces the selection with just this shape. */
    onSelect: (id: string, options?: { shift?: boolean }) => void;
    /** Marquee/rubber-band drag over empty canvas finished with 1+ shapes inside
     * the drag rectangle — ids are ADDED to whatever was already selected. */
    onMarqueeSelect: (ids: string[]) => void;
    /** A plain click (no drag) on empty canvas — clears the selection entirely. */
    onClearSelection: () => void;
    onTransformChange: (id: string, transform: Partial<LayerTransform>) => void;
    /** Fires continuously WHILE a Transformer resize handle is being dragged
     * (Konva's `onTransform`, distinct from `onTransformEnd` which only fires
     * once on release) — reports the node's live width/height in mm (natural
     * layer size × the node's current, still-changing scaleX/scaleY) so a HUD
     * can track the resize in real time. Called with `null` on release (and
     * whenever a plain drag/move — not a resize — ends) so callers don't hold
     * onto a stale in-progress size after the gesture finishes. */
    onTransformPreview: (id: string, size: { width: number; height: number } | null) => void;
    width: number;
    height: number;
    /** Per-part height/color/extruder generation settings (Group 7). Used here
     * only for `.color`: a layer assigned to a part (`layer.partId` non-null)
     * renders every one of its shapes filled with that part's configured
     * color instead of the shape's own `fill`, so it's visually obvious which
     * layers belong to which part. Unassigned layers (`partId: null`) are
     * untouched and keep rendering with `shape.fill` exactly as before. */
    partSettings: PartSettingsMap;
}

const MIN_SIZE_PX = 5;

// Below this many *physical screen* px of pointer movement between mousedown
// and mouseup on the empty stage, the gesture is treated as a plain click
// (clears selection) rather than a marquee-select drag — preserves today's
// exact click-to-clear behavior while still allowing real marquee drags to
// be detected. `stage.getRelativePointerPosition()` (used below) reports
// movement in the Stage's local/unit space, which is divided by `stageScale`
// relative to screen pixels — comparing this constant directly against that
// local-space delta would make the *felt* sensitivity vary with the canvas
// container's size (stageScale grows with it), so call sites divide by
// `stageScale` first to keep the threshold at a constant physical size
// regardless of zoom.
const DRAG_THRESHOLD_PX = 4;

interface RectBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

function rectsIntersect(a: RectBox, b: RectBox): boolean {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function EditorCanvas({
    layers,
    selectedIds,
    onSelect,
    onMarqueeSelect,
    onClearSelection,
    onTransformChange,
    onTransformPreview,
    width,
    height,
    partSettings,
}: EditorCanvasProps) {
    const transformerRef = useRef<Konva.Transformer>(null);
    const nodeRefs = useRef<Record<string, Konva.Group | null>>({});

    // Stage-level zoom so the 256x256mm print bed guide fills most of the
    // view instead of being a tiny square in a much larger (raw container
    // pixel size) canvas — see computeStageScale's doc. `width`/`height`
    // props stay the real container pixel size (the Stage's own DOM canvas
    // dimensions); `visibleWidth`/`visibleHeight` are the *unit-space*
    // (mm) extent actually visible at that zoom, used below for anything
    // that needs to fill/center within the visible area (art-board
    // background, print bed guide).
    const stageScale = computeStageScale(width, height);
    const visibleWidth = width / stageScale;
    const visibleHeight = height / stageScale;

    // Marquee-select gesture tracking. The mousedown position and "has this
    // turned into a drag yet" flag live in refs (not React state) so mousemove
    // doesn't force a render on every pixel of movement before a drag is even
    // confirmed — only `marqueeRect` is React state, since it drives the
    // visible rubber-band rectangle while an actual drag is in progress.
    const marqueeStartRef = useRef<{ x: number; y: number } | null>(null);
    const isDraggingMarqueeRef = useRef(false);
    const [marqueeRect, setMarqueeRect] = useState<RectBox | null>(null);

    // Keep the Transformer attached to whichever Konva node(s) back the
    // selected layer(s). Standard react-konva pattern: the Transformer isn't a
    // child of the shape, it's a sibling pointed at the live node(s) via
    // `.nodes([...])` — Konva's Transformer natively supports multiple nodes,
    // rendering one bounding transform handle set around all of them.
    useEffect(() => {
        const transformer = transformerRef.current;
        if (!transformer) return;
        const selectedNodes = selectedIds
            .map((id) => nodeRefs.current[id])
            .filter((node): node is Konva.Group => node != null);
        transformer.nodes(selectedNodes);
        transformer.getLayer()?.batchDraw();
    }, [selectedIds, layers]);

    return (
        <Stage
            width={width}
            height={height}
            scaleX={stageScale}
            scaleY={stageScale}
            onMouseDown={(e) => {
                // Only track a potential click-vs-marquee gesture when the
                // mousedown itself lands on the empty stage (not a shape) — a
                // mousedown on a shape's Group is handled entirely by that
                // Group's own onClick/onDragStart handlers below. Deliberately
                // does NOT clear the selection here (unlike the old single-select
                // implementation) — the full outcome (clear vs. marquee-add) is
                // decided at mouseup, once the drag distance is known.
                if (e.target !== e.target.getStage()) return;
                const stage = e.target.getStage();
                const pos = stage?.getRelativePointerPosition();
                if (!pos) return;
                marqueeStartRef.current = pos;
                isDraggingMarqueeRef.current = false;
            }}
            onMouseMove={(e) => {
                const start = marqueeStartRef.current;
                if (!start) return;
                const stage = e.target.getStage();
                const pos = stage?.getRelativePointerPosition();
                if (!pos) return;
                const dx = pos.x - start.x;
                const dy = pos.y - start.y;
                if (!isDraggingMarqueeRef.current && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX / stageScale) {
                    isDraggingMarqueeRef.current = true;
                }
                if (isDraggingMarqueeRef.current) {
                    setMarqueeRect({
                        x: Math.min(start.x, pos.x),
                        y: Math.min(start.y, pos.y),
                        width: Math.abs(dx),
                        height: Math.abs(dy),
                    });
                }
            }}
            onMouseUp={(e) => {
                const start = marqueeStartRef.current;
                const wasDragging = isDraggingMarqueeRef.current;
                marqueeStartRef.current = null;
                isDraggingMarqueeRef.current = false;
                setMarqueeRect(null);

                // No tracked mousedown-on-empty-stage for this gesture (e.g. it
                // started on a shape instead) — nothing to decide here.
                if (!start) return;

                const stage = e.target.getStage();
                const pos = stage?.getRelativePointerPosition() ?? start;
                const dist = Math.hypot(pos.x - start.x, pos.y - start.y);

                if (!wasDragging || dist <= DRAG_THRESHOLD_PX / stageScale) {
                    // Plain click (≤4px of movement) on empty stage: clears the
                    // selection entirely, exactly like the old unconditional
                    // onMouseDown behavior did.
                    onClearSelection();
                    return;
                }

                // Marquee-drag: select every shape whose bounding box
                // intersects the drag rectangle, ADDED to whatever was already
                // selected (never replaces — chaining marquee-drags accumulates).
                const rect: RectBox = {
                    x: Math.min(start.x, pos.x),
                    y: Math.min(start.y, pos.y),
                    width: Math.abs(pos.x - start.x),
                    height: Math.abs(pos.y - start.y),
                };
                const hitIds = layers
                    .filter((layer) => {
                        const node = nodeRefs.current[layer.id];
                        if (!node) return false;
                        const box = node.getClientRect({ relativeTo: stage ?? undefined });
                        return rectsIntersect(rect, box);
                    })
                    .map((layer) => layer.id);
                if (hitIds.length > 0) onMarqueeSelect(hitIds);
            }}
        >
            <Layer>
                {/* Light "art board" background so imported art (often black-filled) stays
                    visible against the app's dark theme. Not interactive — clicks pass
                    through to the Stage's own handlers above. */}
                <Rect x={0} y={0} width={visibleWidth} height={visibleHeight} fill="#f0ebe3" listening={false} />
                {layers.map((layer) => {
                    const isSelected = selectedIds.includes(layer.id);
                    // Once a layer is assigned to a part, its shapes render in that
                    // part's configured color instead of their own fill — makes it
                    // obvious on the canvas which layers belong to which part.
                    // Unassigned layers (`partId: null`) keep their original
                    // per-shape fill exactly as before (e.g. black for text, or
                    // preserved per-path colors for imported multi-color SVGs).
                    const partColor = layer.partId ? partSettings[layer.partId]?.color : undefined;
                    return (
                        <Group
                            key={layer.id}
                            id={layer.id}
                            x={layer.transform.x}
                            y={layer.transform.y}
                            scaleX={layer.transform.scaleX}
                            scaleY={layer.transform.scaleY}
                            rotation={layer.transform.rotation}
                            draggable
                            ref={(node) => {
                                nodeRefs.current[layer.id] = node;
                            }}
                            onClick={(e) => onSelect(layer.id, { shift: e.evt.shiftKey })}
                            onTap={() => onSelect(layer.id)}
                            onDragStart={() => {
                                // Starting a drag on a shape that's already part of the
                                // current multi-selection keeps that selection intact
                                // (so dragging one of several selected shapes doesn't
                                // collapse the selection down to just it); otherwise it
                                // replaces the selection with just this shape, matching
                                // the original single-select click-to-drag behavior.
                                if (!isSelected) onSelect(layer.id);
                            }}
                            onDragEnd={(e) => {
                                onTransformChange(layer.id, { x: e.target.x(), y: e.target.y() });
                            }}
                            onTransform={(e) => {
                                // Fires on every frame of an in-progress resize drag, before
                                // release. `layer.width`/`layer.height` are the natural
                                // (pre-scale) size in mm (1 editor unit = 1mm, see
                                // serializePartToSvg.ts); the node's scaleX/scaleY are already
                                // live-updated by the Transformer mid-drag, so multiplying the
                                // two gives the current on-canvas mm size in real time.
                                const node = e.target;
                                onTransformPreview(layer.id, {
                                    width: layer.width * node.scaleX(),
                                    height: layer.height * node.scaleY(),
                                });
                            }}
                            onTransformEnd={(e) => {
                                const node = e.target;
                                onTransformChange(layer.id, {
                                    x: node.x(),
                                    y: node.y(),
                                    scaleX: node.scaleX(),
                                    scaleY: node.scaleY(),
                                    rotation: node.rotation(),
                                });
                                // Resize gesture finished — the committed transform above (via
                                // onTransformChange) is now the source of truth for size, so
                                // clear the in-progress preview rather than leaving it stale.
                                onTransformPreview(layer.id, null);
                            }}
                        >
                            {/* Text layers carry the same `shapes: ImagePathShape[]` shape as image
                                layers (see types/editor2d.ts) — rendered glyph outlines are just
                                paths like any imported SVG, so both variants share this one branch. */}
                            {(layer.type === 'image' || layer.type === 'text') &&
                                layer.shapes.map((shape, i) => (
                                    <Path
                                        key={i}
                                        data={shape.d}
                                        fill={partColor ?? shape.fill ?? undefined}
                                        stroke={shape.stroke ?? undefined}
                                        strokeWidth={shape.strokeWidth}
                                    />
                                ))}
                        </Group>
                    );
                })}
                {/* Non-interactive 256x256mm print bed (Bambu A1) reference guide, centered
                    in the visible stage area. Purely visual: never blocks placing/resizing
                    shapes beyond it, and never intercepts pointer events (listening={false}). */}
                <Rect
                    x={(visibleWidth - PRINT_BED_SIZE_MM) / 2}
                    y={(visibleHeight - PRINT_BED_SIZE_MM) / 2}
                    width={PRINT_BED_SIZE_MM}
                    height={PRINT_BED_SIZE_MM}
                    fill="transparent"
                    stroke="#9ca3af"
                    strokeWidth={1}
                    dash={[6, 4]}
                    listening={false}
                />
                <Transformer
                    ref={transformerRef}
                    rotateEnabled
                    boundBoxFunc={(oldBox, newBox) => {
                        // Prevent the user from resizing a layer down to nothing.
                        if (Math.abs(newBox.width) < MIN_SIZE_PX || Math.abs(newBox.height) < MIN_SIZE_PX) {
                            return oldBox;
                        }
                        return newBox;
                    }}
                />
                {marqueeRect && (
                    <Rect
                        x={marqueeRect.x}
                        y={marqueeRect.y}
                        width={marqueeRect.width}
                        height={marqueeRect.height}
                        fill="rgba(16, 185, 129, 0.12)"
                        stroke="#10b981"
                        strokeWidth={1}
                        listening={false}
                    />
                )}
            </Layer>
        </Stage>
    );
}
