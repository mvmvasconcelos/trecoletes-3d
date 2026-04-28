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
import { useGoogleFont } from '../hooks/useGoogleFont';
import { FontPicker } from '../components/ui/FontPicker';
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

export default function ChaveiroSimplesSvg() {
    const [config, setConfig] = useState<any>(null);
    const [params, setParams] = useState<Record<string, any>>({});
    const [isGenerating, setIsGenerating] = useState(false);
    const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

    const [baseUrl, setBaseUrl] = useState<string | null>(null);
    const [lettersUrl, setLettersUrl] = useState<string | null>(null);
    const [tmfUrl, setTmfUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [warnings, setWarnings] = useState<string[]>([]);
    const [thinWallParts, setThinWallParts] = useState<string[]>([]);

    // SVG upload state
    const [svgFile, setSvgFile] = useState<File | null>(null);
    const [svgText, setSvgText] = useState<string | null>(null);
    const [svgPreview, setSvgPreview] = useState<{ originalSvg: string; thickenedSvg: string; silhouetteSvg: string } | null>(null);
    const [svgAspectRatio, setSvgAspectRatio] = useState(1.0);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const { fromCache, setFromCache, isClearingCache, clearCache } = useCacheManagement();

    const handleClearCache = () => clearCache(() => {
        setTmfUrl(null); setBaseUrl(null); setLettersUrl(null);
    });

    // Carrega config do modelo
    useEffect(() => {
        axios.get(`${API_BASE}/api/models/chaveiro_simples_com_svg/config`)
            .then(res => {
                const cfg = res.data;
                setConfig(cfg);
                const initial: Record<string, any> = {};
                const setDefaults = (list: any[]) => list?.forEach((p: any) => { initial[p.id] = p.default; });
                setDefaults(cfg.parameters);
                cfg.sections?.forEach((s: any) => setDefaults(s.parameters));
                initial['extrusor_base'] = 1;
                initial['extrusor_letras'] = 2;
                setParams(initial);
                const initOpen: Record<string, boolean> = {};
                cfg.sections?.forEach((s: any) => {
                    initOpen[s.name] = s.collapsed !== undefined ? !s.collapsed : true;
                });
                setOpenSections(initOpen);
            })
            .catch(() => {});
    }, []);

    const rawFontName = params['font_name'] || 'Chewy:style=Regular';
    const fontFamily = rawFontName.split(':')[0];
    useGoogleFont(fontFamily);

    const setParam = (id: string, val: any) => {
        setParams(prev => {
            const next = { ...prev, [id]: val };
            // Quando art_height muda, recalcula art_width com base no aspecto do SVG
            if (id === 'art_height') {
                next['art_width'] = Math.round(Number(val) * svgAspectRatio * 10) / 10;
            }
            return next;
        });
    };

    const toggleSection = (name: string) => setOpenSections(prev => ({ ...prev, [name]: !prev[name] }));

    // SVG: abre o seletor de arquivo
    const triggerFilePicker = () => {
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
            fileInputRef.current.click();
        }
    };

    // SVG: processa o arquivo selecionado
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
                const lineOffset = params['line_offset'] ?? 0.5;
                const processed = await processSvgFile(text, lineOffset, 3.0);
                setSvgPreview(processed);
                // Lê as dimensões reais do SVG processado para calcular proporção
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
                        const artH = params['art_height'] ?? 12;
                        setParams(prev => ({ ...prev, art_width: Math.round(artH * ratio * 10) / 10 }));
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

    const handleModalConfirm = (processed: any, finalThickness: number) => {
        setSvgPreview(processed);
        setParams(prev => ({ ...prev, line_offset: finalThickness }));
        setIsModalOpen(false);
    };

    // Geração 3D
    const handleGenerate = async () => {
        if (!svgPreview) return;
        setIsGenerating(true);
        setError(null); setWarnings([]); setBaseUrl(null); setLettersUrl(null); setTmfUrl(null); setFromCache(null);
        try {
            const form = new FormData();
            // SVG processado — o field name é o mesmo que a variável SCAD (svg_linhas_path)
            form.append(
                'svg_linhas_path',
                new Blob([svgPreview.thickenedSvg], { type: 'image/svg+xml' }),
                'linhas.svg'
            );
            // Todos os parâmetros de texto/dimensões
            Object.entries(params).forEach(([k, v]) => {
                if (v !== undefined && v !== null) form.append(k, String(v));
            });
            // art_width calculado por proporção (pode não estar em params se não foi alterado ainda)
            if (params['art_width'] === undefined) {
                form.append('art_width', String(Math.round((params['art_height'] ?? 12) * svgAspectRatio * 10) / 10));
            }

            const res = await axios.post(
                `${API_BASE}/api/generate_parametric/chaveiro_simples_com_svg`,
                form
            );
            if (res.data?.files) {
                if (res.data.files.base) setBaseUrl(`${API_BASE}${res.data.files.base}`);
                if (res.data.files.letters) setLettersUrl(`${API_BASE}${res.data.files.letters}`);
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

    // Renderização de um parâmetro do config.json
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
                        {/* Se for art_height, mostra a largura calculada */}
                        {p.id === 'art_height' && params['art_width'] !== undefined && (
                            <p className="text-xs text-neutral-500">
                                Largura calculada: {Number(params['art_width']).toFixed(1)} mm
                            </p>
                        )}
                    </div>
                );
            case 'color': {
                const extField = p.id === 'base_color' ? 'extrusor_base' : 'extrusor_letras';
                const extVal = params[extField] ?? (p.id === 'base_color' ? 1 : 2);
                return (
                    <BambuColorPicker
                        key={p.id} label={p.name} helpText={p.help_text} color={val} extruder={extVal}
                        onChangeColor={(newCol) => setParam(p.id, newCol)}
                        onChangeExtruder={(newExt) => setParam(extField, newExt)}
                    />
                );
            }
            case 'select':
                if (p.id === 'font_name') {
                    return <FontPicker key={p.id} parameter={p} value={val} onChange={setParam} />;
                }
                return (
                    <div key={p.id} className="space-y-1">
                        <label className="text-sm text-neutral-400">
                            <ParameterLabel name={p.name} helpText={p.help_text} />
                        </label>
                        <select
                            value={val} onChange={e => setParam(p.id, e.target.value)}
                            className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                        >
                            {p.options?.map((opt: any) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>
                );
            case 'checkbox':
                return (
                    <div key={p.id} className="space-y-1 mt-2">
                        <label className="flex items-center space-x-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={val === true || val === 'true'}
                                onChange={e => setParam(p.id, e.target.checked)}
                                className="w-4 h-4 accent-emerald-500 cursor-pointer"
                            />
                            <ParameterLabel name={p.name} helpText={p.help_text} className="text-sm text-neutral-300 font-medium" />
                        </label>
                    </div>
                );
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
        <Layout title="Chaveiro com SVG">
            <SvgPreviewModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onConfirm={handleModalConfirm}
                onLoadAnother={() => { setIsModalOpen(false); triggerFilePicker(); }}
                svgText={svgText}
                initialThickness={params['line_offset'] ?? 0.5}
            />

            <aside className="w-80 flex-shrink-0 bg-neutral-950 border-r border-neutral-800 flex flex-col">
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {!config && <p className="text-sm text-neutral-600 animate-pulse">Carregando configurações...</p>}
                    {config && (
                        <>
                            {/* Seção de Texto */}
                            <div className="space-y-4 pb-1">
                                <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-widest flex items-center gap-2">
                                    <Sliders className="w-3.5 h-3.5" /> Texto
                                </h2>
                                {config.parameters?.map(renderParam)}
                            </div>

                            {/* Seção de Upload SVG */}
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
                                                className="w-full border-2 border-emerald-700/50 hover:border-emerald-500 rounded-lg px-3 py-2 text-center cursor-pointer transition-colors bg-neutral-900/50"
                                            >
                                                <span className="text-emerald-400 font-medium text-sm truncate block">
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
                                            className="w-full border-2 border-dashed border-neutral-700 hover:border-emerald-500 rounded-lg p-4 text-center cursor-pointer transition-colors bg-neutral-950/50"
                                        >
                                            <Upload className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
                                            <span className="text-emerald-400 font-medium text-sm block">Selecionar arquivo SVG</span>
                                            <span className="text-xs text-neutral-500">Será exibido à direita do texto</span>
                                        </button>
                                    )}
                                    {/* Parâmetros da seção Arte SVG (art_height, svg_gap, offsets) */}
                                    {config.sections
                                        ?.find((s: any) => s.name === 'Arte SVG')
                                        ?.parameters?.map(renderParam)}
                                </div>
                            </div>

                            {/* Demais seções (exceto Arte SVG e Cores, que são tratadas separadamente) */}
                            {mainSections
                                .filter((s: any) => s.name !== 'Arte SVG')
                                .map(renderAccordionSection)}

                            {colorsSection && renderAccordionSection(colorsSection)}
                        </>
                    )}
                    {error && (
                        <div className="bg-red-950 border border-red-800 rounded-lg p-3 text-sm text-red-300">{error}</div>
                    )}
                    <ThinWallWarnings warnings={warnings} />
                </div>

                <div className="p-4 border-t border-neutral-800 bg-neutral-950 space-y-2">
                    <div className="flex gap-2">
                        <button
                            onClick={handleGenerate}
                            disabled={isGenerating || !config || !svgPreview}
                            className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded shadow-lg transition-all"
                        >
                            {isGenerating ? 'Gerando...' : 'Gerar Chaveiro 3D'}
                        </button>
                        <ClearCacheButton isClearingCache={isClearingCache} isGenerating={isGenerating} onClick={handleClearCache} />
                    </div>
                    {!svgPreview && (
                        <p className="text-xs text-neutral-500 text-center">Carregue um SVG para habilitar a geração</p>
                    )}
                </div>
            </aside>

            <section className="flex-1 p-4 relative min-w-0 min-h-0 flex flex-col gap-3">
                <div className="flex-1 relative min-h-0">
                    <div className="absolute inset-0">
                        <Viewer3D
                            carimbBaseUrl={baseUrl}
                            carimbArteUrl={lettersUrl}
                            cortadorUrl={null}
                            isGenerating={isGenerating}
                            artColor={(params['letters_color'] as string) ?? '#FFFFFF'}
                            modelColor={(params['base_color'] as string) ?? '#1B40D1'}
                            modelType="default"
                            highlightArte={thinWallParts.length > 0}
                        />
                    </div>
                </div>
                {tmfUrl && (
                    <div className="flex-shrink-0 flex flex-col items-center gap-1">
                        <CacheBadge fromCache={fromCache} />
                        <button
                            onClick={() => downloadBlob(tmfUrl!, 'chaveiro_com_svg_multicolor.3mf')}
                            className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg shadow-lg text-sm transition-colors"
                        >
                            Baixar 3MF
                        </button>
                    </div>
                )}
            </section>
        </Layout>
    );
}
