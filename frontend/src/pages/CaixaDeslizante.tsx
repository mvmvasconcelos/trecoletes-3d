import { useEffect, useState } from 'react';
import axios from 'axios';
import { Sliders } from 'lucide-react';
import { Layout } from '../components/ui/Layout';
import { ParameterLabel } from '../components/ui/ParameterLabel';
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

export default function CaixaDeslizante() {
    const [config, setConfig] = useState<any>(null);
    const [params, setParams] = useState<Record<string, any>>({});
    const [isGenerating, setIsGenerating] = useState(false);

    const [caixaUrl, setCaixaUrl] = useState<string | null>(null);
    const [tampaUrl, setTampaUrl] = useState<string | null>(null);
    const [tmfUrl, setTmfUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const { fromCache, setFromCache, isClearingCache, clearCache } = useCacheManagement();

    useEffect(() => {
        axios.get(`${API_BASE}/api/models/caixa_deslizante/config`)
            .then(res => {
                const cfg = res.data;
                setConfig(cfg);
                const initial: Record<string, any> = {};
                cfg.parameters?.forEach((p: any) => { initial[p.id] = p.default; });
                setParams(initial);
            })
            .catch(() => setError('Não foi possível carregar a configuração do modelo.'));
    }, []);

    const setParam = (id: string, val: any) => setParams(prev => ({ ...prev, [id]: val }));

    const handleClearCache = () => clearCache(() => {
        setCaixaUrl(null); setTampaUrl(null); setTmfUrl(null);
    });

    const handleGenerate = async () => {
        setIsGenerating(true);
        setError(null); setCaixaUrl(null); setTampaUrl(null); setTmfUrl(null); setFromCache(null);
        try {
            const form = new FormData();
            Object.entries(params).forEach(([k, v]) => form.append(k, String(v ?? '')));
            const res = await axios.post(`${API_BASE}/api/generate_parametric/caixa_deslizante`, form);
            const files = res.data.files || {};
            setCaixaUrl(files.caixa ? `${API_BASE}${files.caixa}` : null);
            setTampaUrl(files.tampa ? `${API_BASE}${files.tampa}` : null);
            setTmfUrl(files['3mf'] ? `${API_BASE}${files['3mf']}` : null);
            setFromCache(res.data.from_cache ?? null);
        } catch (err: any) {
            setError(err?.response?.data?.error ?? 'Erro desconhecido');
        } finally {
            setIsGenerating(false);
        }
    };

    const renderParam = (p: any) => (
        <div key={p.id} className="space-y-1">
            <label className="flex justify-between text-sm">
                <ParameterLabel name={p.name} helpText={p.help_text} className="text-neutral-400" />
                <span className="text-emerald-400 font-mono">
                    {Number(params[p.id] ?? p.default).toFixed(p.step < 1 ? 2 : 0)}{p.unit ? ` ${p.unit}` : ''}
                </span>
            </label>
            <input
                type="range" min={p.min} max={p.max} step={p.step} value={params[p.id] ?? p.default}
                onChange={e => setParam(p.id, parseFloat(e.target.value))}
                className="w-full accent-emerald-500"
            />
        </div>
    );

    return (
        <Layout title="Caixa com Tampa Deslizante">
            <aside className="w-80 flex-shrink-0 bg-neutral-950 border-r border-neutral-800 flex flex-col">
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {!config && <p className="text-sm text-neutral-600 animate-pulse">Carregando configurações...</p>}
                    {config && (
                        <>
                            <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-widest flex items-center gap-2">
                                <Sliders className="w-3.5 h-3.5" /> Dimensões
                            </h2>
                            {config.parameters?.map(renderParam)}
                        </>
                    )}
                    {error && (
                        <div className="bg-red-950 border border-red-800 rounded-lg p-3 text-sm text-red-300">{error}</div>
                    )}
                </div>
                <div className="p-4 border-t border-neutral-800 bg-neutral-950">
                    <div className="flex gap-2">
                        <button
                            onClick={handleGenerate} disabled={isGenerating || !config}
                            className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded shadow-lg transition-all"
                        >
                            {isGenerating ? 'Gerando...' : 'Gerar Modelo 3D'}
                        </button>
                        <ClearCacheButton isClearingCache={isClearingCache} isGenerating={isGenerating} onClick={handleClearCache} />
                    </div>
                </div>
            </aside>
            <section className="flex-1 p-4 relative min-w-0 min-h-0 flex flex-col gap-3">
                <div className="flex-1 relative min-h-0">
                    <div className="absolute inset-0">
                        <Viewer3D
                            carimbBaseUrl={caixaUrl}
                            carimbArteUrl={tampaUrl}
                            cortadorUrl={null}
                            isGenerating={isGenerating}
                            modelColor="#c89b6a"
                            artColor="#8b4513"
                            modelType="default"
                        />
                    </div>
                </div>
                {(caixaUrl || tampaUrl || tmfUrl) && (
                    <div className="flex-shrink-0 flex flex-col items-center gap-1">
                        <CacheBadge fromCache={fromCache} />
                        <div className="flex justify-center gap-3 flex-wrap">
                            {caixaUrl && (
                                <button
                                    onClick={() => downloadBlob(caixaUrl, 'caixa_deslizante_caixa.stl')}
                                    className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-sm font-medium rounded-lg border border-neutral-700 transition-colors"
                                >
                                    ⬇ Caixa (STL)
                                </button>
                            )}
                            {tampaUrl && (
                                <button
                                    onClick={() => downloadBlob(tampaUrl, 'caixa_deslizante_tampa.stl')}
                                    className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-sm font-medium rounded-lg border border-neutral-700 transition-colors"
                                >
                                    ⬇ Tampa (STL)
                                </button>
                            )}
                            {tmfUrl && (
                                <button
                                    onClick={() => downloadBlob(tmfUrl, 'caixa_deslizante.3mf')}
                                    className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg shadow-lg text-sm transition-colors"
                                >
                                    Baixar 3MF Completo
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </section>
        </Layout>
    );
}
