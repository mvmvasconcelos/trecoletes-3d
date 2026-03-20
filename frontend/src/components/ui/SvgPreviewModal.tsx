import React, { useState } from 'react';
import { processSvgFile } from '../../svgProcessor';

export function SvgPreviewModal({
    isOpen,
    onClose,
    onConfirm,
    onLoadAnother,
    svgText,
    initialThickness
}: {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (processed: any, thickness: number) => void;
    onLoadAnother: () => void;
    svgText: string | null;
    initialThickness: number;
}) {
    const [thickness, setThickness] = useState(initialThickness);
    const [preview, setPreview] = useState<any>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [preserveFill, setPreserveFill] = useState(true);

    React.useEffect(() => {
        if (!isOpen || !svgText) return;
        let isActive = true;
        const process = async () => {
            setIsProcessing(true);
            try {
                const res = await processSvgFile(svgText, thickness, 3.0, preserveFill);
                if (isActive) setPreview(res);
            } catch (err) {
                console.error(err);
            } finally {
                if (isActive) setIsProcessing(false);
            }
        };
        const timeoutId = setTimeout(process, 100);
        return () => { isActive = false; clearTimeout(timeoutId); };
    }, [svgText, thickness, isOpen, preserveFill]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl w-full max-w-4xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="flex justify-between items-center p-4 border-b border-neutral-800 bg-neutral-950">
                    <h2 className="text-lg font-bold text-neutral-200 tracking-wider">PRÉ-VISUALIZAÇÃO SVG</h2>
                    <button onClick={onClose} className="text-neutral-500 hover:text-white transition-colors">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="p-6 space-y-4 flex-1 overflow-y-auto">
                    <div className="flex items-center gap-6 flex-wrap">
                        <div className="flex-1 space-y-2 min-w-48">
                            <label className="flex justify-between text-sm font-medium text-neutral-400">
                                <span>Engrossar Linhas: <span className="text-emerald-400">{thickness.toFixed(1)}px</span></span>
                            </label>
                            <input type="range" min="0" max="5" step="0.1" value={thickness} onChange={e => setThickness(parseFloat(e.target.value))} className="w-full accent-emerald-500" />
                        </div>
                        <button
                            onClick={() => setPreserveFill(p => !p)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${preserveFill
                                ? 'bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-900/40'
                                : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:border-neutral-500'
                                }`}
                        >
                            <span className={`w-3 h-3 rounded-full border-2 transition-colors ${preserveFill ? 'bg-white border-white' : 'border-neutral-500'}`} />
                            Manter Preenchimento
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-3">
                            <h3 className="text-center text-sm font-semibold text-neutral-400">SVG Original</h3>
                            <div className="rounded-lg p-2 h-56 flex items-center justify-center overflow-hidden" style={{ backgroundColor: '#f0ebe3' }}>
                                {preview ? <div dangerouslySetInnerHTML={{ __html: preview.originalSvg }} className="w-full h-full [&>svg]:max-w-full [&>svg]:max-h-full [&>svg]:object-contain" /> : <span className="text-neutral-600 animate-pulse">Processando...</span>}
                            </div>
                        </div>
                        <div className="space-y-3 relative">
                            <div className="absolute top-1/2 -left-3 -translate-y-1/2 w-6 h-6 bg-neutral-800 rounded-full flex items-center justify-center text-neutral-400 z-10 border border-neutral-700">
                                →
                            </div>
                            <h3 className="text-center text-sm font-semibold text-neutral-400">SVG Engrossado</h3>
                            <div className="rounded-lg p-2 h-56 flex items-center justify-center overflow-hidden" style={{ backgroundColor: '#f0ebe3' }}>
                                {preview ? <div dangerouslySetInnerHTML={{ __html: preview.thickenedSvg }} className="w-full h-full [&>svg]:max-w-full [&>svg]:max-h-full [&>svg]:object-contain" /> : <span className="text-neutral-600 animate-pulse">Processando...</span>}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t border-neutral-800 bg-neutral-950 flex justify-between items-center gap-3">
                    <button
                        onClick={onLoadAnother}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200 text-sm font-medium transition-colors border border-neutral-700"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                        Carregar outro arquivo
                    </button>
                    <div className="flex gap-3">
                        <button onClick={onClose} className="px-5 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-medium transition-colors">
                            Cancelar
                        </button>
                        <button
                            onClick={() => onConfirm(preview, thickness)}
                            disabled={isProcessing || !preview}
                            className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-lg shadow-emerald-900/50 transition-colors disabled:opacity-50"
                        >
                            Confirmar e Enviar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
