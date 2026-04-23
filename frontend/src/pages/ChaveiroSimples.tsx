import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Sliders, ChevronDown } from 'lucide-react';
import { Layout } from '../components/ui/Layout';
import { BambuColorPicker } from '../components/ui/BambuColorPicker';
import { ParameterLabel } from '../components/ui/ParameterLabel';
import Viewer3D from '../components/ui/Viewer3D';
import { useCacheManagement } from '../hooks/useCacheManagement';
import { CacheBadge, ClearCacheButton } from '../components/ui/CacheControls';
import { Preview2D } from '../components/ui/Preview2D';
import { useGoogleFont } from '../hooks/useGoogleFont';
import { FontPicker } from '../components/ui/FontPicker';
import { BatchGenerationModal, type BatchNameEntry } from '../components/ui/BatchGenerationModal';

function ChaveiroPreviewRenderer({ params }: { params: Record<string, any> }) {
    const text = params['text_line_1'] || 'Verônica';
    const text2 = params['text_line_2'] || '';
    const rawFontName = params['font_name'] || 'Chewy:style=Regular';
    const fontFamily = rawFontName.split(':')[0];
    const textSize = Number(params['text_size_1']) || 12;
    const textSize2 = Number(params['text_size_2']) || 8;
    const lineSpacing = Number(params['line_spacing']) || 1.0;
    const margin = Number(params['outline_margin']) || 2.3;
    const spacing = Number(params['spacing']) || 1.0;
    const ringOuter = (Number(params['ring_outer_diameter']) || 6) / 2;
    const ringInner = (Number(params['ring_inner_diameter']) || 3) / 2;
    const ringOffsetX = Number(params['ring_offset_x']) || -1;
    const ringOffsetY = Number(params['ring_offset_y']) || 6;
    const baseColor = params['base_color'] || '#1B40D1';
    const lettersColor = params['letters_color'] || '#FFFFFF';

    // Posição Y de cada linha (espelhando lógica do SCAD — SVG tem Y invertido)
    const hasLine2 = text2.trim() !== '';
    const lineY1 = hasLine2 ? -(textSize2 * lineSpacing * 0.6) : 0;
    const lineY2 = hasLine2 ? (textSize * lineSpacing * 0.6) : 0;

    const [textBBox, setTextBBox] = useState({ width: 0, x: 0, y: 0, height: 0 });
    const [text2BBox, setText2BBox] = useState({ width: 0, x: 0, y: 0, height: 0 });
    const textRef = useRef<SVGTextElement>(null);
    const text2Ref = useRef<SVGTextElement>(null);

    useGoogleFont(fontFamily);

    useEffect(() => {
        let isActive = true;
        let timeoutId: any;
        const measure = () => {
            if (!isActive) return;
            if (textRef.current) {
                const bbox = textRef.current.getBBox();
                setTextBBox({ width: bbox.width, x: bbox.x, y: bbox.y, height: bbox.height });
            }
            if (text2Ref.current) {
                const bbox = text2Ref.current.getBBox();
                setText2BBox({ width: bbox.width, x: bbox.x, y: bbox.y, height: bbox.height });
            }
        };

        measure();

        if (document.fonts && fontFamily) {
            document.fonts.load(`12px "${fontFamily.split(':')[0]}"`).then(() => {
                measure();
                timeoutId = setTimeout(measure, 150);
            });
        }

        const observer = new ResizeObserver(measure);
        if (textRef.current) observer.observe(textRef.current);
        if (text2Ref.current) observer.observe(text2Ref.current);

        return () => {
            isActive = false;
            clearTimeout(timeoutId);
            observer.disconnect();
        };
    }, [text, text2, fontFamily, textSize, textSize2, spacing, lineSpacing]);

    // Bounds combinando as duas linhas
    const allBBoxes = [textBBox, ...(hasLine2 ? [text2BBox] : [])];
    const minX = Math.min(...allBBoxes.map(b => b.x));
    const minY = Math.min(...allBBoxes.map(b => b.y));
    const maxX = Math.max(...allBBoxes.map(b => b.x + b.width));
    const maxY = Math.max(...allBBoxes.map(b => b.y + b.height));

    const outlineLeftEdge = (minX || textBBox.x) - margin;
    const ringCx = outlineLeftEdge + ringOffsetX;
    const contentCy = (minY + maxY) / 2;
    const ringCy = contentCy - ringOffsetY;

    const leftBound = Math.min(outlineLeftEdge, ringCx - ringOuter) - 2;
    const rightBound = Math.max(maxX + margin, ringCx + ringOuter) + 2;
    const topBound = Math.min(minY - margin, ringCy - ringOuter) - 2;
    const bottomBound = Math.max(maxY + margin, ringCy + ringOuter) + 2;
    
    const vBoxW = Math.max(rightBound - leftBound, 10);
    const vBoxH = Math.max(bottomBound - topBound, 10);

    return (
        <svg viewBox={`${leftBound} ${topBound} ${vBoxW} ${vBoxH}`} className="w-full h-full" style={{ fontFamily }}>
            <defs>
                <mask id="chaveiro-hole">
                    <rect x="-5000" y="-5000" width="10000" height="10000" fill="white" />
                    <circle cx={ringCx} cy={ringCy} r={ringInner} fill="black" />
                </mask>
            </defs>
            <g>
                <g mask="url(#chaveiro-hole)">
                    {/* Base outline: stroke imita offset(r) do OpenSCAD */}
                    <text 
                        x="0" 
                        y={lineY1}
                        dominantBaseline="central" 
                        textAnchor="middle"
                        fontSize={textSize}
                        letterSpacing={spacing > 1.0 ? spacing : 0} 
                        fill={baseColor}
                        stroke={baseColor}
                        strokeWidth={margin * 2}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                    >
                        {text}
                    </text>
                    {hasLine2 && (
                        <text 
                            x="0" 
                            y={lineY2}
                            dominantBaseline="central" 
                            textAnchor="middle"
                            fontSize={textSize2}
                            letterSpacing={spacing > 1.0 ? spacing : 0} 
                            fill={baseColor}
                            stroke={baseColor}
                            strokeWidth={margin * 2}
                            strokeLinejoin="round"
                            strokeLinecap="round"
                        >
                            {text2}
                        </text>
                    )}
                    <circle cx={ringCx} cy={ringCy} r={ringOuter} fill={baseColor} />
                </g>
                <g>
                    {/* Letras em relevo */}
                    <text 
                        ref={textRef}
                        x="0" 
                        y={lineY1}
                        dominantBaseline="central" 
                        textAnchor="middle"
                        fontSize={textSize}
                        letterSpacing={spacing > 1.0 ? spacing : 0} 
                        fill={lettersColor}
                    >
                        {text}
                    </text>
                    {hasLine2 && (
                        <text 
                            ref={text2Ref}
                            x="0" 
                            y={lineY2}
                            dominantBaseline="central" 
                            textAnchor="middle"
                            fontSize={textSize2}
                            letterSpacing={spacing > 1.0 ? spacing : 0} 
                            fill={lettersColor}
                        >
                            {text2}
                        </text>
                    )}
                </g>
                <circle cx={ringCx} cy={ringCy} r={ringInner} fill="transparent" stroke="rgba(255,255,255,0.2)" strokeWidth={0.5} />
            </g>
        </svg>
    );
}

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

export default function ChaveiroSimples() {
    const [config, setConfig] = useState<any>(null);
    const [params, setParams] = useState<Record<string, any>>({});
    const [isGenerating, setIsGenerating] = useState(false);
    
    const [baseUrl, setBaseUrl] = useState<string | null>(null);
    const [lettersUrl, setLettersUrl] = useState<string | null>(null);
    const [tmfUrl, setTmfUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    
    const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

    const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
    const [batchProgress, setBatchProgress] = useState<{done: number, total: number} | null>(null);
    const [batchTmfUrl, setBatchTmfUrl] = useState<string | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const { fromCache, setFromCache, isClearingCache, clearCache } = useCacheManagement();

    const handleClearCache = () => clearCache(() => {
        setTmfUrl(null); setBaseUrl(null); setLettersUrl(null);
        setBatchTmfUrl(null); setBatchProgress(null);
    });

    useEffect(() => {
        axios.get(`${API_BASE}/api/models/chaveiro_simples/config`)
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

    const toggleSection = (name: string) => setOpenSections(prev => ({ ...prev, [name]: !prev[name] }));
    const setParam = (id: string, val: any) => setParams(prev => ({ ...prev, [id]: val }));

    const handleGenerate = async () => {
        setIsGenerating(true);
        setError(null); setBaseUrl(null); setLettersUrl(null); setTmfUrl(null); setFromCache(null);
        try {
            const form = new FormData();
            Object.entries(params).forEach(([k, v]) => form.append(k, String(v ?? '')));
            const res = await axios.post(`${API_BASE}/api/generate_parametric/chaveiro_simples`, form);
            if (res.data?.files) {
                if (res.data.files.base) setBaseUrl(`${API_BASE}${res.data.files.base}`);
                if (res.data.files.letters) setLettersUrl(`${API_BASE}${res.data.files.letters}`);
                if (res.data.files['3mf']) setTmfUrl(`${API_BASE}${res.data.files['3mf']}`);
                setFromCache(res.data.from_cache ?? false);
            }
        } catch (err: any) {
            setError(err?.response?.data?.error ?? 'Erro desconhecido');
        } finally {
            setIsGenerating(false);
        }
    };

    useEffect(() => {
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, []);

    const handleBatchGenerate = async (rows: BatchNameEntry[]) => {
        if (rows.length === 0) return;
        if (pollRef.current) clearInterval(pollRef.current);
        setBatchProgress({ done: 0, total: rows.length }); setBatchTmfUrl(null); setError(null);
        try {
            const form = new FormData();
            form.append('names', JSON.stringify(rows));
            Object.entries(params)
                .filter(([k]) => k !== 'text_line_1')
                .forEach(([k, v]) => form.append(k, String(v ?? '')));
            const res = await axios.post(`${API_BASE}/api/generate_batch/chaveiro_simples`, form);
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
            case 'color':
                const extField = p.id === 'base_color' ? 'extrusor_base' : 'extrusor_letras';
                const extVal = params[extField] ?? (p.id === 'base_color' ? 1 : 2);
                return (
                    <BambuColorPicker
                        key={p.id} label={p.name} helpText={p.help_text} color={val} extruder={extVal}
                        onChangeColor={(newCol) => setParam(p.id, newCol)}
                        onChangeExtruder={(newExt) => setParam(extField, newExt)}
                    />
                );
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

    const mainSections = config?.sections?.filter((s: any) => s.name !== 'Cores') ?? [];
    const colorsSection = config?.sections?.find((s: any) => s.name === 'Cores');

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

    return (
        <Layout title="Chaveiro Simples">
            <aside className="w-80 flex-shrink-0 bg-neutral-950 border-r border-neutral-800 flex flex-col">
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {!config && <p className="text-sm text-neutral-600 animate-pulse">Carregando configurações...</p>}
                    {config && (
                        <>
                            <div className="space-y-4 pb-1">
                                <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-widest flex items-center gap-2">
                                    <Sliders className="w-3.5 h-3.5" /> Texto
                                </h2>
                                {config.parameters?.map(renderParam)}
                            </div>
                            {mainSections.map(renderAccordionSection)}
                            {colorsSection && renderAccordionSection(colorsSection)}
                        </>
                    )}
                    {error && (
                        <div className="bg-red-950 border border-red-800 rounded-lg p-3 text-sm text-red-300">{error}</div>
                    )}
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
                            carimbBaseUrl={baseUrl}
                            carimbArteUrl={lettersUrl}
                            cortadorUrl={null}
                            isGenerating={isGenerating}
                            artColor={(params['letters_color'] as string) ?? '#FFFFFF'}
                            modelColor={(params['base_color'] as string) ?? '#1B40D1'}
                            modelType="default"
                        />
                        <Preview2D>
                            <ChaveiroPreviewRenderer params={params} />
                        </Preview2D>
                    </div>
                </div>
                {tmfUrl && (
                    <div className="flex-shrink-0 flex flex-col items-center gap-1">
                        <CacheBadge fromCache={fromCache} />
                        <button
                            onClick={() => downloadBlob(tmfUrl!, 'chaveiro_simples_multicolor.3mf')}
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
                    if (batchTmfUrl) {
                        downloadBlob(batchTmfUrl, 'chaveiro_simples_lote.zip');
                    }
                }}
                defaultExtrusorBase={Number(params['extrusor_base']) || 1}
                defaultExtrusorLetras={Number(params['extrusor_letras']) || 2}
                isGenerating={batchProgress !== null && !batchTmfUrl}
                progress={batchProgress}
                downloadUrl={batchTmfUrl}
                error={error}
            />
        </Layout>
    );
}
