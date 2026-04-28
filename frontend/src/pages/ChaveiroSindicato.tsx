import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Sliders } from 'lucide-react';
import { Layout } from '../components/ui/Layout';
import { ParameterLabel } from '../components/ui/ParameterLabel';
import Viewer3D from '../components/ui/Viewer3D';
import { useCacheManagement } from '../hooks/useCacheManagement';
import { CacheBadge, ClearCacheButton } from '../components/ui/CacheControls';
import { BatchGenerationModal, type BatchNameEntry } from '../components/ui/BatchGenerationModal';
import { ThinWallWarnings } from '../components/ui/ThinWallWarnings';

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

export default function ChaveiroSindicato() {
    const [config, setConfig] = useState<any>(null);
    const [params, setParams] = useState<Record<string, any>>({});
    const [isGenerating, setIsGenerating] = useState(false);

    const [corpoUrl, setCorpoUrl] = useState<string | null>(null);
    const [nomeUrl, setNomeUrl] = useState<string | null>(null);
    const [tmfUrl, setTmfUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [warnings, setWarnings] = useState<string[]>([]);
    const [thinWallParts, setThinWallParts] = useState<string[]>([]);

    const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
    const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
    const [batchTmfUrl, setBatchTmfUrl] = useState<string | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const { fromCache, setFromCache, isClearingCache, clearCache } = useCacheManagement();

    const handleClearCache = () => clearCache(() => {
        setTmfUrl(null); setCorpoUrl(null); setNomeUrl(null);
        setBatchTmfUrl(null); setBatchProgress(null);
    });

    useEffect(() => {
        axios.get(`${API_BASE}/api/models/chaveiro_sindicato/config`)
            .then(res => {
                const cfg = res.data;
                setConfig(cfg);
                const initial: Record<string, any> = {};
                cfg.parameters?.forEach((p: any) => { initial[p.id] = p.default; });
                cfg.sections?.forEach((s: any) => s.parameters?.forEach((p: any) => { initial[p.id] = p.default; }));
                setParams(initial);
            })
            .catch(() => {});
    }, []);

    useEffect(() => {
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, []);

    const setParam = (id: string, val: any) => setParams(prev => ({ ...prev, [id]: val }));

    const handleGenerate = async () => {
        setIsGenerating(true);
        setError(null); setWarnings([]); setCorpoUrl(null); setNomeUrl(null); setTmfUrl(null); setFromCache(null);
        try {
            const form = new FormData();
            // Divide o nome no primeiro espaço para gerar duas linhas
            const nome = String(params['text_line_1'] ?? '').trim();
            const partes = nome.split(/\s+/);
            form.append('text_line_1', partes[0] || '');
            form.append('text_line_2', partes.length > 1 ? partes.slice(1).join(' ') : '');
            // Demais parâmetros (text_size_1, etc.)
            Object.entries(params)
                .filter(([k]) => k !== 'text_line_1')
                .forEach(([k, v]) => form.append(k, String(v ?? '')));

            const res = await axios.post(`${API_BASE}/api/generate_parametric/chaveiro_sindicato`, form);
            if (res.data?.files) {
                if (res.data.files.corpo) setCorpoUrl(`${API_BASE}${res.data.files.corpo}`);
                if (res.data.files.nome) setNomeUrl(`${API_BASE}${res.data.files.nome}`);
                if (res.data.files['3mf']) setTmfUrl(`${API_BASE}${res.data.files['3mf']}`);
                setFromCache(res.data.from_cache ?? false);
                setWarnings(res.data.warnings ?? []);
                setThinWallParts(res.data.thin_wall_parts ?? []);
            }
        } catch (err: any) {
            setError(err?.response?.data?.error ?? 'Erro desconhecido');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleBatchGenerate = async (rows: BatchNameEntry[]) => {
        if (rows.length === 0) return;
        if (pollRef.current) clearInterval(pollRef.current);
        setBatchProgress({ done: 0, total: rows.length }); setBatchTmfUrl(null); setError(null);
        try {
            const form = new FormData();
            form.append('names', JSON.stringify(rows));
            // Envia parâmetros base sem text_line_1 (injetado pelo backend por nome)
            Object.entries(params)
                .filter(([k]) => k !== 'text_line_1')
                .forEach(([k, v]) => form.append(k, String(v ?? '')));

            const res = await axios.post(`${API_BASE}/api/generate_batch/chaveiro_sindicato`, form);
            const id: string = res.data.batch_id;
            setBatchProgress({ done: res.data.done ?? 0, total: res.data.total });

            if (res.data.status === 'done') {
                setBatchProgress({ done: res.data.total, total: res.data.total });
                setBatchTmfUrl(`${API_BASE}${res.data.file}`);
                return;
            }

            pollRef.current = setInterval(async () => {
                try {
                    const status = await axios.get(`${API_BASE}/api/batch_status/${id}`);
                    const job = status.data;
                    setBatchProgress({ done: job.done, total: job.total });
                    if (job.status === 'done') {
                        clearInterval(pollRef.current!);
                        pollRef.current = null;
                        setBatchTmfUrl(`${API_BASE}${job.file}`);
                    } else if (job.status === 'error') {
                        clearInterval(pollRef.current!);
                        pollRef.current = null;
                        setError(job.error ?? 'Erro na geração em lote');
                    }
                } catch {
                    clearInterval(pollRef.current!);
                    pollRef.current = null;
                }
            }, 2000);
        } catch (err: any) {
            setError(err?.response?.data?.error ?? 'Erro ao iniciar lote');
            setBatchProgress(null);
        }
    };

    const renderParam = (p: any) => {
        const val = params[p.id] ?? p.default;
        switch (p.type) {
            case 'text':
                return (
                    <div key={p.id} className="space-y-1">
                        <label className="text-sm text-neutral-400">
                            <ParameterLabel name={p.name} helpText={p.help_text} />
                        </label>
                        <input
                            type="text" value={val} placeholder={p.placeholder ?? ''}
                            onChange={e => setParam(p.id, e.target.value)}
                            className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                        />
                    </div>
                );
            case 'range':
                return (
                    <div key={p.id} className="space-y-1">
                        <label className="flex justify-between text-sm">
                            <ParameterLabel name={p.name} helpText={p.help_text} className="text-neutral-400" />
                            <span className="text-emerald-400 font-mono">
                                {Number(val).toFixed(p.step < 1 ? 1 : 0)}{p.unit ? ` ${p.unit}` : ''}
                            </span>
                        </label>
                        <input
                            type="range" min={p.min} max={p.max} step={p.step} value={val}
                            onChange={e => setParam(p.id, parseFloat(e.target.value))}
                            className="w-full accent-emerald-500"
                        />
                    </div>
                );
            default: return null;
        }
    };

    return (
        <Layout title="Chaveiro Sindicato">
            <aside className="w-80 flex-shrink-0 bg-neutral-950 border-r border-neutral-800 flex flex-col">
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {!config && <p className="text-sm text-neutral-600 animate-pulse">Carregando configurações...</p>}
                    {config && (
                        <div className="space-y-4 pb-1">
                            <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-widest flex items-center gap-2">
                                <Sliders className="w-3.5 h-3.5" /> Nome
                            </h2>
                            {config.parameters?.map(renderParam)}
                        </div>
                    )}
                    {error && (
                        <div className="bg-red-950 border border-red-800 rounded-lg p-3 text-sm text-red-300">{error}</div>
                    )}
                    <ThinWallWarnings warnings={warnings} />
                </div>
                <div className="p-4 border-t border-neutral-800 bg-neutral-950 space-y-3">
                    <div className="flex gap-2">
                        <button
                            onClick={handleGenerate} disabled={isGenerating || !config}
                            className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded shadow-lg transition-all"
                        >
                            {isGenerating ? 'Gerando...' : 'Gerar Chaveiro 3D'}
                        </button>
                        <ClearCacheButton isClearingCache={isClearingCache} isGenerating={isGenerating} onClick={handleClearCache} />
                    </div>
                    <div className="border-t border-neutral-800 pt-3 space-y-2">
                        <button
                            type="button"
                            onClick={() => setIsBatchModalOpen(true)}
                            disabled={!config}
                            className="w-full py-2.5 text-sm bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-neutral-200 font-semibold rounded border border-neutral-700 transition-all"
                        >
                            Gerar em Lotes
                        </button>
                    </div>
                </div>
            </aside>
            <section className="flex-1 p-4 relative min-w-0 min-h-0 flex flex-col gap-3">
                <div className="flex-1 relative min-h-0">
                    <div className="absolute inset-0">
                        <Viewer3D
                            carimbBaseUrl={corpoUrl}
                            carimbArteUrl={nomeUrl}
                            cortadorUrl={null}
                            isGenerating={isGenerating}
                            artColor="#FFFFFF"
                            modelColor="#1B40D1"
                            modelType="default"
                            highlightArte={thinWallParts.length > 0}
                        />
                    </div>
                </div>
                {tmfUrl && (
                    <div className="flex-shrink-0 flex flex-col items-center gap-1">
                        <CacheBadge fromCache={fromCache} />
                        <button
                            onClick={() => downloadBlob(tmfUrl!, 'chaveiro_sindicato_multicolor.3mf')}
                            className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg shadow-lg text-sm transition-colors"
                        >
                            Baixar 3MF
                        </button>
                    </div>
                )}
            </section>
            <BatchGenerationModal
                isOpen={isBatchModalOpen}
                onClose={() => setIsBatchModalOpen(false)}
                onGenerate={handleBatchGenerate}
                onDownload={() => {
                    if (batchTmfUrl) downloadBlob(batchTmfUrl, 'chaveiro_sindicato_lote.zip');
                }}
                defaultExtrusorBase={1}
                defaultExtrusorLetras={2}
                isGenerating={batchProgress !== null && !batchTmfUrl}
                progress={batchProgress}
                downloadUrl={batchTmfUrl}
                error={error}
                title="Gerar Lote — Chaveiro Sindicato"
            />
        </Layout>
    );
}
