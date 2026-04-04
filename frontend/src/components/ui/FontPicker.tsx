import React from 'react';
import { ParameterLabel } from './ParameterLabel';
import { useGoogleFontsList } from '../../hooks/useGoogleFontsList';

interface FontPickerProps {
    parameter: any;
    value: string;
    onChange: (id: string, val: string) => void;
}

export function FontPicker({ parameter, value, onChange }: FontPickerProps) {
    const fontFamilies = (parameter.options || []).map((o: any) => o.value.split(':')[0]);
    useGoogleFontsList(fontFamilies);

    const currentFontFamily = value?.split(':')[0];

    return (
        <div className="space-y-1">
            <label className="text-sm text-neutral-400">
                <ParameterLabel name={parameter.name} helpText={parameter.help_text} />
            </label>
            <select
                value={value} 
                onChange={e => onChange(parameter.id, e.target.value)}
                className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-white focus:border-violet-500 focus:outline-none"
                style={{ fontFamily: currentFontFamily, fontSize: '1.05rem' }}
            >
                {parameter.options?.map((opt: any) => {
                    const family = opt.value.split(':')[0];
                    return (
                        <option 
                            key={opt.value} 
                            value={opt.value} 
                            style={{ fontFamily: family, fontSize: '1.1rem' }}
                        >
                            {opt.label}
                        </option>
                    );
                })}
            </select>
        </div>
    );
}
