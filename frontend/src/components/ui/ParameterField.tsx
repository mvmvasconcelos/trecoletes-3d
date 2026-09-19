import { BambuColorPicker } from './BambuColorPicker';
import { ParameterLabel } from './ParameterLabel';
import { FontPicker } from './FontPicker';

type Accent = 'violet' | 'emerald';

const ACCENT = {
    violet: { accent: 'accent-violet-500', text: 'text-violet-400', border: 'focus:border-violet-500' },
    emerald: { accent: 'accent-emerald-500', text: 'text-emerald-400', border: 'focus:border-emerald-500' },
} as const;

interface ParameterFieldProps {
    parameter: any;
    value: any;
    onChange: (id: string, value: any) => void;
    accent?: Accent;
    /** Nome do campo de extrusor associado, para parâmetros do tipo 'color'. Se omitido, é
     * inferido como 'extrusor_base' quando o id do parâmetro é 'base_color', senão 'extrusor_letras'. */
    extruderField?: string;
    extruderValue?: number;
    onExtruderChange?: (extruderField: string, value: number) => void;
}

/**
 * Renderiza um parâmetro de config.json de acordo com seu `type`. Extraído do
 * `renderParam` que estava duplicado (quase char-a-char) em cada página de modelo.
 */
export function ParameterField({
    parameter: p, value: val, onChange, accent = 'violet',
    extruderField, extruderValue, onExtruderChange,
}: ParameterFieldProps) {
    const c = ACCENT[accent];
    const inputClass = `w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm text-white ${c.border} focus:outline-none`;

    switch (p.type) {
        case 'text':
            return (
                <div key={p.id} className="space-y-1">
                    <label className="text-sm text-neutral-400">
                        <ParameterLabel name={p.name} helpText={p.help_text} />
                    </label>
                    <input
                        type="text" value={val} placeholder={p.placeholder ?? ''}
                        onChange={e => onChange(p.id, e.target.value)}
                        className={inputClass}
                    />
                </div>
            );
        case 'range':
            return (
                <div key={p.id} className="space-y-1">
                    <label className="flex justify-between text-sm">
                        <ParameterLabel name={p.name} helpText={p.help_text} className="text-neutral-400" />
                        <span className={`${c.text} font-mono`}>
                            {Number(val).toFixed(p.step < 1 ? 1 : 0)}{p.unit ? ` ${p.unit}` : ''}
                        </span>
                    </label>
                    <input
                        type="range" min={p.min} max={p.max} step={p.step} value={val}
                        onChange={e => onChange(p.id, parseFloat(e.target.value))}
                        className={`w-full ${c.accent}`}
                    />
                </div>
            );
        case 'color': {
            const extField = extruderField ?? (p.id === 'base_color' ? 'extrusor_base' : 'extrusor_letras');
            const extVal = extruderValue ?? (p.id === 'base_color' ? 1 : 4);
            return (
                <BambuColorPicker
                    key={p.id} label={p.name} helpText={p.help_text} color={val} extruder={extVal}
                    onChangeColor={(newCol) => onChange(p.id, newCol)}
                    onChangeExtruder={(newExt) => onExtruderChange?.(extField, newExt)}
                />
            );
        }
        case 'select':
            if (p.id === 'font_name') {
                return <FontPicker key={p.id} parameter={p} value={val} onChange={onChange} />;
            }
            return (
                <div key={p.id} className="space-y-1">
                    <label className="text-sm text-neutral-400">
                        <ParameterLabel name={p.name} helpText={p.help_text} />
                    </label>
                    <select
                        value={val} onChange={e => onChange(p.id, e.target.value)}
                        className={inputClass}
                    >
                        {p.options?.map((opt: any) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                </div>
            );
        case 'checkbox':
        case 'boolean':
            return (
                <div key={p.id} className="space-y-1">
                    <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={val === true || val === 'true'}
                            onChange={e => onChange(p.id, e.target.checked)}
                            className={`w-4 h-4 ${c.accent} cursor-pointer`}
                        />
                        <ParameterLabel name={p.name} helpText={p.help_text} className="text-sm text-neutral-400" />
                    </label>
                </div>
            );
        default:
            return null;
    }
}
