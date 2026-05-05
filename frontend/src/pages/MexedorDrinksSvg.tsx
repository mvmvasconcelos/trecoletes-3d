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

export default function MexedorDrinksSvg() {
    const [config, setConfig] = useState<any>(null);
    const [params, setParams] = useState<Record<string, any>>({});
    const [isGenerating, setIsGenerating] = useState(false);
    const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

    const [baseUrl, setBaseUrl] = useState<string | null>(null);
    const [svgUrl, setSvgUrl] = useState<string | null>(null);
    const [versoUrl, setVersoUrl] = useState<string | null>(null);
    const [tmfUrl, setTmfUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [warnings, setWarnings] = useState<string[]>([]);
    const [thinWallParts, setThinWallParts] = useState<string[]>([]);

    // SVG / PNG upload
    const [svgFile, setSvgFile] = useState<File | null>(null);
    const [svgText, setSvgText] = useState<string | null>(null);
    const [svgPreview, setSvgPreview] = useState<{ originalSvg: string; thickenedSvg: string; silhouetteSvg: string } | null>(null);
    const [isConvertingPng, setIsConvertingPng] = useState(false);
    const [svgAspectRatio, setSvgAspectRatio] = useState(1.0);
    const [lockAspectRatio, setLockAspectRatio] = useState(true);
    const [artHeight, setArtHeight] = useState(35);
    const [artWidth, setArtWidth] = useState(35);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // SVG / PNG upload — verso
    const [svgVersoFile, setSvgVersoFile] = useState<File | null>(null);
    const [svgVersoText, setSvgVersoText] = useState<string | null>(null);
    const [svgVersoPreview, setSvgVersoPreview] = useState<{ originalSvg: string; thickenedSvg: string; silhouetteSvg: string } | null>(null);
    const [isConvertingVersoPng, setIsConvertingVersoPng] = useState(false);
    const [isVersoModalOpen, setIsVersoModalOpen] = useState(false);
    const versoFileInputRef = useRef<HTMLInputElement>(null);

    const { fromCache, setFromCache, isClearingCache, clearCache } = useCacheManagement();

    const handleClearCache = () => clearCache(() => {
        setTmfUrl(null); setBaseUrl(null); setSvgUrl(null); setVersoUrl(null);
    });

    useEffect(() => {
        axios.get(`${API_BASE}/api/models/mexedor_drinks_svg/config`)
            .then(res => {
                const cfg = res.data;
                setConfig(cfg);
                const initial: Record<string, any> = {};
                const setDefaults = (list: any[]) => list?.forEach((p: any) => { initial[p.id] = p.default; });
                cfg.sections?.forEach((s: any) => setDefaults(s.parameters));
                initial['extrusor_base'] = 1;
                initial['extrusor_letras'] = 4;
                initial['extrusor_verso'] = 3;
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

    const triggerVersoFilePicker = () => {
        if (versoFileInputRef.current) {
            versoFileInputRef.current.value = '';
            versoFileInputRef.current.click();
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

    const _processSvgText = async (text: string) => {
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
                    const newArtH = Math.round((35 / ratio) * 10) / 10;
                    setArtWidth(35);
                    setArtHeight(newArtH);
                }
            }
            setIsModalOpen(true);
        } catch (err) {
            console.error('SVG Processing Error:', err);
            alert('Erro ao processar o arquivo SVG.');
        }
    };

    const handleSvgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setSvgFile(file);

        const fileIsPng = file.name.toLowerCase().endsWith('.png') || file.type === 'image/png';

        if (fileIsPng) {
            setIsConvertingPng(true);
            try {
                const form = new FormData();
                form.append('file', file, file.name);
                const res = await axios.post<string>(
                    `${API_BASE}/api/convert/png-to-svg`,
                    form,
                    { responseType: 'text' }
                );
                await _processSvgText(res.data);
            } catch (err: any) {
                alert(`Erro ao converter PNG: ${err?.response?.data?.error ?? 'Falha desconhecida'}`);
            } finally {
                setIsConvertingPng(false);
            }
            return;
        }

        // SVG: lê como texto e processa normalmente
        const reader = new FileReader();
        reader.onload = async (evt) => {
            const text = evt.target?.result as string;
            if (!text) return;
            await _processSvgText(text);
        };
        reader.readAsText(file);
    };

    const handleModalConfirm = (processed: any) => {
        setSvgPreview(processed);
        setIsModalOpen(false);
    };

    const _processVersoSvgText = async (text: string) => {
        setSvgVersoText(text);
        try {
            const processed = await processSvgFile(text, 0.5, 3.0);
            setSvgVersoPreview(processed);
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
                    const newH = Math.round(25 / ratio * 10) / 10;
                    setParam('verso_width', 25);
                    setParam('verso_height', Math.min(100, Math.max(5, newH)));
                }
            }
            setIsVersoModalOpen(true);
        } catch (err) {
            console.error('Verso SVG Processing Error:', err);
            alert('Erro ao processar o arquivo SVG do verso.');
        }
    };

    const handleVersoSvgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setSvgVersoFile(file);

        const fileIsPng = file.name.toLowerCase().endsWith('.png') || file.type === 'image/png';

        if (fileIsPng) {
            setIsConvertingVersoPng(true);
            try {
                const form = new FormData();
                form.append('file', file, file.name);
                const res = await axios.post<string>(
                    `${API_BASE}/api/convert/png-to-svg`,
                    form,
                    { responseType: 'text' }
                );
                await _processVersoSvgText(res.data);
            } catch (err: any) {
                alert(`Erro ao converter PNG do verso: ${err?.response?.data?.error ?? 'Falha desconhecida'}`);
            } finally {
                setIsConvertingVersoPng(false);
            }
            return;
        }

        const reader = new FileReader();
        reader.onload = async (evt) => {
            const text = evt.target?.result as string;
            if (!text) return;
            await _processVersoSvgText(text);
        };
        reader.readAsText(file);
    };

    const handleVersoModalConfirm = (processed: any) => {
        setSvgVersoPreview(processed);
        setIsVersoModalOpen(false);
    };

    const handleGenerate = async () => {
        if (!svgPreview) return;
        setIsGenerating(true);
        setError(null); setWarnings([]); setBaseUrl(null); setSvgUrl(null); setVersoUrl(null); setTmfUrl(null); setFromCache(null);
        try {
            const form = new FormData();
            form.append(
                'svg_linhas_path',
                new Blob([svgPreview.thickenedSvg], { type: 'image/svg+xml' }),
                'linhas.svg'
            );
            form.append('art_width', String(artWidth));
            form.append('art_height', String(artHeight));

            // verso_enable: ativo apenas quando SVG do verso está carregado
            const versoActive = !!(svgVersoPreview && params['verso_enable']);

            Object.entries(params).forEach(([k, v]) => {
                if (k === 'verso_enable') return; // tratado separadamente abaixo
                if (v !== undefined && v !== null) form.append(k, String(v));
            });
            form.append('verso_enable', versoActive ? 'true' : 'false');

            if (versoActive && svgVersoPreview) {
                form.append(
                    'svg_verso_path',
                    new Blob([svgVersoPreview.thickenedSvg], { type: 'image/svg+xml' }),
                    'verso.svg'
                );
            }

            const res = await axios.post(
                `${API_BASE}/api/generate_parametric/mexedor_drinks_svg`,
                form
            );
            if (res.data?.files) {
                if (res.data.files.base) setBaseUrl(`${API_BASE}${res.data.files.base}`);
                if (res.data.files.svg) setSvgUrl(`${API_BASE}${res.data.files.svg}`);
                if (res.data.files.verso) setVersoUrl(`${API_BASE}${res.data.files.verso}`);
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

    const renderParam = (p: any) => {
        const val = params[p.id] ?? p.default;
        // Esconde o slider de diâmetro quando o cilindro está desativado
        if (p.id === 'tip_diameter' && !(params['tip_cylinder'] ?? true)) return null;
        switch (p.type) {
            case 'boolean':
                return (
                    <div key={p.id} className="flex items-center justify-between gap-3 py-0.5">
                        <ParameterLabel name={p.name} helpText={p.help_text} className="text-sm text-neutral-400 flex-1" />
                        <button
                            type="button"
                            onClick={() => setParam(p.id, !val)}
                            className={`relative inline-flex w-10 h-5 flex-shrink-0 rounded-full overflow-hidden transition-colors ${val ? 'bg-violet-600' : 'bg-neutral-700'}`}
                        >
                            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${val ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                    </div>
                );
            case 'range':
                return (
                    <div key={p.id} className="space-y-1">
                        <label className="flex justify-between text-sm">
                            <ParameterLabel name={p.name} helpText={p.help_text} className="text-neutral-400" />
                            <span className="text-violet-400 font-mono" title="Duplo clique no slider para resetar">
                                {Number(val).toFixed(p.step < 1 ? 1 : 0)}{p.unit ? ` ${p.unit}` : ''}
                            </span>
                        </label>
                        <input
                            type="range" min={p.min} max={p.max} step={p.step} value={val}
                            onChange={e => setParam(p.id, parseFloat(e.target.value))}
                            onDoubleClick={() => setParam(p.id, p.default)}
                            className="w-full accent-violet-500 cursor-pointer"
                        />
                    </div>
                );
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
                let extField: string;
                let defaultExt: number;
                if (p.id === 'base_color') {
                    extField = 'extrusor_base';
                    defaultExt = 1;
                } else if (p.id === 'verso_color') {
                    extField = 'extrusor_verso';
                    defaultExt = 3;
                } else {
                    extField = 'extrusor_letras';
                    defaultExt = 4;
                }
                const extVal = params[extField] ?? defaultExt;
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
        <Layout title="Mexedor de Drinks">
            <SvgPreviewModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onConfirm={handleModalConfirm}
                onLoadAnother={() => { setIsModalOpen(false); triggerFilePicker(); }}
                svgText={svgText}
                initialThickness={0.5}
            />
            <SvgPreviewModal
                isOpen={isVersoModalOpen}
                onClose={() => setIsVersoModalOpen(false)}
                onConfirm={handleVersoModalConfirm}
                onLoadAnother={() => { setIsVersoModalOpen(false); triggerVersoFilePicker(); }}
                svgText={svgVersoText}
                initialThickness={0.5}
            />

            <aside className="w-80 flex-shrink-0 bg-neutral-950 border-r border-neutral-800 flex flex-col">
                <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-3">
                    {!config && <p className="text-sm text-neutral-600 animate-pulse">Carregando configurações...</p>}
                    {config && (
                        <>
                            {/* Upload do SVG / PNG */}
                            <div className="border border-neutral-800 rounded-lg overflow-hidden">
                                <div className="flex items-center gap-2 px-3 py-2.5 bg-neutral-900">
                                    <Upload className="w-3.5 h-3.5 text-neutral-400" />
                                    <span className="text-xs font-semibold text-neutral-400 uppercase tracking-widest">Arte (SVG ou PNG)</span>
                                </div>
                                <div className="px-3 pb-3 pt-2 space-y-3 bg-neutral-950 rounded-b-lg">
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        className="hidden"
                                        accept=".svg,.png"
                                        onChange={handleSvgUpload}
                                    />
                                    {isConvertingPng ? (
                                        <div className="w-full border-2 border-dashed border-amber-700/50 rounded-lg p-4 text-center bg-neutral-950/50">
                                            <span className="text-amber-400 text-sm animate-pulse">Convertendo PNG para SVG...</span>
                                        </div>
                                    ) : svgPreview ? (
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
                                            <span className="text-violet-400 font-medium text-sm block">Selecionar SVG ou PNG</span>
                                            <span className="text-xs text-neutral-500">A arte será exibida em relevo no mexedor</span>
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
                                            <span className="text-xs text-neutral-500">Largura</span>
                                            <div className="flex items-center gap-1">
                                                <input
                                                    type="number" min="10" max="200" step="1"
                                                    value={artWidth}
                                                    onChange={e => handleWidthChange(parseFloat(e.target.value) || 35)}
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
                                            <span className="text-xs text-neutral-500">Altura</span>
                                            <div className="flex items-center gap-1">
                                                <input
                                                    type="number" min="10" max="200" step="1"
                                                    value={artHeight}
                                                    onChange={e => handleHeightChange(parseFloat(e.target.value) || 35)}
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

                            {/* Upload da Arte do Verso — visível quando verso_enable=true */}
                            {params['verso_enable'] && (
                                <div className="border border-violet-900/50 rounded-lg overflow-hidden">
                                    <div className="flex items-center gap-2 px-3 py-2.5 bg-neutral-900">
                                        <Upload className="w-3.5 h-3.5 text-violet-400" />
                                        <span className="text-xs font-semibold text-violet-400 uppercase tracking-widest">Arte do Verso (SVG ou PNG)</span>
                                    </div>
                                    <div className="px-3 pb-3 pt-2 space-y-3 bg-neutral-950 rounded-b-lg">
                                        <input
                                            ref={versoFileInputRef}
                                            type="file"
                                            className="hidden"
                                            accept=".svg,.png"
                                            onChange={handleVersoSvgUpload}
                                        />
                                        {isConvertingVersoPng ? (
                                            <div className="w-full border-2 border-dashed border-amber-700/50 rounded-lg p-4 text-center bg-neutral-950/50">
                                                <span className="text-amber-400 text-sm animate-pulse">Convertendo PNG para SVG...</span>
                                            </div>
                                        ) : svgVersoPreview ? (
                                            <>
                                                <button
                                                    onClick={() => setIsVersoModalOpen(true)}
                                                    className="w-full border-2 border-violet-700/50 hover:border-violet-500 rounded-lg px-3 py-2 text-center cursor-pointer transition-colors bg-neutral-900/50"
                                                >
                                                    <span className="text-violet-400 font-medium text-sm truncate block">
                                                        {svgVersoFile?.name || 'Arte do verso carregada'}
                                                    </span>
                                                    <span className="text-xs text-neutral-500">Clique para editar</span>
                                                </button>
                                                <div
                                                    className="relative rounded-lg overflow-hidden border border-neutral-700"
                                                    style={{ backgroundColor: '#f0ebe3' }}
                                                >
                                                    <div
                                                        dangerouslySetInnerHTML={{ __html: svgVersoPreview.thickenedSvg }}
                                                        className="w-full [&>svg]:w-full [&>svg]:h-auto [&>svg]:max-h-32 [&>svg]:object-contain p-2"
                                                    />
                                                </div>
                                            </>
                                        ) : (
                                            <button
                                                onClick={triggerVersoFilePicker}
                                                className="w-full border-2 border-dashed border-neutral-700 hover:border-violet-500 rounded-lg p-4 text-center cursor-pointer transition-colors bg-neutral-950/50"
                                            >
                                                <Upload className="w-5 h-5 text-violet-500 mx-auto mb-1" />
                                                <span className="text-violet-400 font-medium text-sm block">Selecionar SVG ou PNG</span>
                                                <span className="text-xs text-neutral-500">Arte espelhada na face inferior</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {colorsSection && renderAccordionSection(colorsSection)}
                        </>
                    )}

                    {error && (
                        <div className="bg-red-950 border border-red-800 rounded-lg p-3 text-sm text-red-300">{error}</div>
                    )}
                    <ThinWallWarnings warnings={warnings} />
                </div>

                <div className="p-4 border-t border-neutral-800 bg-neutral-950">
                    <div className="flex gap-2">
                        <button
                            onClick={handleGenerate}
                            disabled={isGenerating || !config || !svgPreview}
                            className="flex-1 py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-semibold rounded shadow-lg transition-all"
                        >
                            {isGenerating ? 'Gerando...' : 'Gerar Mexedor 3D'}
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
                            highlightArte={thinWallParts.length > 0}
                            extraMeshes={versoUrl ? [{ url: versoUrl, color: (params['verso_color'] as string) ?? '#FFFFFF' }] : []}
                        />
                    </div>
                </div>
                {tmfUrl && (
                    <div className="flex-shrink-0 flex flex-col items-center gap-1">
                        <CacheBadge fromCache={fromCache} />
                        <button
                            onClick={() => downloadBlob(tmfUrl!, 'mexedor_drinks_svg_all.3mf')}
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
