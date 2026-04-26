import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Upload, Sliders, ChevronDown } from 'lucide-react';
import { Layout } from '../components/ui/Layout';
import { BambuColorPicker } from '../components/ui/BambuColorPicker';
import { ParameterLabel } from '../components/ui/ParameterLabel';
import Viewer3D from '../components/ui/Viewer3D';
import { useCacheManagement } from '../hooks/useCacheManagement';
import { CacheBadge, ClearCacheButton } from '../components/ui/CacheControls';
import { SvgPreviewModal } from '../components/ui/SvgPreviewModal';
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

export default function GeradorTopoBoloSvg() {
    const [config, setConfig] = useState<any>(null);
    const [params, setParams] = useState<Record<string, any>>({});
    const [isGenerating, setIsGenerating] = useState(false);
    const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

    const [baseUrl, setBaseUrl] = useState<string | null>(null);
    const [svgUrl, setSvgUrl] = useState<string | null>(null);
    const [tmfUrl, setTmfUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // SVG upload
    const [svgFile, setSvgFile] = useState<File | null>(null);
    const [svgText, setSvgText] = useState<string | null>(null);
    const [svgPreview, setSvgPreview] = useState<{ originalSvg: string; thickenedSvg: string; silhouetteSvg: string } | null>(null);
    const [svgAspectRatio, setSvgAspectRatio] = useState(1.0);
    const [lockAspectRatio, setLockAspectRatio] = useState(true);
    const [artHeight, setArtHeight] = useState(60);
    const [artWidth, setArtWidth] = useState(100);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const { fromCache, setFromCache, isClearingCache, clearCache } = useCacheManagement();

    const handleClearCache = () => clearCache(() => {
        setTmfUrl(null); setBaseUrl(null); setSvgUrl(null);
    });

    useEffect(() => {
        axios.get(`${API_BASE}/api/models/topo_bolo_svg/config`)
            .then(res => {
                const cfg = res.data;
                setConfig(cfg);
                const initial: Record<string, any> = {};
                const setDefaults = (list: any[]) => list?.forEach((p: any) => { initial[p.id] = p.default; });
                cfg.sections?.forEach((s: any) => setDefaults(s.parameters));
                initial['extrusor_base'] = 1;
                initial['extrusor_letras'] = 4;
                setParams(initial);
                const initOpen: Record<string, boolean> = {};
                cfg.sections?.forEach((s: any) => {
                    initOpen[s.name] = s.collapsed !== undefined ? !s.collapsed : true;
                });
                setOpenSections(initOpen);
            })
            .catch(() => {});
    }, []);

    const setParam = (id: string, val: any) => setParams(prev => ({ ...prev, [id]: val }));
    const toggleSection = (name: string) => setOpenSections(prev => ({ ...prev, [name]: !prev[name] }));

    const triggerFilePicker = () => {
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
            fileInputRef.current.click();
        }
    };

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
                const lineOffset = 0.5;
                const processed = await processSvgFile(text, lineOffset, 3.0);
                setSvgPreview(processed);
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
                        setArtHeight(60);
                        setArtWidth(Math.round(60 * ratio * 10) / 10);
                    }
                }
                setIsModalOpen(true);
            } catch (err) {
                console.error('SVG Processing Error:', err);
                alert('Erro ao processar o arquivo SVG.');
            }
        };
        reader.readAsText(file);
    };

    const handleModalConfirm = (processed: any) => {
        setSvgPreview(processed);
        setIsModalOpen(false);
    };

    const handleGenerate = async () => {
        if (!svgPreview) return;
        setIsGenerating(true);
        setError(null); setBaseUrl(null); setSvgUrl(null); setTmfUrl(null); setFromCache(null);
        try {
            const form = new FormData();
            form.append(
                'svg_linhas_path',
                new Blob([svgPreview.thickenedSvg], { type: 'image/svg+xml' }),
                'linhas.svg'
            );
            form.append('art_width', String(artWidth));
            form.append('art_height', String(artHeight));
            Object.entries(params).forEach(([k, v]) => {
                if (v !== undefined && v !== null) form.append(k, String(v));
            });

            const res = await axios.post(
                `${API_BASE}/api/generate_parametric/topo_bolo_svg`,
                form
            );
            if (res.data?.files) {
                if (res.data.files.base) setBaseUrl(`${API_BASE}${res.data.files.base}`);
                if (res.data.files.svg) setSvgUrl(`${API_BASE}${res.data.files.svg}`);
                if (res.data.files['3mf']) setTmfUrl(`${API_BASE}${res.data.files['3mf']}`);
                setFromCache(res.data.from_cache ?? false);
            }
        } catch (err: any) {
            setError(err?.response?.data?.error ?? 'Erro desconhecido');
        } finally {
            setIsGenerating(false);
        }
    };

    const renderParam = (p: any) => {
        const val = params[p.id] ?? p.default;
        const isSinglePost = (params['post_count'] ?? '2') === '1';
        switch (p.type) {
            case 'range': {
                // Esconde distância quando há apenas 1 haste
                if (p.id === 'post_spacing' && isSinglePost) return null;
                // Singular/plural dinâmico
                const displayName = isSinglePost && p.name_singular ? p.name_singular : p.name;
                return (
                    <div key={p.id} className="space-y-1">
                        <label className="flex justify-between text-sm">
                            <ParameterLabel name={displayName} helpText={p.help_text} className="text-neutral-400" />
                            <span className="text-violet-400 font-mono">
                                {Number(val).toFixed(p.step < 1 ? 1 : 0)}{p.unit ? ` ${p.unit}` : ''}
                            </span>
                        </label>
                        <input
                            type="range" min={p.min} max={p.max} step={p.step} value={val}
                            onChange={e => setParam(p.id, parseFloat(e.target.value))}
                            className="w-full accent-violet-500"
                        />
                    </div>
                );
            }
            case 'radio':
                return (
                    <div key={p.id} className="space-y-1.5">
                        <span className="text-sm text-neutral-400 block">
                            <ParameterLabel name={p.name} helpText={p.help_text} />
                        </span>
                        <div className="flex gap-2">
                            {p.options?.map((opt: any) => (
                                <label
                                    key={opt.value}
                                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded border cursor-pointer transition-colors text-sm font-medium select-none ${
                                        val === opt.value
                                            ? 'border-violet-500 bg-violet-600/20 text-violet-300'
                                            : 'border-neutral-700 bg-neutral-800 text-neutral-400 hover:border-neutral-500 hover:text-neutral-300'
                                    }`}
                                >
                                    <input
                                        type="radio" name={p.id} value={opt.value}
                                        checked={val === opt.value}
                                        onChange={() => setParam(p.id, opt.value)}
                                        className="sr-only"
                                    />
                                    {opt.label}
                                </label>
                            ))}
                        </div>
                    </div>
                );
            case 'color': {
                const extField = p.id === 'base_color' ? 'extrusor_base' : 'extrusor_letras';
                const extVal = params[extField] ?? (p.id === 'base_color' ? 1 : 4);
                return (
                    <BambuColorPicker
                        key={p.id} label={p.name} helpText={p.help_text} color={val} extruder={extVal}
                        onChangeColor={(newCol) => setParam(p.id, newCol)}
                        onChangeExtruder={(newExt) => setParam(extField, newExt)}
                    />
                );
            }
            default: return null;
        }
    };

    const renderAccordionSection = (section: any) => {
        const isOpen = openSections[section.name] ?? true;
        return (
            <div key={section.name} className={`border border-neutral-800 rounded-lg ${isOpen ? 'overflow-visible' : 'overflow-hidden'}`}>
                <button
                    type="button"
                    onClick={() => toggleSection(section.name)}
                    className="w-full flex items-center justify-between px-3 py-2.5 bg-neutral-900 hover:bg-neutral-800 transition-colors text-left"
                >
                    <span className="text-xs font-semibold text-neutral-400 uppercase tracking-widest">{section.name}</span>
                    <ChevronDown className={`w-4 h-4 text-neutral-500 transition-transform duration-200 ${isOpen ? 'rotate-0' : '-rotate-90'}`} />
                </button>
                {isOpen && (
                    <div className="px-3 pb-3 pt-2 space-y-4 bg-neutral-950 rounded-b-lg">
                        {section.parameters?.map(renderParam)}
                    </div>
                )}
            </div>
        );
    };

    const mainSections = config?.sections?.filter((s: any) => s.name !== 'Cores') ?? [];
    const colorsSection = config?.sections?.find((s: any) => s.name === 'Cores');

    return (
        <Layout title="Topo de Bolo SVG">
            <SvgPreviewModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onConfirm={handleModalConfirm}
                onLoadAnother={() => { setIsModalOpen(false); triggerFilePicker(); }}
                svgText={svgText}
                initialThickness={0.5}
            />

            <aside className="w-80 flex-shrink-0 bg-neutral-950 border-r border-neutral-800 flex flex-col">
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {!config && <p className="text-sm text-neutral-600 animate-pulse">Carregando configurações...</p>}
                    {config && (
                        <>
                            {/* Upload do SVG */}
                            <div className="border border-neutral-800 rounded-lg overflow-hidden">
                                <div className="flex items-center gap-2 px-3 py-2.5 bg-neutral-900">
                                    <Upload className="w-3.5 h-3.5 text-neutral-400" />
                                    <span className="text-xs font-semibold text-neutral-400 uppercase tracking-widest">Arte SVG</span>
                                </div>
                                <div className="px-3 pb-3 pt-2 space-y-3 bg-neutral-950 rounded-b-lg">
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        className="hidden"
                                        accept=".svg"
                                        onChange={handleSvgUpload}
                                    />
                                    {svgPreview ? (
                                        <>
                                            <button
                                                onClick={() => setIsModalOpen(true)}
                                                className="w-full border-2 border-violet-700/50 hover:border-violet-500 rounded-lg px-3 py-2 text-center cursor-pointer transition-colors bg-neutral-900/50"
                                            >
                                                <span className="text-violet-400 font-medium text-sm truncate block">
                                                    {svgFile?.name || 'Arte carregada'}
                                                </span>
                                                <span className="text-xs text-neutral-500">Clique para editar</span>
                                            </button>
                                            <div
                                                className="relative rounded-lg overflow-hidden border border-neutral-700"
                                                style={{ backgroundColor: '#f0ebe3' }}
                                            >
                                                <div
                                                    dangerouslySetInnerHTML={{ __html: svgPreview.thickenedSvg }}
                                                    className="w-full [&>svg]:w-full [&>svg]:h-auto [&>svg]:max-h-32 [&>svg]:object-contain p-2"
                                                />
                                            </div>
                                        </>
                                    ) : (
                                        <button
                                            onClick={triggerFilePicker}
                                            className="w-full border-2 border-dashed border-neutral-700 hover:border-violet-500 rounded-lg p-4 text-center cursor-pointer transition-colors bg-neutral-950/50"
                                        >
                                            <Upload className="w-5 h-5 text-violet-500 mx-auto mb-1" />
                                            <span className="text-violet-400 font-medium text-sm block">Selecionar arquivo SVG</span>
                                            <span className="text-xs text-neutral-500">A arte será exibida em relevo no topo</span>
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Tamanho da Arte com travamento de proporção */}
                            <div className="border border-neutral-800 rounded-lg overflow-visible">
                                <div className="flex items-center gap-2 px-3 py-2.5 bg-neutral-900">
                                    <Sliders className="w-3.5 h-3.5 text-neutral-400" />
                                    <span className="text-xs font-semibold text-neutral-400 uppercase tracking-widest">Tamanho da Arte</span>
                                </div>
                                <div className="px-3 pb-3 pt-2 space-y-3 bg-neutral-950 rounded-b-lg">
                                    <div className="flex items-end gap-2">
                                        <div className="flex-1 space-y-1">
                                            <span className="text-xs text-neutral-500">Altura</span>
                                            <div className="flex items-center gap-1">
                                                <input
                                                    type="number" min="20" max="200" step="1"
                                                    value={artHeight}
                                                    onChange={e => handleHeightChange(parseFloat(e.target.value) || 60)}
                                                    className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white focus:border-violet-500 focus:outline-none"
                                                />
                                                <span className="text-xs text-neutral-500 shrink-0">mm</span>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setLockAspectRatio(l => !l)}
                                            className={`mb-0.5 p-1.5 rounded border transition-colors ${lockAspectRatio ? 'bg-violet-700 border-violet-500 text-white' : 'bg-neutral-800 border-neutral-700 text-neutral-500'}`}
                                            title={lockAspectRatio ? 'Proporção travada' : 'Proporção livre'}
                                        >
                                            {lockAspectRatio ? '🔒' : '🔓'}
                                        </button>
                                        <div className="flex-1 space-y-1">
                                            <span className="text-xs text-neutral-500">Largura</span>
                                            <div className="flex items-center gap-1">
                                                <input
                                                    type="number" min="20" max="300" step="1"
                                                    value={artWidth}
                                                    onChange={e => handleWidthChange(parseFloat(e.target.value) || 100)}
                                                    className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white focus:border-violet-500 focus:outline-none"
                                                />
                                                <span className="text-xs text-neutral-500 shrink-0">mm</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Demais seções do config (exceto Cores) */}
                            {mainSections.map(renderAccordionSection)}

                            {colorsSection && renderAccordionSection(colorsSection)}
                        </>
                    )}

                    {error && (
                        <div className="bg-red-950 border border-red-800 rounded-lg p-3 text-sm text-red-300">{error}</div>
                    )}
                </div>

                <div className="p-4 border-t border-neutral-800 bg-neutral-950">
                    <div className="flex gap-2">
                        <button
                            onClick={handleGenerate}
                            disabled={isGenerating || !config || !svgPreview}
                            className="flex-1 py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-semibold rounded shadow-lg transition-all"
                        >
                            {isGenerating ? 'Gerando...' : 'Gerar Topo 3D'}
                        </button>
                        <ClearCacheButton isClearingCache={isClearingCache} isGenerating={isGenerating} onClick={handleClearCache} />
                    </div>
                </div>
            </aside>

            <section className="flex-1 p-4 relative min-w-0 min-h-0 flex flex-col gap-3">
                <div className="flex-1 relative min-h-0">
                    <div className="absolute inset-0">
                        <Viewer3D
                            carimbBaseUrl={baseUrl}
                            carimbArteUrl={svgUrl}
                            cortadorUrl={null}
                            isGenerating={isGenerating}
                            artColor={(params['letters_color'] as string) ?? '#FF0000'}
                            modelColor={(params['base_color'] as string) ?? '#FFFFFF'}
                            modelType="default"
                        />
                    </div>
                </div>
                {tmfUrl && (
                    <div className="flex-shrink-0 flex flex-col items-center gap-1">
                        <CacheBadge fromCache={fromCache} />
                        <button
                            onClick={() => downloadBlob(tmfUrl!, 'topo_bolo_svg_all.3mf')}
                            className="flex items-center gap-2 px-6 py-2.5 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-lg shadow-lg text-sm transition-colors"
                        >
                            Baixar 3MF
                        </button>
                    </div>
                )}
            </section>
        </Layout>
    );
}
