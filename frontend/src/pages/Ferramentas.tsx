import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Sliders } from 'lucide-react';
import { Layout } from '../components/ui/Layout';
import Viewer3D from '../components/ui/Viewer3D';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

async function downloadBlob(url: string, filename: string) {
    const res = await fetch(url);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(blobUrl);
}

export default function Ferramentas() {
    const [holes, setHoles] = useState<number[]>([5, 5.2]);
    const [margin, setMargin] = useState(2);
    const [holeType, setHoleType] = useState<'CIRCLE' | 'HEXAGON'>('CIRCLE');
    const [isGenerating, setIsGenerating] = useState(false);
    const [modelUrl, setModelUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        axios.get(`${API_BASE}/api/models/test_holes_vertical/config`)
            .then(res => {
                const params: any[] = res.data?.parameters ?? [];
                params.forEach((p: any) => {
                    if (p.id === 'holes' && Array.isArray(p.default)) setHoles(p.default);
                    if (p.id === 'margin') setMargin(Number(p.default));
                    if (p.id === 'hole_type' && (p.default === 'CIRCLE' || p.default === 'HEXAGON')) {
                        setHoleType(p.default);
                    }
                });
            })
            .catch(() => { });
    }, []);

    const toCutDiameter = (raw: number) => (holeType === 'HEXAGON' ? (raw * 2) / Math.sqrt(3) : raw);
    const holeCutDs = holes.map(toCutDiameter);
    const maxD = holeCutDs.length > 0 ? Math.max(...holeCutDs) : 0;
    const sumD = holeCutDs.reduce((s, v) => s + v, 0);
    const dimW = sumD + margin * (holes.length + 1);
    const dimD = 15;
    const dimH = maxD + margin * 2;

    const addHole = () => setHoles(prev => [...prev, 5]);
    const removeHole = (i: number) => setHoles(prev => prev.filter((_, idx) => idx !== i));
    const updateHole = (i: number, val: number) => setHoles(prev => prev.map((v, idx) => (idx === i ? val : v)));

    const handleGenerate = async () => {
        if (holes.length === 0) return;
        setIsGenerating(true);
        setError(null);
        setModelUrl(null);
        try {
            const form = new FormData();
            form.append('holes', `[${holes.join(', ')}]`);
            form.append('margin', String(margin));
            form.append('hole_type', holeType);
            const res = await axios.post(`${API_BASE}/api/generate_parametric/test_holes_vertical`, form);
            if (res.data?.files?.model) {
                setModelUrl(`${API_BASE}${res.data.files.model}`);
            }
        } catch (err: any) {
            setError(err?.response?.data?.error ?? 'Erro desconhecido');
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <Layout title="Ferramentas (Testes)">
            <aside className="w-80 flex-shrink-0 bg-neutral-950 border-r border-neutral-800 flex flex-col overflow-y-auto">
                <div className="p-4 space-y-6 flex-1">
                    <div className="space-y-3">
                        <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                            <Sliders className="w-4 h-4" /> Furos a testar
                        </h2>
                        <p className="text-xs text-neutral-500">
                            {holeType === 'HEXAGON'
                                ? 'No modo hexágono, o valor é lado a lado (flat-to-flat).'
                                : 'No modo círculo, o valor é o diâmetro do furo.'}
                        </p>

                        <div className="space-y-2">
                            <label className="block text-sm text-neutral-300">Formato do furo</label>
                            <select
                                value={holeType}
                                onChange={e => setHoleType(e.target.value as 'CIRCLE' | 'HEXAGON')}
                                className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white focus:border-amber-500 focus:outline-none"
                            >
                                <option value="CIRCLE">Círculo</option>
                                <option value="HEXAGON">Hexágono</option>
                            </select>
                        </div>

                        <div className="space-y-2">
                            {holes.map((d, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <span className="text-xs text-neutral-600 w-4 text-right">{i + 1}.</span>
                                    <input
                                        type="number" min={1} max={13} step={0.1} value={d}
                                        onChange={e => updateHole(i, parseFloat(e.target.value) || 1)}
                                        className="flex-1 bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white focus:border-amber-500 focus:outline-none"
                                    />
                                    <span className="text-xs text-neutral-500">mm</span>
                                    <button
                                        onClick={() => removeHole(i)} disabled={holes.length <= 1}
                                        className="text-neutral-600 hover:text-red-400 transition-colors disabled:opacity-30" title="Remover furo"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={addHole}
                            className="w-full py-2 rounded-lg border border-dashed border-neutral-700 hover:border-amber-500 text-neutral-500 hover:text-amber-400 text-sm transition-colors"
                        >
                            + Adicionar furo
                        </button>
                    </div>

                    <div className="space-y-2">
                        <label className="flex justify-between text-sm">
                            <span>Margem</span>
                            <span className="text-amber-400 font-mono">{margin.toFixed(1)} mm</span>
                        </label>
                        <input
                            type="range" min={1} max={5} step={0.5} value={margin}
                            onChange={e => setMargin(parseFloat(e.target.value))} className="w-full accent-amber-500"
                        />
                    </div>

                    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-3 space-y-1.5">
                        <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-2">Dimensões calculadas</h3>
                        {[
                            { label: 'Largura (X)', value: dimW },
                            { label: 'Profundidade (Y)', value: dimD },
                            { label: 'Altura (Z)', value: dimH },
                        ].map(({ label, value }) => (
                            <div key={label} className="flex justify-between text-sm">
                                <span className="text-neutral-500">{label}</span>
                                <span className="text-amber-300 font-mono">{value.toFixed(1)} mm</span>
                            </div>
                        ))}
                    </div>

                    {error && <div className="bg-red-950 border border-red-800 rounded-lg p-3 text-sm text-red-300">{error}</div>}
                </div>

                <div className="p-4 border-t border-neutral-800 bg-neutral-950">
                    <button
                        onClick={handleGenerate} disabled={holes.length === 0 || isGenerating}
                        className="w-full py-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-semibold rounded shadow-lg transition-all"
                    >
                        {isGenerating ? 'Gerando...' : 'Gerar STL'}
                    </button>
                </div>
            </aside>

            <section className="flex-1 p-4 relative min-w-0 min-h-0 flex flex-col gap-3">
                <div className="flex-1 relative min-h-0">
                    <div className="absolute inset-0">
                        <Viewer3D
                            carimbBaseUrl={modelUrl}
                            carimbArteUrl={null}
                            cortadorUrl={null}
                            isGenerating={isGenerating}
                            artColor="#f5f0e8"
                            modelColor="#f59e0b"
                            modelType="ferramenta"
                        />
                    </div>
                </div>
                {modelUrl && (
                    <div className="flex-shrink-0 flex justify-center">
                        <button
                            onClick={() => downloadBlob(modelUrl, 'test_holes_vertical.stl')}
                            className="flex items-center gap-2 px-6 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-lg shadow-lg text-sm transition-colors"
                        >
                            Baixar STL
                        </button>
                    </div>
                )}
            </section>
        </Layout>
    );
}
