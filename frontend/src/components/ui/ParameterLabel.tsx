import React from 'react';
import { HelpCircle } from 'lucide-react';

interface ParameterLabelProps {
    name: string;
    helpText?: string;
    className?: string;
}

export function ParameterLabel({ name, helpText, className = "" }: ParameterLabelProps) {
    if (!helpText) {
        return <span className={className}>{name}</span>;
    }

    return (
        <div className={`flex items-center gap-1.5 ${className}`}>
            <span>{name}</span>
            <div className="group relative flex items-center justify-center">
                <HelpCircle className="w-3.5 h-3.5 text-neutral-500 hover:text-emerald-400 cursor-help transition-colors" />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 p-2.5 bg-neutral-800 text-neutral-200 text-xs rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 text-center font-normal border border-neutral-700 leading-relaxed">
                    {helpText}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral-700 blur-[0.5px]"></div>
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral-800 -mt-[1px]"></div>
                </div>
            </div>
        </div>
    );
}
