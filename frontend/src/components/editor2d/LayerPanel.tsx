import { Image as ImageIcon, Trash2, Type as TypeIcon } from 'lucide-react';
import type { EditorLayer, PartId } from '../../types/editor2d';

interface LayerPanelProps {
    layers: EditorLayer[];
    selectedId: string | null;
    onSelect: (id: string) => void;
    onDelete: (id: string) => void;
    /** Assigns (or clears, via `null`) which part the given layer belongs to. */
    onAssignPart: (id: string, partId: PartId | null) => void;
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

export function LayerPanel({ layers, selectedId, onSelect, onDelete, onAssignPart }: LayerPanelProps) {
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

    return (
        <ul className="space-y-1">
            {orderedLayers.map((layer) => {
                const isSelected = layer.id === selectedId;
                // Text layers show their content instead of the generic "Texto N" name,
                // so the list is actually useful for telling several text layers apart.
                const label = layer.type === 'text' ? `Texto: ${layer.text || '(vazio)'}` : layer.name;
                const Icon = layer.type === 'text' ? TypeIcon : ImageIcon;
                return (
                    <li key={layer.id}>
                        <div
                            role="button"
                            tabIndex={0}
                            onClick={() => onSelect(layer.id)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') onSelect(layer.id);
                            }}
                            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer border transition-colors ${
                                isSelected
                                    ? 'bg-emerald-950/50 border-emerald-700 text-emerald-300'
                                    : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:border-neutral-700'
                            }`}
                        >
                            <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="flex-1 text-sm truncate">{label}</span>
                            {/* Secondary action, kept visually small so it doesn't compete
                                with click-to-select as the primary interaction. */}
                            <select
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
                    </li>
                );
            })}
        </ul>
    );
}
