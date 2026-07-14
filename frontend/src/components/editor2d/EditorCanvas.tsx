import { useEffect, useRef } from 'react';
import Konva from 'konva';
import { Stage, Layer, Group, Path, Rect, Transformer } from 'react-konva';
import type { EditorLayer, LayerTransform } from '../../types/editor2d';

interface EditorCanvasProps {
    layers: EditorLayer[];
    selectedId: string | null;
    onSelect: (id: string | null) => void;
    onTransformChange: (id: string, transform: Partial<LayerTransform>) => void;
    width: number;
    height: number;
}

const MIN_SIZE_PX = 5;

export function EditorCanvas({ layers, selectedId, onSelect, onTransformChange, width, height }: EditorCanvasProps) {
    const transformerRef = useRef<Konva.Transformer>(null);
    const nodeRefs = useRef<Record<string, Konva.Group | null>>({});

    // Keep the Transformer attached to whichever Konva node backs the selected layer.
    // Standard react-konva pattern: the Transformer isn't a child of the shape, it's a
    // sibling that gets pointed at the live node via `.nodes([...])`.
    useEffect(() => {
        const transformer = transformerRef.current;
        if (!transformer) return;
        const selectedNode = selectedId ? nodeRefs.current[selectedId] : null;
        transformer.nodes(selectedNode ? [selectedNode] : []);
        transformer.getLayer()?.batchDraw();
    }, [selectedId, layers]);

    return (
        <Stage
            width={width}
            height={height}
            onMouseDown={(e) => {
                // Clicking empty stage area (not a shape) clears the selection.
                if (e.target === e.target.getStage()) onSelect(null);
            }}
        >
            <Layer>
                {/* Light "art board" background so imported art (often black-filled) stays
                    visible against the app's dark theme. Not interactive — clicks pass
                    through to the Stage's own onMouseDown, which clears the selection. */}
                <Rect x={0} y={0} width={width} height={height} fill="#f0ebe3" listening={false} />
                {layers.map((layer) => (
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
                        onClick={() => onSelect(layer.id)}
                        onTap={() => onSelect(layer.id)}
                        onDragStart={() => onSelect(layer.id)}
                        onDragEnd={(e) => {
                            onTransformChange(layer.id, { x: e.target.x(), y: e.target.y() });
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
                                    fill={shape.fill ?? undefined}
                                    stroke={shape.stroke ?? undefined}
                                    strokeWidth={shape.strokeWidth}
                                />
                            ))}
                    </Group>
                ))}
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
            </Layer>
        </Stage>
    );
}
