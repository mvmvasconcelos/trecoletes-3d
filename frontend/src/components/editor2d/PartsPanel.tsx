import { BambuColorPicker } from '../ui/BambuColorPicker';
import type { PartId } from '../../types/editor2d';
import type { PartGroup } from '../../lib/partGrouping';
import type { PartSettingsMap } from '../../lib/partSettings';

const PART_LABELS: Record<PartId, string> = {
    part_1: 'Parte 1',
    part_2: 'Parte 2',
    part_3: 'Parte 3',
    part_4: 'Parte 4',
};

interface PartsPanelProps {
    partGroups: PartGroup[];
    settings: PartSettingsMap;
    onChangeHeight: (partId: PartId, height: number) => void;
    onChangeColor: (partId: PartId, color: string) => void;
    onChangeExtruder: (partId: PartId, extruder: number) => void;
}

/**
 * Always-visible per-part generation settings (Group 7): for every `PartGroup`
 * that currently has >=1 layer assigned (from lib/partGrouping.ts), shows a
 * height input and a color/extruder picker. Never gated behind a "Generate"
 * click — visible as soon as `partGroups` has an entry, so height/color changes
 * are ready before the first "Gerar 3D".
 */
export function PartsPanel({ partGroups, settings, onChangeHeight, onChangeColor, onChangeExtruder }: PartsPanelProps) {
    if (partGroups.length === 0) {
        return (
            <p className="text-sm text-neutral-600">
                Atribua camadas a uma parte (menu na lista de camadas) para configurar espessura e cor.
            </p>
        );
    }

    return (
        <div className="space-y-3">
            {partGroups.map((group) => {
                const s = settings[group.partId];
                return (
                    <div key={group.partId} className="border border-neutral-800 rounded-lg">
                        <div className="flex items-center gap-2 px-3 py-2.5 bg-neutral-900 rounded-t-lg">
                            <span className="text-xs font-semibold text-neutral-400 uppercase tracking-widest flex-1">
                                {PART_LABELS[group.partId]}
                            </span>
                            <span className="text-[11px] text-neutral-600">
                                {group.layers.length} camada{group.layers.length === 1 ? '' : 's'}
                            </span>
                        </div>
                        <div className="px-3 pb-3 pt-2 space-y-3 bg-neutral-950 rounded-b-lg">
                            <label className="flex items-center justify-between gap-2 text-sm text-neutral-400">
                                Espessura (mm)
                                <input
                                    type="number"
                                    min={0.2}
                                    max={20}
                                    step={0.1}
                                    value={s.height}
                                    onChange={(e) => onChangeHeight(group.partId, Number(e.target.value) || 0.2)}
                                    className="w-20 bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1 text-sm text-neutral-200 focus:outline-none focus:border-emerald-600"
                                />
                            </label>
                            <BambuColorPicker
                                label="Cor"
                                color={s.color}
                                extruder={s.extruder}
                                onChangeColor={(val) => onChangeColor(group.partId, val)}
                                onChangeExtruder={(val) => onChangeExtruder(group.partId, val)}
                            />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
