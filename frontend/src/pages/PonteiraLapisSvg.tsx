import React, { useState, useRef } from 'react';
import axios from 'axios';
import { Upload, Sliders } from 'lucide-react';
import { Layout } from '../components/ui/Layout';
import { SvgPreviewModal } from '../components/ui/SvgPreviewModal';
import Viewer3D from '../components/ui/Viewer3D';
import { useCacheManagement } from '../hooks/useCacheManagement';
import { CacheBadge, ClearCacheButton } from '../components/ui/CacheControls';
import { processSvgFile } from '../svgProcessor';

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

export default function PonteiraLapisSvg() {
    const [isGenerating, setIsGenerating] = useState(false);
    const [carimbBaseUrl, setCarimbBaseUrl] = useState<string | null>(null);
    const [carimbArteUrl, setCarimbArteUrl] = useState<string | null>(null);
    const [tmfUrl, setTmfUrl] = useState<string | null>(null);
    const { fromCache, setFromCache, isClearingCache, clearCache } = useCacheManagement();

    const handleClearCache = () => clearCache(() => {
        setCarimbBaseUrl(null); setCarimbArteUrl(null); setTmfUrl(null);
    });

    const [artColor, setArtColor] = useState('#f5f0e8');
    const [modelColor, setModelColor] = useState('#34d399');

    const [svgFile, setSvgFile] = useState<File | null>(null);
    const [svgText, setSvgText] = useState<string | null>(null);

    const [modelConfig, setModelConfig] = useState<any>(null);
    const [dynamicParams, setDynamicParams] = useState<Record<string, any>>({});
    const [isModalOpen, setIsModalOpen] = useState(false);

    const [artHeight, setArtHeight] = useState(70);
    const [artWidth, setArtWidth] = useState(70);
    const [lockAspectRatio, setLockAspectRatio] = useState(true);
    const [svgAspectRatio, setSvgAspectRatio] = useState(1.0);

    const [svgPreview, setSvgPreview] = useState<{ originalSvg: string; thickenedSvg: string; silhouetteSvg: string; } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    React.useEffect(() => {
        let isMounted = true;
        const fetchConfig = async () => {
            try {
                const res = await axios.get(`${API_BASE}/api/models/ponteira_lapis_svg/config`);
                if (isMounted && res.data && res.data.parameters) {
                    setModelConfig(res.data);
                    const initialParams: Record<string, any> = {};
                    res.data.parameters.forEach((param: any) => {
                        initialParams[param.id] = param.default;
                    });
                    setDynamicParams(initialParams);
                }
            } catch (err) {
                console.error("Erro ao carregar configuração:", err);
            }
        };
        fetchConfig();
        return () => { isMounted = false; };
    }, []);

    const triggerFilePicker = () => {
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
            fileInputRef.current.click();
        }
    };

    const handleDynamicParamChange = (id: string, value: any) => setDynamicParams(prev => ({ ...prev, [id]: value }));
    const handleHeightChange = (val: number) => {
        setArtHeight(val);
        if (lockAspectRatio) setArtWidth(Math.round(val * svgAspectRatio * 10) / 10);
    };
    const handleWidthChange = (val: number) => {
        setArtWidth(val);
        if (lockAspectRatio) setArtHeight(Math.round(val / svgAspectRatio * 10) / 10);
    };

    const handleSvgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setSvgFile(file);
        const reader = new FileReader();
        reader.onload = async (evt) => {
            const text = evt.target?.result as string;
            if (!text) return;
            setSvgText(text);
            try {
                const currentLineOffset = dynamicParams['line_offset'] ?? 0.5;
                const processed = await processSvgFile(text, currentLineOffset, 3.0);
                setSvgPreview(processed);
                // Read actual content dimensions from the normalized (processed) SVG
                // The original SVG viewBox may be square even if the art is not.
                if (processed) {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(processed.thickenedSvg, 'image/svg+xml');
                    const svgEl = doc.querySelector('svg');
                    let natW = 0, natH = 0;
                    if (svgEl) {
                        const vb = svgEl.getAttribute('viewBox');
                        if (vb) {
                            const parts = vb.split(/[\s,]+/).map(Number);
                            if (parts.length >= 4) { natW = parts[2]; natH = parts[3]; }
                        }
                        if (!natW) natW = parseFloat(svgEl.getAttribute('width') || '0');
                        if (!natH) natH = parseFloat(svgEl.getAttribute('height') || '0');
                    }
                    if (natW > 0 && natH > 0) {
                        const ratio = natW / natH;
                        setSvgAspectRatio(ratio);
                        setArtHeight(70);
                        setArtWidth(Math.round(70 * ratio * 10) / 10);
                    }
                }
                setIsModalOpen(true);
            } catch (err) {
                console.error("SVG Processing Error:", err);
                alert("Erro ao processar o arquivo SVG.");
            }
        };
        reader.readAsText(file);
    };

    const handleModalConfirm = (processed: any, finalThickness: number) => {
        setSvgPreview(processed);
        handleDynamicParamChange('line_offset', finalThickness);
        setIsModalOpen(false);
    };

    const handleGenerateClick = async () => {
        if (!svgPreview) return;
        setIsGenerating(true);
        setCarimbBaseUrl(null); setCarimbArteUrl(null); setTmfUrl(null); setFromCache(null);
        try {
            const formData = new FormData();
            formData.append('linhas_svg', new Blob([svgPreview.thickenedSvg], { type: 'image/svg+xml' }), 'linhas.svg');
            formData.append('silhueta_svg', new Blob([svgPreview.silhouetteSvg], { type: 'image/svg+xml' }), 'silhueta.svg');
            formData.append('art_width', artWidth.toString());
            formData.append('art_height', artHeight.toString());

            Object.entries(dynamicParams).forEach(([k, v]) => {
                if (v !== undefined && v !== null) formData.append(k, String(v));
            });

            const res = await axios.post(`${API_BASE}/api/generate/ponteira_lapis_svg`, formData);
            if (res.data?.files) {
                if (res.data.files.base) setCarimbBaseUrl(`${API_BASE}${res.data.files.base}`);
                if (res.data.files.svg) setCarimbArteUrl(`${API_BASE}${res.data.files.svg}`);
                if (res.data.files['3mf']) setTmfUrl(`${API_BASE}${res.data.files['3mf']}`);
                setFromCache(res.data.from_cache ?? false);
            }
        } catch (err) {
            console.error("Error generating pieces:", err);
            alert("Falha ao gerar o modelo 3D.");
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <Layout title="Ponteira Lapis SVG">
            <SvgPreviewModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onConfirm={handleModalConfirm} onLoadAnother={() => { setIsModalOpen(false); triggerFilePicker(); }} svgText={svgText} initialThickness={dynamicParams['line_offset'] ?? 0.5} />
            
            <aside className="w-[400px] flex-shrink-0 bg-neutral-900 border-r border-neutral-800 flex flex-col overflow-y-auto">
                <div className="p-6 space-y-8">
                    <div className="space-y-3">
                        <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-widest flex items-center gap-2"><Upload className="w-4 h-4" /> Arte Principal</h2>
                        <input ref={fileInputRef} type="file" className="hidden" accept=".svg" onChange={handleSvgUpload} />
                        {svgPreview ? (
                            <button onClick={() => setIsModalOpen(true)} className="w-full block border-2 border-emerald-700/50 hover:border-emerald-500 rounded-lg p-4 text-center cursor-pointer transition-colors bg-neutral-950/50">
                                <span className="text-emerald-400 font-medium text-sm">{svgFile?.name || 'Arte carregada'}</span>
                            </button>
                        ) : (
                            <button onClick={triggerFilePicker} className="w-full block border-2 border-dashed border-neutral-700 hover:border-emerald-500 rounded-lg p-4 text-center cursor-pointer transition-colors bg-neutral-950/50">
                                <span className="text-emerald-400 font-medium text-sm">Selecionar arquivo SVG</span>
                            </button>
                        )}
                        {svgPreview && (
                            <div className="relative rounded-lg overflow-hidden border border-neutral-700" style={{ backgroundColor: '#f0ebe3' }}>
                                <div dangerouslySetInnerHTML={{ __html: svgPreview.thickenedSvg }} className="w-full [&>svg]:w-full [&>svg]:h-auto [&>svg]:max-h-48 [&>svg]:object-contain p-2" />
                            </div>
                        )}
                    </div>

                    <div className="space-y-4">
                        <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-widest flex items-center gap-2"><Sliders className="w-4 h-4" /> Configurações</h2>
                        <div className="space-y-2">
                            <label className="text-sm text-neutral-300 font-medium">Tamanho da Arte</label>
                            <div className="flex items-center gap-2">
                                <div className="flex-1 space-y-1">
                                    <span className="text-xs text-neutral-500">Altura</span>
                                    <div className="flex items-center gap-1">
                                        <input type="number" min="10" max="300" step="1" value={artHeight} onChange={e => handleHeightChange(parseFloat(e.target.value) || 0)} className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white focus:border-emerald-500 focus:outline-none" />
                                        <span className="text-xs text-neutral-500">mm</span>
                                    </div>
                                </div>
                                <button onClick={() => setLockAspectRatio(l => !l)} className={`self-center mt-4 p-1.5 rounded border transition-colors ${lockAspectRatio ? 'bg-emerald-700 border-emerald-500 text-white' : 'bg-neutral-800 border-neutral-700 text-neutral-500'}`}>
                                    {lockAspectRatio ? '🔒' : '🔓'}
                                </button>
                                <div className="flex-1 space-y-1">
                                    <span className="text-xs text-neutral-500">Largura</span>
                                    <div className="flex items-center gap-1">
                                        <input type="number" min="10" max="300" step="1" value={artWidth} onChange={e => handleWidthChange(parseFloat(e.target.value) || 0)} className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white focus:border-emerald-500 focus:outline-none" />
                                        <span className="text-xs text-neutral-500">mm</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {modelConfig?.parameters?.filter((p: any) => p.id !== 'line_offset').map((param: any) => {
                            const currentValue = dynamicParams[param.id] ?? param.default;
                            if (param.type === 'boolean') {
                                return (
                                    <div key={param.id} className="space-y-2 pt-2 pb-1">
                                        <label className="flex items-start gap-3 cursor-pointer group">
                                            <input type="checkbox" checked={Boolean(currentValue)} onChange={e => handleDynamicParamChange(param.id, e.target.checked)} className="w-5 h-5 rounded border-neutral-600 bg-neutral-800 accent-emerald-500" />
                                            <span className="text-sm font-medium text-neutral-200">{param.name}</span>
                                        </label>
                                    </div>
                                );
                            }
                            return (
                                <div key={param.id} className="space-y-2">
                                    <label className="flex justify-between text-sm"><span>{param.name}</span><span className="text-emerald-400 font-mono">{Number(currentValue).toFixed(1)}{param.unit}</span></label>
                                    <input type="range" min={param.min} max={param.max} step={param.step} value={Number(currentValue)} onChange={e => handleDynamicParamChange(param.id, parseFloat(e.target.value))} className="w-full accent-emerald-500" />
                                </div>
                            );
                        })}

                        <div className="grid grid-cols-2 gap-4 mt-6">
                            {[
                                { label: 'Cor Modelo', color: modelColor, setter: setModelColor },
                                { label: 'Cor Arte', color: artColor, setter: setArtColor },
                            ].map(({ label, color, setter }) => (
                                <div key={label} className="flex flex-col gap-1">
                                    <label className="text-xs text-neutral-500">{label}</label>
                                    <input type="color" value={color} onChange={e => setter(e.target.value)} className="w-full h-8 cursor-pointer rounded bg-neutral-900 border-none" />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="mt-auto p-4 border-t border-neutral-800 bg-neutral-950">
                    <div className="flex gap-2">
                        <button onClick={handleGenerateClick} disabled={!svgFile || isGenerating} className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded shadow-lg transition-all">
                            {isGenerating ? 'Gerando OpenSCAD...' : 'Gerar Peças 3D'}
                        </button>
                        <ClearCacheButton isClearingCache={isClearingCache} isGenerating={isGenerating} onClick={handleClearCache} />
                    </div>
                </div>
            </aside>

            <section className="flex-1 p-4 relative min-w-0 min-h-0 flex flex-col gap-3">
                <div className="flex-1 relative min-h-0">
                    <div className="absolute inset-0">
                        <Viewer3D carimbBaseUrl={carimbBaseUrl} carimbArteUrl={carimbArteUrl} cortadorUrl={null} isGenerating={isGenerating} artColor={artColor} modelColor={modelColor} modelType="ponteira" />
                    </div>
                </div>
                {tmfUrl && (
                    <div className="flex-shrink-0 flex flex-col items-center gap-1">
                        <CacheBadge fromCache={fromCache} />
                        <button onClick={() => downloadBlob(tmfUrl, 'ponteira_lapis_svg.3mf')} className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg shadow-lg text-sm transition-colors">
                            Baixar 3MF
                        </button>
                    </div>
                )}
            </section>
        </Layout>
    );
}
