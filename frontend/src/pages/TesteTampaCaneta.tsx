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
    const [diametros, setDiametros] = useState<number[]>([7.2, 7.5, 7.8]);
    const [margin, setMargin] = useState(1.4);

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
                const loadedParams: any[] = cfg.parameters ?? [];
                loadedParams.forEach((p: any) => {
                    if (p.id === 'diametros' && Array.isArray(p.default)) setDiametros(p.default);
                    if (p.id === 'margin') setMargin(Number(p.default));
                });
            })
            .catch(() => {
                setError('Nao foi possivel carregar a configuracao do modelo.');
            });
    }, []);

    const addDiametro = () => setDiametros((prev) => [...prev, 7.2]);
    const removeDiametro = (index: number) => setDiametros((prev) => prev.filter((_, i) => i !== index));
    const updateDiametro = (index: number, value: number) => {
        setDiametros((prev) => prev.map((current, i) => (i === index ? value : current)));
    };

    const safeDiametros = diametros.map((d) => Math.max(2, d));
    const maxDiametro = safeDiametros.length > 0 ? Math.max(...safeDiametros) : 2;
    const sumDiametros = safeDiametros.reduce((sum, current) => sum + current, 0);
    const dimX = sumDiametros + margin * (safeDiametros.length + 1);
    const dimY = 35;
    const dimZ = maxDiametro + margin * 2;

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
            form.append('diametros', `[${safeDiametros.join(', ')}]`);
            form.append('margin', String(margin));

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

    return (
        <Layout title="Teste Tampa Caneta">
            <aside className="w-80 flex-shrink-0 bg-neutral-950 border-r border-neutral-800 flex flex-col overflow-y-auto">
                <div className="p-4 space-y-6 flex-1">
                    <div className="space-y-3">
                        <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                            <FlaskConical className="w-4 h-4" /> Encaixe BIC
                        </h2>
                        <p className="text-xs text-neutral-500">
                            Cada furo usa o mesmo perfil da caneta BIC: comeca em 2 mm, cresce ao longo de 23 mm e termina com 2 mm de trecho cilindrico no diametro final escolhido.
                        </p>
                    </div>

                    <div className="space-y-3">
                        <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-widest">
                            Diametros finais
                        </h2>
                        <p className="text-xs text-neutral-500">
                            Cada valor vira um furo lado a lado. Exemplo: 7.2 e 7.5 geram uma unica peca maior com dois testes no mesmo bloco.
                        </p>

                        <div className="space-y-2">
                            {diametros.map((diametro, index) => (
                                <div key={index} className="flex items-center gap-2">
                                    <span className="text-xs text-neutral-600 w-4 text-right">{index + 1}.</span>
                                    <input
                                        type="number"
                                        min={2}
                                        max={12}
                                        step={0.1}
                                        value={diametro}
                                        onChange={(e) => updateDiametro(index, parseFloat(e.target.value) || 2)}
                                        className="flex-1 bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                                    />
                                    <span className="text-xs text-neutral-500">mm</span>
                                    <button
                                        onClick={() => removeDiametro(index)}
                                        disabled={diametros.length <= 1}
                                        className="text-neutral-600 hover:text-red-400 transition-colors disabled:opacity-30"
                                        title="Remover diametro"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={addDiametro}
                            className="w-full py-2 rounded-lg border border-dashed border-neutral-700 hover:border-blue-500 text-neutral-500 hover:text-blue-400 text-sm transition-colors"
                        >
                            + Adicionar diametro
                        </button>
                    </div>

                    <div className="space-y-2">
                        <label className="flex justify-between text-sm">
                            <span className="text-neutral-400">Margem externa</span>
                            <span className="text-blue-400 font-mono">{margin.toFixed(1)} mm</span>
                        </label>
                        <input
                            type="range"
                            min={1}
                            max={4}
                            step={0.1}
                            value={margin}
                            onChange={(e) => setMargin(parseFloat(e.target.value))}
                            className="w-full accent-blue-500"
                        />
                        <p className="text-xs text-neutral-600">Define a parede externa e o espacamento entre os testes.</p>
                    </div>

                    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-3 space-y-1.5">
                        <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-2">
                            Dimensoes calculadas
                        </h3>
                        <div className="flex justify-between text-sm">
                            <span className="text-neutral-500">Largura (X)</span>
                            <span className="text-blue-300 font-mono">{dimX.toFixed(1)} mm</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-neutral-500">Comprimento (Y)</span>
                            <span className="text-blue-300 font-mono">{dimY.toFixed(1)} mm</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-neutral-500">Altura (Z)</span>
                            <span className="text-blue-300 font-mono">{dimZ.toFixed(1)} mm</span>
                        </div>
                        <div className="flex justify-between text-sm border-t border-neutral-800 pt-1.5 mt-1.5">
                            <span className="text-neutral-500">Furos</span>
                            <span className="text-blue-300 font-mono">{safeDiametros.length}x</span>
                        </div>
                    </div>

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
                            disabled={isGenerating || !config || isClearingCache || diametros.length === 0}
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
