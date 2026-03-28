import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Ruler } from 'lucide-react';
import { Layout } from '../components/ui/Layout';
import Viewer3D from '../components/ui/Viewer3D';
import { useCacheManagement } from '../hooks/useCacheManagement';
import { CacheBadge, ClearCacheButton } from '../components/ui/CacheControls';

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

export default function TesteToleranciaTextoCQ() {
    const [tolerancias, setTolerancias] = useState<number[]>([0.2, 0.4]);
    const [texto, setTexto] = useState('TESTE');
    const [tamanho, setTamanho] = useState(10);
    const [margem, setMargem] = useState(2);

    const [isGenerating, setIsGenerating] = useState(false);
    const { fromCache, setFromCache, isClearingCache, clearCache } = useCacheManagement();
    const [chapaUrl, setChapaUrl] = useState<string | null>(null);
    const [textoUrl, setTextoUrl] = useState<string | null>(null);
    const [tmfUrl, setTmfUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Carrega defaults do config.json
    useEffect(() => {
        axios.get(`${API_BASE}/api/models/teste_tolerancia_texto_cq/config`)
            .then(res => {
                const params: any[] = res.data?.parameters ?? [];
                params.forEach((p: any) => {
                    if (p.id === 'tolerancias' && Array.isArray(p.default)) setTolerancias(p.default);
                    if (p.id === 'tamanho') setTamanho(Number(p.default));
                    if (p.id === 'margem') setMargem(Number(p.default));
                });
            })
            .catch(() => {});
    }, []);

    // Dimensões estimadas (espelham o model.py — layout vertical/Y)
    const gap = 2;
    const textWidth = tamanho * (texto.length || 1) * 0.9;
    const maxTol = tolerancias.length > 0 ? Math.max(...tolerancias) : 0;
    const plateW = textWidth + 2 * maxTol + 2 * margem;
    const rowH = (tol: number) => tamanho + 2 * tol + 2 * margem;
    const plateD = 2 * margem
        + tolerancias.reduce((s, t) => s + rowH(t), 0)
        + Math.max(0, tolerancias.length - 1) * gap;
    const plateThickness = 3;
    const artYOffset: [number, number, number] = [0, -(plateD / 2 + 10 + tamanho / 2), 0];

    const addTol = () => setTolerancias(prev => [...prev, 0.3]);
    const removeTol = (i: number) => setTolerancias(prev => prev.filter((_, idx) => idx !== i));
    const updateTol = (i: number, val: number) =>
        setTolerancias(prev => prev.map((v, idx) => (idx === i ? val : v)));

    const handleClearCache = () => clearCache(() => {
        setChapaUrl(null);
        setTextoUrl(null);
        setTmfUrl(null);
    });

    const handleGenerate = async () => {
        if (tolerancias.length === 0 || !texto.trim()) return;
        setIsGenerating(true);
        setError(null);
        setChapaUrl(null);
        setTextoUrl(null);
        setTmfUrl(null);
        try {
            const form = new FormData();
            form.append('texto', texto.trim());
            form.append('tamanho', String(tamanho));
            form.append('tolerancias', JSON.stringify(tolerancias));
            form.append('margem', String(margem));

            const res = await axios.post(
                `${API_BASE}/api/generate_cq/teste_tolerancia_texto_cq`,
                form
            );
            const files = res.data.files || {};
            setChapaUrl(files.chapa_negativa ? `${API_BASE}${files.chapa_negativa}` : null);
            setTextoUrl(files.texto_positivo ? `${API_BASE}${files.texto_positivo}` : null);
            setTmfUrl(files['3mf'] ? `${API_BASE}${files['3mf']}` : null);
            setFromCache(res.data.from_cache ?? null);
        } catch (err: any) {
            setError(err?.response?.data?.error ?? 'Erro desconhecido');
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <Layout title="Teste de Tolerância Texto (CQ)">
            {/* ── Sidebar ─────────────────────────────────────────────────── */}
            <aside className="w-80 flex-shrink-0 bg-neutral-950 border-r border-neutral-800 flex flex-col overflow-y-auto">
                <div className="p-4 space-y-6 flex-1">

                    {/* Tolerâncias */}
                    <div className="space-y-3">
                        <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                            <Ruler className="w-4 h-4" /> Tolerâncias a testar
                        </h2>
                        <p className="text-xs text-neutral-500">
                            Cada tolerância gera um encaixe na chapa com o texto expandido por esse valor (offset).
                            A peça positiva tem tamanho fixo e serve de referência.
                        </p>

                        <div className="space-y-2">
                            {tolerancias.map((t, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <span className="text-xs text-neutral-600 w-4 text-right">{i + 1}.</span>
                                    <input
                                        type="number"
                                        min={0.05}
                                        max={2}
                                        step={0.05}
                                        value={t}
                                        onChange={e => updateTol(i, parseFloat(e.target.value) || 0.05)}
                                        className="flex-1 bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white focus:border-violet-500 focus:outline-none"
                                    />
                                    <span className="text-xs text-neutral-500">mm</span>
                                    <button
                                        onClick={() => removeTol(i)}
                                        disabled={tolerancias.length <= 1}
                                        className="text-neutral-600 hover:text-red-400 transition-colors disabled:opacity-30"
                                        title="Remover tolerância"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={addTol}
                            className="w-full py-2 rounded-lg border border-dashed border-neutral-700 hover:border-violet-500 text-neutral-500 hover:text-violet-400 text-sm transition-colors"
                        >
                            + Adicionar tolerância
                        </button>
                    </div>

                    {/* Texto */}
                    <div className="space-y-2">
                        <label className="text-sm text-neutral-400 font-medium block">Texto</label>
                        <input
                            type="text"
                            value={texto}
                            onChange={e => setTexto(e.target.value)}
                            maxLength={20}
                            placeholder="Ex: TESTE"
                            className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
                        />
                    </div>

                    {/* Tamanho do texto */}
                    <div className="space-y-2">
                        <label className="flex justify-between text-sm">
                            <span className="text-neutral-400">Tamanho do texto</span>
                            <span className="text-violet-400 font-mono">{tamanho} mm</span>
                        </label>
                        <input
                            type="range"
                            min={5}
                            max={30}
                            step={1}
                            value={tamanho}
                            onChange={e => setTamanho(parseInt(e.target.value))}
                            className="w-full accent-violet-500"
                        />
                    </div>

                    {/* Margem */}
                    <div className="space-y-2">
                        <label className="flex justify-between text-sm">
                            <span className="text-neutral-400">Margem</span>
                            <span className="text-violet-400 font-mono">{margem.toFixed(1)} mm</span>
                        </label>
                        <input
                            type="range"
                            min={1}
                            max={5}
                            step={0.5}
                            value={margem}
                            onChange={e => setMargem(parseFloat(e.target.value))}
                            className="w-full accent-violet-500"
                        />
                        <p className="text-xs text-neutral-600">Espaço entre cada encaixe e as bordas da chapa.</p>
                    </div>

                    {/* Dimensões calculadas */}
                    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-3 space-y-1.5">
                        <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-2">
                            Dimensões estimadas
                        </h3>
                        {[
                            { label: 'Largura (X)',      value: plateW },
                            { label: 'Profundidade (Y)', value: plateD },
                            { label: 'Espessura (Z)',    value: plateThickness },
                        ].map(({ label, value }) => (
                            <div key={label} className="flex justify-between text-sm">
                                <span className="text-neutral-500">{label}</span>
                                <span className="text-violet-300 font-mono">{value.toFixed(1)} mm</span>
                            </div>
                        ))}
                        <div className="flex justify-between text-sm border-t border-neutral-800 pt-1.5 mt-1.5">
                            <span className="text-neutral-500">Encaixes</span>
                            <span className="text-violet-300 font-mono">{tolerancias.length}×</span>
                        </div>
                    </div>

                    {/* Badge engine */}
                    <div className="flex items-center gap-2">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-violet-900/40 text-violet-400 border border-violet-800 font-mono">
                            engine: CadQuery
                        </span>
                        <span className="text-xs text-neutral-600">largura real via fonttools</span>
                    </div>

                    {error && (
                        <div className="bg-red-950 border border-red-800 rounded-lg p-3 text-sm text-red-300">
                            {error}
                        </div>
                    )}
                </div>

                {/* Botões gerar + limpar cache */}
                <div className="p-4 border-t border-neutral-800 bg-neutral-950">
                    <div className="flex gap-2">
                        <button
                            onClick={handleGenerate}
                            disabled={tolerancias.length === 0 || !texto.trim() || isGenerating || isClearingCache}
                            className="flex-1 py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-semibold rounded shadow-lg transition-all"
                        >
                            {isGenerating ? 'Gerando...' : 'Gerar Modelos'}
                        </button>
                        <ClearCacheButton isClearingCache={isClearingCache} isGenerating={isGenerating} onClick={handleClearCache} />
                    </div>
                </div>
            </aside>

            {/* ── Viewer ──────────────────────────────────────────────────── */}
            <section className="flex-1 p-4 relative min-w-0 min-h-0 flex flex-col gap-3">
                <div className="flex-1 relative min-h-0">
                    <div className="absolute inset-0">
                        <Viewer3D
                            carimbBaseUrl={chapaUrl}
                            carimbArteUrl={textoUrl}
                            cortadorUrl={null}
                            isGenerating={isGenerating}
                            modelColor="#475569"
                            artColor="#a78bfa"
                            modelType="ferramenta"
                            artOffset={artYOffset}
                        />
                    </div>
                </div>

                {(chapaUrl || textoUrl || tmfUrl) && (
                    <div className="flex-shrink-0 flex justify-center gap-3 flex-wrap">
                        <CacheBadge fromCache={fromCache} />
                        {chapaUrl && (
                            <button
                                onClick={() => downloadBlob(chapaUrl, 'chapa_negativa.stl')}
                                className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-sm font-medium rounded-lg border border-neutral-700 transition-colors"
                            >
                                ⬇ Chapa Negativa (STL)
                            </button>
                        )}
                        {textoUrl && (
                            <button
                                onClick={() => downloadBlob(textoUrl, 'texto_positivo.stl')}
                                className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-sm font-medium rounded-lg border border-neutral-700 transition-colors"
                            >
                                ⬇ Texto Positivo (STL)
                            </button>
                        )}
                        {tmfUrl && (
                            <button
                                onClick={() => downloadBlob(tmfUrl, 'teste_tolerancia_texto_cq.3mf')}
                                className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold rounded-lg shadow-lg transition-colors"
                            >
                                ⬇ Completo (3MF)
                            </button>
                        )}
                    </div>
                )}
            </section>
        </Layout>
    );
}
