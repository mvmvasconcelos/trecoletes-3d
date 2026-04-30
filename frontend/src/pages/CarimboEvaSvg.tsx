import React, { useState, useRef } from 'react';
import axios from 'axios';
import { Upload, Sliders, Circle, Square, Download, Leaf } from 'lucide-react';
import { Layout } from '../components/ui/Layout';
import { SvgPreviewModal } from '../components/ui/SvgPreviewModal';
import Viewer3D from '../components/ui/Viewer3D';
import { useCacheManagement } from '../hooks/useCacheManagement';
import { CacheBadge, ClearCacheButton } from '../components/ui/CacheControls';
import { ParameterLabel } from '../components/ui/ParameterLabel';
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

type MoldShape = 'circle' | 'rectangle' | 'organic';

export default function CarimboEvaSvg() {
    const [isGenerating, setIsGenerating] = useState(false);
    const [seguradorUrl, setSeguradorUrl] = useState<string | null>(null);
    const [moldeBaseUrl, setMoldeBaseUrl] = useState<string | null>(null);
    const [moldeArteUrl, setMoldeArteUrl] = useState<string | null>(null);
    const [formaUrl, setFormaUrl] = useState<string | null>(null);
    const [tmfUrl, setTmfUrl] = useState<string | null>(null);
    const { fromCache, setFromCache, isClearingCache, clearCache } = useCacheManagement();

    const handleClearCache = () => clearCache(() => {
        setSeguradorUrl(null); setMoldeBaseUrl(null); setMoldeArteUrl(null); setFormaUrl(null); setTmfUrl(null);
    });

    const [artColor, setArtColor] = useState('#f5f0e8');
    const [modelColor, setModelColor] = useState('#34d399');

    const [svgFile, setSvgFile] = useState<File | null>(null);
    const [svgText, setSvgText] = useState<string | null>(null);

    const [modelConfig, setModelConfig] = useState<any>(null);
    const [dynamicParams, setDynamicParams] = useState<Record<string, any>>({
        line_offset: 0.5,
        form_margin: 0.4,
        art_relief_positive: true,
    });
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isConvertingPng, setIsConvertingPng] = useState(false);

    // Dimensões da arte
    const [artHeight, setArtHeight] = useState(70);
    const [artWidth, setArtWidth] = useState(70);
    const [lockAspectRatio, setLockAspectRatio] = useState(true);
    const [svgAspectRatio, setSvgAspectRatio] = useState(1.0);

    // Dimensões e formato do molde/forma
    const [moldShape, setMoldShape] = useState<MoldShape>('rectangle');

    const [svgPreview, setSvgPreview] = useState<{ originalSvg: string; thickenedSvg: string; silhouetteSvg: string; } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    React.useEffect(() => {
        let isMounted = true;
        const fetchConfig = async () => {
            try {
                const res = await axios.get(`${API_BASE}/api/models/carimbo_eva_svg/config`);
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

    const handleDynamicParamChange = (id: string, value: any) =>
        setDynamicParams(prev => ({ ...prev, [id]: value }));

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
            const currentLineOffset = dynamicParams['line_offset'] ?? 0.5;
            const processed = await processSvgFile(text, currentLineOffset, 3.0);
            setSvgPreview(processed);
            if (processed && processed.width > 0 && processed.height > 0) {
                const natW = processed.width;
                const natH = processed.height;
                const ratio = natW / natH;
                setSvgAspectRatio(ratio);
                const newArtW = 70;
                const newArtH = Math.round((70 / ratio) * 10) / 10;
                setArtWidth(newArtW);
                setArtHeight(newArtH);
            }
            setIsModalOpen(true);
        } catch (err) {
            console.error("SVG Processing Error:", err);
            alert("Erro ao processar o arquivo SVG.");
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
        const reader = new FileReader();
        reader.onload = async (evt) => {
            const text = evt.target?.result as string;
            if (!text) return;
            await _processSvgText(text);
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
        setSeguradorUrl(null); setMoldeBaseUrl(null); setMoldeArteUrl(null); setFormaUrl(null); setTmfUrl(null); setFromCache(null);
        try {
            const formData = new FormData();
            formData.append('linhas_svg', new Blob([svgPreview.thickenedSvg], { type: 'image/svg+xml' }), 'linhas.svg');
            formData.append('silhueta_svg', new Blob([svgPreview.silhouetteSvg], { type: 'image/svg+xml' }), 'silhueta.svg');
            formData.append('art_width', artWidth.toString());
            formData.append('art_height', artHeight.toString());
            formData.append('mold_shape', moldShape);
            formData.append('mold_width', moldWidth.toString());
            formData.append('mold_height', moldHeight.toString());
            formData.append('mold_border', moldBorder.toString());

            if (modelConfig && modelConfig.parameters) {
                modelConfig.parameters.forEach((param: any) => {
                    let val = dynamicParams[param.id] ?? param.default;
                    if (param.scad_multiplier) val = val * param.scad_multiplier;
                    formData.append(param.id, val.toString());
                });
            }

            const res = await axios.post(`${API_BASE}/api/generate/carimbo_eva_svg`, formData);
            if (res.data?.files) {
                if (res.data.files.segurador) setSeguradorUrl(`${API_BASE}${res.data.files.segurador}`);
                if (res.data.files.molde_base) setMoldeBaseUrl(`${API_BASE}${res.data.files.molde_base}`);
                if (res.data.files.molde_arte) setMoldeArteUrl(`${API_BASE}${res.data.files.molde_arte}`);
                if (res.data.files.forma) setFormaUrl(`${API_BASE}${res.data.files.forma}`);
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

    // Pinos fixos: 2mm da borda do pino ao molde, 2mm da borda do pino à silhueta, diâmetro 5mm
    const PIN_DIAMETER = 5;
    const PIN_BORDER_GAP = 2;  // mm entre borda do pino e borda do molde
    const PIN_ART_GAP = 2;     // mm entre borda do pino e silhueta (furo da forma)
    const PIN_INSET = PIN_DIAMETER / 2 + PIN_BORDER_GAP;  // 4.5mm — centro do pino até borda
    const formMargin = dynamicParams['form_margin'] ?? 1.0;
    // mold_border calculado automaticamente: espaço mínimo para acomodar os pinos
    const moldBorder = Math.round((formMargin + PIN_DIAMETER / 2 + PIN_ART_GAP + PIN_INSET) * 10) / 10;

    // Posição do centro do pino nos cardinais (círculo/orgânico)
    const pinX = artWidth  / 2 + formMargin + PIN_DIAMETER / 2 + PIN_ART_GAP;
    const pinY = artHeight / 2 + formMargin + PIN_DIAMETER / 2 + PIN_ART_GAP;

    let moldWidth: number;
    let moldHeight: number;
    if (moldShape === 'circle') {
        // Cardinais: raio = maior eixo do pino + PIN_INSET
        const r = Math.max(pinX, pinY) + PIN_INSET;
        const d = Math.round(r * 2 * 10) / 10;
        moldWidth = d;
        moldHeight = d;
    } else if (moldShape === 'organic') {
        // Estimativa do bounding box: arte + 2×mold_border
        moldWidth  = Math.round((artWidth  + 2 * moldBorder) * 10) / 10;
        moldHeight = Math.round((artHeight + 2 * moldBorder) * 10) / 10;
    } else {
        // Retângulo: cantos, mold_dim = 2 × (pinCenter + PIN_INSET)
        moldWidth  = Math.round((pinX + PIN_INSET) * 2 * 10) / 10;
        moldHeight = Math.round((pinY + PIN_INSET) * 2 * 10) / 10;
    }

    return (
        <Layout title="Carimbo EVA SVG">
            <SvgPreviewModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onConfirm={handleModalConfirm}
                onLoadAnother={() => { setIsModalOpen(false); triggerFilePicker(); }}
                svgText={svgText}
                initialThickness={dynamicParams['line_offset'] ?? 0.5}
            />

            <aside className="w-[400px] flex-shrink-0 bg-neutral-900 border-r border-neutral-800 flex flex-col overflow-y-auto">
                <div className="p-6 space-y-8">

                    {/* Arte Principal */}
                    <div className="space-y-3">
                        <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                            <Upload className="w-4 h-4" /> Arte Principal
                        </h2>
                        <input ref={fileInputRef} type="file" className="hidden" accept=".svg,.png" onChange={handleSvgUpload} />
                        {isConvertingPng ? (
                            <div className="w-full border-2 border-dashed border-amber-700/50 rounded-lg p-4 text-center bg-neutral-950/50">
                                <span className="text-amber-400 text-sm animate-pulse">Convertendo PNG para SVG...</span>
                            </div>
                        ) : svgPreview ? (
                            <button
                                onClick={() => setIsModalOpen(true)}
                                className="w-full block border-2 border-emerald-700/50 hover:border-emerald-500 rounded-lg p-4 text-center cursor-pointer transition-colors bg-neutral-950/50"
                            >
                                <span className="text-emerald-400 font-medium text-sm">{svgFile?.name || 'Arte carregada'}</span>
                            </button>
                        ) : (
                            <button
                                onClick={triggerFilePicker}
                                className="w-full block border-2 border-dashed border-neutral-700 hover:border-emerald-500 rounded-lg p-4 text-center cursor-pointer transition-colors bg-neutral-950/50"
                            >
                                <span className="text-emerald-400 font-medium text-sm">Selecionar SVG ou PNG</span>
                            </button>
                        )}
                        {svgPreview && (
                            <div className="relative rounded-lg overflow-hidden border border-neutral-700" style={{ backgroundColor: '#f0ebe3' }}>
                                <div
                                    dangerouslySetInnerHTML={{ __html: svgPreview.thickenedSvg }}
                                    className="w-full [&>svg]:w-full [&>svg]:h-auto [&>svg]:max-h-48 [&>svg]:object-contain p-2"
                                />
                            </div>
                        )}
                    </div>

                    {/* Configurações */}
                    <div className="space-y-4">
                        <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                            <Sliders className="w-4 h-4" /> Configurações
                        </h2>

                        {/* Tamanho da Arte */}
                        <div className="space-y-2">
                            <label className="text-sm text-neutral-300 font-medium">Tamanho da Arte</label>
                            <div className="flex items-center gap-2">
                                <div className="flex-1 space-y-1">
                                    <span className="text-xs text-neutral-500">Altura</span>
                                    <div className="flex items-center gap-1">
                                        <input
                                            type="number" min="10" max="300" step="1"
                                            value={artHeight}
                                            onChange={e => handleHeightChange(parseFloat(e.target.value) || 0)}
                                            className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
                                        />
                                        <span className="text-xs text-neutral-500">mm</span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setLockAspectRatio(l => !l)}
                                    className={`self-center mt-4 p-1.5 rounded border transition-colors ${lockAspectRatio ? 'bg-emerald-700 border-emerald-500 text-white' : 'bg-neutral-800 border-neutral-700 text-neutral-500'}`}
                                    title={lockAspectRatio ? 'Travar proporção' : 'Destravar proporção'}
                                >
                                    {lockAspectRatio ? '🔒' : '🔓'}
                                </button>
                                <div className="flex-1 space-y-1">
                                    <span className="text-xs text-neutral-500">Largura</span>
                                    <div className="flex items-center gap-1">
                                        <input
                                            type="number" min="10" max="300" step="1"
                                            value={artWidth}
                                            onChange={e => handleWidthChange(parseFloat(e.target.value) || 0)}
                                            className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
                                        />
                                        <span className="text-xs text-neutral-500">mm</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Formato do Molde */}
                        <div className="space-y-2">
                            <label className="text-sm text-neutral-300 font-medium">Formato do Molde / Forma</label>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setMoldShape('rectangle')}
                                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border font-medium text-sm transition-all ${moldShape === 'rectangle' ? 'bg-emerald-700 border-emerald-500 text-white' : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:border-neutral-500'}`}
                                >
                                    <Square className="w-4 h-4" />
                                    Retângulo
                                </button>
                                <button
                                    onClick={() => setMoldShape('circle')}
                                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border font-medium text-sm transition-all ${moldShape === 'circle' ? 'bg-emerald-700 border-emerald-500 text-white' : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:border-neutral-500'}`}
                                >
                                    <Circle className="w-4 h-4" />
                                    Círculo
                                </button>
                                <button
                                    onClick={() => setMoldShape('organic')}
                                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border font-medium text-sm transition-all ${moldShape === 'organic' ? 'bg-emerald-700 border-emerald-500 text-white' : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:border-neutral-500'}`}
                                >
                                    <Leaf className="w-4 h-4" />
                                    Orgânico
                                </button>
                            </div>
                        </div>

                        {/* Dimensões do molde (calculadas automaticamente) */}
                        <div className="space-y-1">
                            <span className="text-sm text-neutral-300 font-medium">Tamanho do Molde / Forma</span>
                            <div className="flex items-center gap-2 bg-neutral-800/60 border border-neutral-700 rounded px-3 py-2">
                                {moldShape === 'circle' ? (
                                    <span className="text-xs text-neutral-500 flex-1">
                                        Ø <span className="text-emerald-400 font-mono">{moldWidth} mm</span>
                                    </span>
                                ) : (
                                    <>
                                        <span className="text-xs text-neutral-500 flex-1">
                                            Altura: <span className="text-emerald-400 font-mono">{moldHeight} mm</span>
                                        </span>
                                        <span className="text-xs text-neutral-500 flex-1">
                                            Largura: <span className="text-emerald-400 font-mono">{moldWidth} mm</span>
                                        </span>
                                    </>
                                )}
                            </div>
                            <p className="text-xs text-neutral-600">Calculado automaticamente para acomodar os pinos de alinhamento.</p>
                        </div>

                        {/* Parâmetros dinâmicos do config.json */}
                        {modelConfig?.parameters?.filter((p: any) => p.id !== 'line_offset').map((param: any) => {
                            const currentValue = dynamicParams[param.id] ?? param.default;
                            if (param.type === 'boolean') {
                                return (
                                    <div key={param.id} className="space-y-2 pt-2 pb-1">
                                        <label className="flex items-start gap-3 cursor-pointer group">
                                            <input
                                                type="checkbox"
                                                checked={Boolean(currentValue)}
                                                onChange={e => handleDynamicParamChange(param.id, e.target.checked)}
                                                className="w-5 h-5 rounded border-neutral-600 bg-neutral-800 accent-emerald-500"
                                            />
                                            <ParameterLabel name={param.name} helpText={param.help_text} className="text-sm font-medium text-neutral-200" />
                                        </label>
                                    </div>
                                );
                            }
                            return (
                                <div key={param.id} className="space-y-2">
                                    <label className="flex justify-between text-sm">
                                        <ParameterLabel name={param.name} helpText={param.help_text} />
                                        <span className="text-emerald-400 font-mono">{Number(currentValue).toFixed(1)}{param.unit}</span>
                                    </label>
                                    <input
                                        type="range"
                                        min={param.min} max={param.max} step={param.step}
                                        value={Number(currentValue)}
                                        onChange={e => handleDynamicParamChange(param.id, parseFloat(e.target.value))}
                                        className="w-full accent-emerald-500"
                                    />
                                </div>
                            );
                        })}

                        {/* Cores */}
                        <div className="grid grid-cols-2 gap-4 mt-2">
                            {[
                                { label: 'Cor Modelo', color: modelColor, setter: setModelColor },
                                { label: 'Cor Arte', color: artColor, setter: setArtColor },
                            ].map(({ label, color, setter }) => (
                                <div key={label} className="flex flex-col gap-1">
                                    <label className="text-xs text-neutral-500">{label}</label>
                                    <input
                                        type="color"
                                        value={color}
                                        onChange={e => setter(e.target.value)}
                                        className="w-full h-8 cursor-pointer rounded bg-neutral-900 border-none"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="mt-auto p-4 border-t border-neutral-800 bg-neutral-950">
                    <div className="flex gap-2">
                        <button
                            onClick={handleGenerateClick}
                            disabled={!svgFile || isGenerating}
                            className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded shadow-lg transition-all"
                        >
                            {isGenerating ? 'Gerando OpenSCAD...' : 'Gerar Peças 3D'}
                        </button>
                        <ClearCacheButton isClearingCache={isClearingCache} isGenerating={isGenerating} onClick={handleClearCache} />
                    </div>
                </div>
            </aside>

            <section className="flex-1 p-4 relative min-w-0 min-h-0 flex flex-col gap-3">
                <div className="flex-1 relative min-h-0">
                    <div className="absolute inset-0">
                        <Viewer3D
                            carimbBaseUrl={moldeBaseUrl}
                            carimbArteUrl={moldeArteUrl}
                            cortadorUrl={null}
                            isGenerating={isGenerating}
                            artColor={artColor}
                            modelColor={modelColor}
                            modelType="default"
                            extraMeshes={[
                                ...(formaUrl ? [{ url: formaUrl, color: '#7dd3fc', offset: [0, 0, 2] as [number, number, number] }] : []),
                                ...(seguradorUrl ? [{ url: seguradorUrl, color: modelColor, offset: [0, moldHeight + 15, 0] as [number, number, number] }] : []),
                            ]}
                        />
                    </div>
                </div>
                {tmfUrl && (
                    <div className="flex-shrink-0 space-y-2">
                        <div className="flex items-center justify-between">
                            <CacheBadge fromCache={fromCache} />
                        </div>
                        <button
                            onClick={() => downloadBlob(tmfUrl!, 'carimbo_eva_svg_all.3mf')}
                            className="w-full flex items-center justify-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg shadow-lg text-sm transition-colors"
                        >
                            <Download className="w-4 h-4" /> Baixar 3MF (todas as peças)
                        </button>
                    </div>
                )}
            </section>
        </Layout>
    );
}
