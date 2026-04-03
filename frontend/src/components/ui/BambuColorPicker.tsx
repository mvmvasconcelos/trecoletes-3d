import React, { useState, useRef } from 'react';
import { ParameterLabel } from './ParameterLabel';

const BAMBU_COLORS = [
    { label: 'Branco', hex: '#FFFFFF' },
    { label: 'Preto', hex: '#000000' },
    { label: 'Azul', hex: '#1B40D1' },
    { label: 'Verde', hex: '#00C853' },
    { label: 'Vermelho', hex: '#F44336' },
    { label: 'Amarelo', hex: '#FFEB3B' },
    { label: 'Cinza', hex: '#9E9E9E' },
    { label: 'Marrom', hex: '#795548' },
];

export function BambuColorPicker({
    label,
    color,
    extruder,
    helpText,
    onChangeColor,
    onChangeExtruder
}: {
    label: string;
    color: string;
    extruder: number;
    helpText?: string;
    onChangeColor: (val: string) => void;
    onChangeExtruder: (val: number) => void;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectedColor = BAMBU_COLORS.find(c => c.hex.toLowerCase() === String(color).toLowerCase()) || BAMBU_COLORS[0];

    return (
        <div className="flex items-center justify-between gap-4">
            <label className="text-sm text-neutral-400 flex-1">
                <ParameterLabel name={label} helpText={helpText} />
            </label>

            <div className="flex items-center gap-3">
                {/* Color Dropdown */}
                <div className={`relative ${isOpen ? 'z-50' : ''}`} ref={dropdownRef}>
                    <button
                        type="button"
                        onClick={() => setIsOpen(!isOpen)}
                        className="flex items-center p-1 border border-transparent hover:border-neutral-700 rounded transition-colors"
                    >
                        <div className="w-8 h-8 rounded-sm shadow-inner" style={{ backgroundColor: selectedColor.hex }} />
                    </button>

                    {isOpen && (
                        <div className="absolute z-50 top-full right-0 mt-1 p-2 bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl grid gap-1 min-w-[140px]">
                            {BAMBU_COLORS.map(c => (
                                <button
                                    key={c.hex}
                                    type="button"
                                    onClick={() => {
                                        onChangeColor(c.hex);
                                        setIsOpen(false);
                                    }}
                                    className="flex items-center gap-3 px-2 py-1.5 hover:bg-neutral-800 rounded transition-colors text-left"
                                >
                                    <div className="w-5 h-5 rounded-sm shadow-inner shrink-0" style={{ backgroundColor: c.hex }} />
                                    <span className="text-xs text-neutral-300 font-medium flex-1">{c.label}</span>
                                    {c.hex.toLowerCase() === String(color).toLowerCase() && (
                                        <svg className="w-4 h-4 ml-auto text-violet-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Extruder input */}
                <div className="flex flex-col items-center">
                    <label className="text-[10px] font-bold text-neutral-500 mb-0.5 uppercase tracking-widest">#</label>
                    <input
                        type="text"
                        value={extruder}
                        onChange={(e) => {
                            const val = e.target.value;
                            if (val === '') {
                                onChangeExtruder(1);
                                return;
                            }
                            const num = parseInt(val);
                            if (!isNaN(num) && num >= 1 && num <= 5) {
                                onChangeExtruder(num);
                            }
                        }}
                        className="w-10 bg-neutral-800 border border-neutral-700 rounded px-1.5 py-1 text-sm text-center text-white focus:border-violet-500 focus:outline-none placeholder-neutral-600"
                        placeholder="1"
                    />
                </div>
            </div>
        </div>
    );
}
