import {
    AlignHorizontalJustifyStart,
    AlignHorizontalJustifyCenter,
    AlignHorizontalJustifyEnd,
    AlignHorizontalDistributeCenter,
    AlignVerticalJustifyStart,
    AlignVerticalJustifyCenter,
    AlignVerticalJustifyEnd,
    AlignVerticalDistributeCenter,
} from 'lucide-react';
import type { ComponentType } from 'react';
import type { EditorLayer, LayerTransform } from '../../types/editor2d';

interface AlignmentToolbarProps {
    layers: EditorLayer[];
    selectedIds: string[];
    /** Reuses the same transform-update path drag/transform already goes
     * through (see Editor2D.tsx's `updateLayerTransform`) — no parallel state path. */
    onTransformChange: (id: string, transform: Partial<LayerTransform>) => void;
}

interface LayerBox {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

// Axis-aligned bounding box of a layer's UNROTATED extents — deliberately
// ignores `transform.rotation` entirely, per spec: aligning by a rotated
// shape's true (rotated) AABB would make "align left" jump edges around
// unpredictably as a shape's rotation changes. `width`/`height` are each
// layer's natural pre-scale size (types/editor2d.ts), so scale is the only
// thing applied on top of the layer's local origin at `transform.x/y`.
function getUnrotatedBBox(layer: EditorLayer): LayerBox {
    return {
        id: layer.id,
        x: layer.transform.x,
        y: layer.transform.y,
        width: Math.abs(layer.width * layer.transform.scaleX),
        height: Math.abs(layer.height * layer.transform.scaleY),
    };
}

type TransformUpdates = Map<string, Partial<LayerTransform>>;
type AlignFn = (boxes: LayerBox[]) => TransformUpdates;

const alignLeft: AlignFn = (boxes) => {
    const minX = Math.min(...boxes.map((b) => b.x));
    return new Map(boxes.map((b) => [b.id, { x: minX }]));
};

const alignRight: AlignFn = (boxes) => {
    const maxRight = Math.max(...boxes.map((b) => b.x + b.width));
    return new Map(boxes.map((b) => [b.id, { x: maxRight - b.width }]));
};

const alignCenterH: AlignFn = (boxes) => {
    const minX = Math.min(...boxes.map((b) => b.x));
    const maxRight = Math.max(...boxes.map((b) => b.x + b.width));
    const centerX = (minX + maxRight) / 2;
    return new Map(boxes.map((b) => [b.id, { x: centerX - b.width / 2 }]));
};

const alignTop: AlignFn = (boxes) => {
    const minY = Math.min(...boxes.map((b) => b.y));
    return new Map(boxes.map((b) => [b.id, { y: minY }]));
};

const alignBottom: AlignFn = (boxes) => {
    const maxBottom = Math.max(...boxes.map((b) => b.y + b.height));
    return new Map(boxes.map((b) => [b.id, { y: maxBottom - b.height }]));
};

const alignCenterV: AlignFn = (boxes) => {
    const minY = Math.min(...boxes.map((b) => b.y));
    const maxBottom = Math.max(...boxes.map((b) => b.y + b.height));
    const centerY = (minY + maxBottom) / 2;
    return new Map(boxes.map((b) => [b.id, { y: centerY - b.height / 2 }]));
};

// Evenly spaces the CENTERS of 3+ boxes between the leftmost/topmost and
// rightmost/bottommost box's centers, keeping those two extremes fixed. A
// no-op (empty map) for fewer than 3 boxes — nothing meaningful to
// distribute between exactly two shapes.
const distributeH: AlignFn = (boxes) => {
    if (boxes.length < 3) return new Map();
    const sorted = [...boxes].sort((a, b) => a.x + a.width / 2 - (b.x + b.width / 2));
    const firstCenter = sorted[0].x + sorted[0].width / 2;
    const lastCenter = sorted[sorted.length - 1].x + sorted[sorted.length - 1].width / 2;
    const step = (lastCenter - firstCenter) / (sorted.length - 1);
    const result: TransformUpdates = new Map();
    sorted.forEach((b, i) => {
        if (i === 0 || i === sorted.length - 1) return;
        const centerX = firstCenter + step * i;
        result.set(b.id, { x: centerX - b.width / 2 });
    });
    return result;
};

const distributeV: AlignFn = (boxes) => {
    if (boxes.length < 3) return new Map();
    const sorted = [...boxes].sort((a, b) => a.y + a.height / 2 - (b.y + b.height / 2));
    const firstCenter = sorted[0].y + sorted[0].height / 2;
    const lastCenter = sorted[sorted.length - 1].y + sorted[sorted.length - 1].height / 2;
    const step = (lastCenter - firstCenter) / (sorted.length - 1);
    const result: TransformUpdates = new Map();
    sorted.forEach((b, i) => {
        if (i === 0 || i === sorted.length - 1) return;
        const centerY = firstCenter + step * i;
        result.set(b.id, { y: centerY - b.height / 2 });
    });
    return result;
};

interface AlignButtonSpec {
    key: string;
    icon: ComponentType<{ className?: string }>;
    label: string;
    fn: AlignFn;
    isDistribute?: boolean;
}

const H_BUTTONS: AlignButtonSpec[] = [
    { key: 'left', icon: AlignHorizontalJustifyStart, label: 'Alinhar à esquerda', fn: alignLeft },
    { key: 'center-h', icon: AlignHorizontalJustifyCenter, label: 'Centralizar horizontalmente', fn: alignCenterH },
    { key: 'right', icon: AlignHorizontalJustifyEnd, label: 'Alinhar à direita', fn: alignRight },
    { key: 'distribute-h', icon: AlignHorizontalDistributeCenter, label: 'Distribuir horizontalmente', fn: distributeH, isDistribute: true },
];

const V_BUTTONS: AlignButtonSpec[] = [
    { key: 'top', icon: AlignVerticalJustifyStart, label: 'Alinhar ao topo', fn: alignTop },
    { key: 'center-v', icon: AlignVerticalJustifyCenter, label: 'Centralizar verticalmente', fn: alignCenterV },
    { key: 'bottom', icon: AlignVerticalJustifyEnd, label: 'Alinhar à base', fn: alignBottom },
    { key: 'distribute-v', icon: AlignVerticalDistributeCenter, label: 'Distribuir verticalmente', fn: distributeV, isDistribute: true },
];

/**
 * Alignment toolbar for 2+ selected layers (Group 5, multi-select). Follows
 * the small-focused-panel pattern of PartsPanel.tsx in this directory.
 * Operates purely on each layer's axis-aligned, UNROTATED bounding box (see
 * getUnrotatedBBox) and writes results back through the same
 * `onTransformChange` prop drag/transform already uses — no parallel state path.
 */
export function AlignmentToolbar({ layers, selectedIds, onTransformChange }: AlignmentToolbarProps) {
    if (selectedIds.length < 2) return null;

    const boxes = selectedIds
        .map((id) => layers.find((l) => l.id === id))
        .filter((l): l is EditorLayer => l != null)
        .map(getUnrotatedBBox);

    if (boxes.length < 2) return null;

    const handleAlign = (fn: AlignFn) => {
        const updates = fn(boxes);
        updates.forEach((partial, id) => onTransformChange(id, partial));
    };

    const renderButton = ({ key, icon: Icon, label, fn, isDistribute }: AlignButtonSpec) => {
        const disabled = Boolean(isDistribute) && boxes.length < 3;
        return (
            <button
                key={key}
                type="button"
                title={label}
                aria-label={label}
                disabled={disabled}
                onClick={() => handleAlign(fn)}
                className="p-1.5 rounded text-neutral-400 hover:text-emerald-400 hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
            >
                <Icon className="w-4 h-4" />
            </button>
        );
    };

    return (
        <div className="flex items-center gap-1 px-2 py-1.5 bg-neutral-900 border border-neutral-800 rounded-lg w-fit">
            {H_BUTTONS.map(renderButton)}
            <div className="w-px h-5 bg-neutral-800 mx-1" />
            {V_BUTTONS.map(renderButton)}
        </div>
    );
}
