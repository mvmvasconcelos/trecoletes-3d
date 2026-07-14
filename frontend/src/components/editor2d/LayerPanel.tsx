import { useState } from 'react';
import { GripVertical, Image as ImageIcon, Trash2, Type as TypeIcon } from 'lucide-react';
import { BambuColorPicker } from '../ui/BambuColorPicker';
import type { EditorLayer, PartId } from '../../types/editor2d';
import type { PartSettingsMap } from '../../lib/partSettings';

interface LayerPanelProps {
    layers: EditorLayer[];
    selectedIds: string[];
    onSelect: (id: string) => void;
    onDelete: (id: string) => void;
    /** Assigns (or clears, via `null`) which part the given layer belongs to. */
    onAssignPart: (id: string, partId: PartId | null) => void;
    /**
     * Reorders a layer within the underlying `layers` array (z-index order,
     * index 0 = back-most). Indices are already translated from the
     * reversed, on-screen list order to real `layers`-array indices — callers
     * can treat this as a plain array move (splice out `fromIndex`, splice
     * back in at `toIndex`) with no knowledge of the list being reversed.
     */
    onReorder: (fromIndex: number, toIndex: number) => void;
    /** Per-part height/color/extruder settings (only `.color`/`.extruder` are
     * read here — height stays configured in PartsPanel.tsx). Color/extruder
     * moved here (from PartsPanel) so it sits next to the part assignment
     * itself: every layer belonging to a part shares that part's color, so
     * editing it from any one of that part's layer rows updates all of them. */
    partSettings: PartSettingsMap;
    onChangeColor: (partId: PartId, color: string) => void;
    onChangeExtruder: (partId: PartId, extruder: number) => void;
}

// Fixed, hardcoded set of part options — intentionally NOT derived from
// anything that could grow, so the UI can never offer a 5th part.
const PART_OPTIONS: { value: PartId | ''; label: string }[] = [
    { value: '', label: 'Sem parte' },
    { value: 'part_1', label: 'Parte 1' },
    { value: 'part_2', label: 'Parte 2' },
    { value: 'part_3', label: 'Parte 3' },
    { value: 'part_4', label: 'Parte 4' },
];

export function LayerPanel({
    layers,
    selectedIds,
    onSelect,
    onDelete,
    onAssignPart,
    onReorder,
    partSettings,
    onChangeColor,
    onChangeExtruder,
}: LayerPanelProps) {
    // Index (in the RENDERED/reversed list, not the real `layers` array) of
    // the row currently being dragged. `null` when no drag is in progress.
    const [dragRenderedIndex, setDragRenderedIndex] = useState<number | null>(null);
    // Row currently under the pointer during a drag, used purely for the
    // drop-target highlight — doesn't affect the eventual reorder math.
    const [dragOverRenderedIndex, setDragOverRenderedIndex] = useState<number | null>(null);

    if (layers.length === 0) {
        return (
            <p className="text-sm text-neutral-600">
                Nenhuma camada ainda. Faça upload de um SVG ou PNG para começar.
            </p>
        );
    }

    // Render top-of-stack first (last added / rendered on top in Konva) so the list
    // visually matches the canvas stacking order, like most layer panels.
    const orderedLayers = [...layers].reverse();

    // The rendered list is `layers` reversed, so a rendered index doesn't
    // line up with the real array index the layer lives at. For a reversed
    // array of length N, rendered index i corresponds to real index N-1-i.
    const toRealIndex = (renderedIndex: number) => layers.length - 1 - renderedIndex;

    const handleDrop = (targetRenderedIndex: number) => {
        if (dragRenderedIndex === null || dragRenderedIndex === targetRenderedIndex) {
            setDragRenderedIndex(null);
            setDragOverRenderedIndex(null);
            return;
        }
        onReorder(toRealIndex(dragRenderedIndex), toRealIndex(targetRenderedIndex));
        setDragRenderedIndex(null);
        setDragOverRenderedIndex(null);
    };

    return (
        <ul className="space-y-1">
            {orderedLayers.map((layer, renderedIndex) => {
                const isSelected = selectedIds.includes(layer.id);
                // Text layers show their content instead of the generic "Texto N" name,
                // so the list is actually useful for telling several text layers apart.
                const label = layer.type === 'text' ? `Texto: ${layer.text || '(vazio)'}` : layer.name;
                const Icon = layer.type === 'text' ? TypeIcon : ImageIcon;
                return (
                    <li key={layer.id}>
                        <div
                            role="button"
                            tabIndex={0}
                            draggable
                            onDragStart={(e) => {
                                setDragRenderedIndex(renderedIndex);
                                // Needed for Firefox to allow the drag to start.
                                e.dataTransfer.effectAllowed = 'move';
                            }}
                            onDragOver={(e) => {
                                e.preventDefault();
                                e.dataTransfer.dropEffect = 'move';
                                if (dragOverRenderedIndex !== renderedIndex) setDragOverRenderedIndex(renderedIndex);
                            }}
                            onDragLeave={() => {
                                setDragOverRenderedIndex((prev) => (prev === renderedIndex ? null : prev));
                            }}
                            onDrop={(e) => {
                                e.preventDefault();
                                handleDrop(renderedIndex);
                            }}
                            onDragEnd={() => {
                                setDragRenderedIndex(null);
                                setDragOverRenderedIndex(null);
                            }}
                            onClick={() => onSelect(layer.id)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') onSelect(layer.id);
                            }}
                            className={`w-full flex flex-col px-3 py-2 rounded-lg cursor-pointer border transition-colors ${
                                isSelected
                                    ? 'bg-emerald-950/50 border-emerald-700 text-emerald-300'
                                    : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:border-neutral-700'
                            } ${
                                dragOverRenderedIndex === renderedIndex && dragRenderedIndex !== renderedIndex
                                    ? 'border-t-2 border-t-emerald-500'
                                    : ''
                            } ${dragRenderedIndex === renderedIndex ? 'opacity-50' : ''}`}
                        >
                            <div className="flex items-center gap-2 w-full">
                                <GripVertical
                                    className="w-3.5 h-3.5 flex-shrink-0 text-neutral-600 cursor-grab active:cursor-grabbing"
                                    aria-hidden="true"
                                />
                                <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                                <span className="flex-1 text-sm truncate">{label}</span>
                                {/* Secondary action, kept visually small so it doesn't compete
                                    with click-to-select as the primary interaction. */}
                                <select
                                    draggable={false}
                                    value={layer.partId ?? ''}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => {
                                        const value = e.target.value as PartId | '';
                                        onAssignPart(layer.id, value === '' ? null : value);
                                    }}
                                    aria-label={`Parte de ${label}`}
                                    className="flex-shrink-0 bg-neutral-950 border border-neutral-800 rounded px-1 py-0.5 text-[11px] text-neutral-400 focus:outline-none focus:border-emerald-600"
                                >
                                    {PART_OPTIONS.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    draggable={false}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDelete(layer.id);
                                    }}
                                    className="text-neutral-500 hover:text-red-400 transition-colors flex-shrink-0"
                                    aria-label={`Excluir ${label}`}
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                            {/* Color/extruder for the layer's assigned part — several layers
                                can share a part, so editing it here updates all of them
                                (same underlying PartSettingsMap entry as PartsPanel.tsx).
                                `draggable={false}` opts this whole subtree (BambuColorPicker's
                                swatch/dropdown/extruder input) out of the row's own native
                                HTML5 drag — without it, a mousedown-with-slight-movement on any
                                of those controls (e.g. selecting text in the extruder input)
                                could be captured as the start of a row drag instead. */}
                            {layer.partId && (
                                <div className="mt-2 pl-6 w-full" draggable={false} onClick={(e) => e.stopPropagation()}>
                                    <BambuColorPicker
                                        label="Cor"
                                        color={partSettings[layer.partId].color}
                                        extruder={partSettings[layer.partId].extruder}
                                        onChangeColor={(val) => onChangeColor(layer.partId as PartId, val)}
                                        onChangeExtruder={(val) => onChangeExtruder(layer.partId as PartId, val)}
                                    />
                                </div>
                            )}
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}
