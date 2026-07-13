/**
 * Per-part height/color/extruder generation settings (Group 7), keyed by
 * `PartId`. Lives separately from components/editor2d/PartsPanel.tsx (which
 * renders this data) so that file can stay a component-only module.
 */
import type { PartId } from '../types/editor2d';

export interface PartSettings {
    height: number;
    color: string;
    extruder: number;
}

export type PartSettingsMap = Record<PartId, PartSettings>;

/**
 * Default settings for a part: 2mm tall, white, extruder matching the part
 * number — mirrors bambu_parts_config.json's own defaults (part_1→1 ..
 * part_4→4), so the FIRST "Gerar 3D" click works without the user touching
 * anything.
 */
export function defaultPartSettings(partId: PartId): PartSettings {
    const n = Number(partId.split('_')[1]);
    return { height: 2, color: '#FFFFFF', extruder: n };
}

export function createDefaultPartSettingsMap(): PartSettingsMap {
    return {
        part_1: defaultPartSettings('part_1'),
        part_2: defaultPartSettings('part_2'),
        part_3: defaultPartSettings('part_3'),
        part_4: defaultPartSettings('part_4'),
    };
}
