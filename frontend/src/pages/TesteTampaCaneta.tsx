import { useEffect, useState } from 'react';
import axios from 'axios';
import { FlaskConical, Trash2 } from 'lucide-react';
import { Layout } from '../components/ui/Layout';
import Viewer3D from '../components/ui/Viewer3D';

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000';

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

export default function TesteTampaCaneta() {
    const [config, setConfig] = useState<any>(null);
    const [params, setParams] = useState<Record<string, any>>({});

    const [isGenerating, setIsGenerating] = useState(false);
    const [isClearingCache, setIsClearingCache] = useState(false);

    const [bodyUrl, setBodyUrl] = useState<string | null>(null);
    const [tmfUrl, setTmfUrl] = useState<string | null>(null);
    const [fromCache, setFromCache] = useState<boolean | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        axios.get(`${API_BASE}/api/models/teste_tampa_caneta/config`)
            .then((res) => {
                const cfg = res.data;
                setConfig(cfg);
                const initial: Record<string, any> = {};
                cfg.parameters?.forEach((p: any) => {
                    initial[p.id] = p.default;
                });
                setParams(initial);
            })
            .catch(() => {
                setError('Nao foi possivel carregar a configuracao do modelo.');
            });
    }, []);

    const setParam = (id: string, value: any) => {
        setParams((prev) => ({ ...prev, [id]: value }));
    };

    const handleClearCache = async () => {
        setIsClearingCache(true);
        setError(null);
        try {
            await axios.post(`${API_BASE}/api/clear_cache`);
            setBodyUrl(null);
            setTmfUrl(null);
            setFromCache(null);
        } catch (err: any) {
            setError('Erro ao limpar cache: ' + (err?.response?.data?.detail ?? err?.message ?? 'desconhecido'));
        }
        setIsClearingCache(false);
    };

    const handleGenerate = async () => {
        setIsGenerating(true);
        setError(null);
        setBodyUrl(null);
        setTmfUrl(null);
        setFromCache(null);

        try {
            const form = new FormData();
            Object.entries(params).forEach(([k, v]) => form.append(k, String(v ?? '')));

            const res = await axios.post(`${API_BASE}/api/generate_parametric/teste_tampa_caneta`, form);
            const files = res.data.files || {};

            setBodyUrl(files.body ? `${API_BASE}${files.body}` : null);
            setTmfUrl(files['3mf'] ? `${API_BASE}${files['3mf']}` : null);
            setFromCache(res.data.from_cache ?? null);
        } catch (err: any) {
            setError(err?.response?.data?.error ?? 'Erro desconhecido');
        } finally {
            setIsGenerating(false);
        }
    };

    const renderParam = (p: any) => {
        const value = params[p.id] ?? p.default;

        if (p.type === 'range') {
            return (
                <div key={p.id} className="space-y-2">
                    <label className="flex justify-between text-sm">
                        <span className="text-neutral-400">{p.name}</span>
                        <span className="text-blue-400 font-mono">
                            {Number(value).toFixed(p.step < 1 ? 2 : 0)}{p.unit ? ` ${p.unit}` : ''}
                        </span>
                    </label>
                    {p.description && <p className="text-xs text-neutral-600">{p.description}</p>}
                    <input
                        type="range"
                        min={p.min}
                        max={p.max}
                        step={p.step}
                        value={value}
                        onChange={(e) => setParam(p.id, parseFloat(e.target.value))}
                        className="w-full accent-blue-500"
                    />
                </div>
            );
        }

        return null;
    };

    return (
        <Layout title="Teste Tampa Caneta">
            <aside className="w-80 flex-shrink-0 bg-neutral-950 border-r border-neutral-800 flex flex-col overflow-y-auto">
                <div className="p-4 space-y-6 flex-1">
                    <div className="space-y-3">
                        <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                            <FlaskConical className="w-4 h-4" /> Encaixe BIC
                        </h2>
                        <p className="text-xs text-neutral-500">
                            Bloco externo fixo de 25x10x10 mm. Perfil interno no eixo do comprimento: cone de 23 mm (d 2.0 para d 7.2) e trecho final cilindrico de 2 mm com d 7.2.
                        </p>
                    </div>

                    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-3 space-y-1.5">
                        <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-2">
                            Dimensoes fixas
                        </h3>
                        <div className="flex justify-between text-sm">
                            <span className="text-neutral-500">Corpo externo</span>
                            <span className="text-blue-300 font-mono">25 x 10 x 10 mm</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-neutral-500">Trecho conico</span>
                            <span className="text-blue-300 font-mono">23 mm</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-neutral-500">Trecho cilindrico</span>
                            <span className="text-blue-300 font-mono">2 mm</span>
                        </div>
                    </div>

                    {config?.parameters?.map(renderParam)}

                    {error && (
                        <div className="bg-red-950 border border-red-800 rounded-lg p-3 text-sm text-red-300">
                            {error}
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-neutral-800 bg-neutral-950">
                    <div className="flex gap-2">
                        <button
                            onClick={handleGenerate}
                            disabled={isGenerating || !config || isClearingCache}
                            className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded shadow-lg transition-all"
                        >
                            {isGenerating ? 'Gerando...' : 'Gerar Modelo 3D'}
                        </button>
                        <button
                            onClick={handleClearCache}
                            disabled={isClearingCache || isGenerating}
                            title="Limpar cache"
                            className="px-3 py-3 bg-neutral-800 hover:bg-red-900 text-neutral-400 hover:text-red-300 rounded border border-neutral-700 hover:border-red-700 transition-all"
                        >
                            {isClearingCache ? '...' : <Trash2 className="w-4 h-4" />}
                        </button>
                    </div>
                </div>
            </aside>

            <section className="flex-1 p-4 relative min-w-0 min-h-0 flex flex-col gap-3">
                <div className="flex-1 relative min-h-0">
                    <div className="absolute inset-0">
                        <Viewer3D
                            carimbBaseUrl={bodyUrl}
                            carimbArteUrl={null}
                            cortadorUrl={null}
                            isGenerating={isGenerating}
                            modelColor="#64748b"
                            artColor="#93c5fd"
                            modelType="ponteira"
                        />
                    </div>
                </div>

                {(bodyUrl || tmfUrl) && (
                    <div className="flex-shrink-0 flex justify-center gap-3 flex-wrap">
                        {fromCache !== null && (
                            <span className="self-center text-xs text-neutral-600">
                                {fromCache ? 'do cache' : 'gerado agora'}
                            </span>
                        )}
                        {bodyUrl && (
                            <button
                                onClick={() => downloadBlob(bodyUrl, 'teste_tampa_caneta_body.stl')}
                                className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-sm font-medium rounded-lg border border-neutral-700 transition-colors"
                            >
                                ⬇ Corpo (STL)
                            </button>
                        )}
                        {tmfUrl && (
                            <button
                                onClick={() => downloadBlob(tmfUrl, 'teste_tampa_caneta.3mf')}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg shadow-lg transition-colors"
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
