import React, { useState, useRef } from 'react';
import axios from 'axios';
import { Upload, Sliders } from 'lucide-react';
import { Layout } from '../components/ui/Layout';
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

export default function CortadorBolachaFormato() {
    const [isGenerating, setIsGenerating] = useState(false);
    const [cortadorUrl, setCortadorUrl] = useState<string | null>(null);
    const [tmfUrl, setTmfUrl] = useState<string | null>(null);
    const { fromCache, setFromCache, isClearingCache, clearCache } = useCacheManagement();

    const handleClearCache = () => clearCache(() => {
        setCortadorUrl(null); setTmfUrl(null);
    });

    const [modelColor, setModelColor] = useState('#34d399');

    const [svgFile, setSvgFile] = useState<File | null>(null);
    const [modelConfig, setModelConfig] = useState<any>(null);
    const [dynamicParams, setDynamicParams] = useState<Record<string, any>>({});

    const [artHeight, setArtHeight] = useState(50);
    const [artWidth, setArtWidth] = useState(50);
    const [lockAspectRatio, setLockAspectRatio] = useState(true);
    const [svgAspectRatio, setSvgAspectRatio] = useState(1.0);

    const [svgPreview, setSvgPreview] = useState<{
        silhouetteSvg: string;
        thickenedSvg: string;
        width: number;
        height: number;
    } | null>(null);
    const [isConvertingPng, setIsConvertingPng] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    React.useEffect(() => {
        let isMounted = true;
        const fetchConfig = async () => {
            try {
                const res = await axios.get(`${API_BASE}/api/models/cortador_bolacha_formato/config`);
                if (isMounted && res.data?.parameters) {
                    setModelConfig(res.data);
                    const initialParams: Record<string, any> = {};
                    res.data.parameters.forEach((param: any) => {
                        initialParams[param.id] = param.default;
                    });
                    setDynamicParams(initialParams);
                }
            } catch (err) {
                console.error('Erro ao carregar configuração:', err);
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
        if (lockAspectRatio) setArtHeight(Math.round((val / svgAspectRatio) * 10) / 10);
    };

    const _processSvgText = async (text: string) => {
        try {
            const processed = await processSvgFile(text, 0, 3.0);
            setSvgPreview(processed);
            if (processed && processed.width > 0 && processed.height > 0) {
                const ratio = processed.width / processed.height;
                setSvgAspectRatio(ratio);
                setArtWidth(50);
                setArtHeight(Math.round((50 / ratio) * 10) / 10);
            }
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
        const reader = new FileReader();
        reader.onload = async (evt) => {
            const text = evt.target?.result as string;
            if (!text) return;
            await _processSvgText(text);
        };
        reader.readAsText(file);
    };

    const handleGenerateClick = async () => {
        if (!svgPreview) return;
        setIsGenerating(true);
        setCortadorUrl(null);
        setTmfUrl(null);
        setFromCache(null);
        try {
            const formData = new FormData();
            // O modelo SCAD usa apenas silhueta_svg.
            // linhas_svg é obrigatório pela API genérica mas não utilizado neste modelo.
            formData.append(
                'linhas_svg',
                new Blob([svgPreview.silhouetteSvg], { type: 'image/svg+xml' }),
                'linhas.svg',
            );
            formData.append(
                'silhueta_svg',
                new Blob([svgPreview.silhouetteSvg], { type: 'image/svg+xml' }),
                'silhueta.svg',
            );
            formData.append('art_width', artWidth.toString());
            formData.append('art_height', artHeight.toString());

            if (modelConfig?.parameters) {
                modelConfig.parameters.forEach((param: any) => {
                    const val = dynamicParams[param.id] ?? param.default;
                    formData.append(param.id, val.toString());
                });
            }

            const res = await axios.post(
                `${API_BASE}/api/generate/cortador_bolacha_formato`,
                formData,
            );
            if (res.data?.files) {
                if (res.data.files.cortador)
                    setCortadorUrl(`${API_BASE}${res.data.files.cortador}`);
                if (res.data.files['3mf'])
                    setTmfUrl(`${API_BASE}${res.data.files['3mf']}`);
                setFromCache(res.data.from_cache ?? false);
            }
        } catch (err) {
            console.error('Error generating:', err);
            alert('Falha ao gerar o modelo 3D.');
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <Layout title="Cortador por Formato SVG">
            <aside className="w-[400px] flex-shrink-0 bg-neutral-900 border-r border-neutral-800 flex flex-col overflow-y-auto">
                <div className="p-6 space-y-8">

                    {/* Upload do SVG de formato */}
                    <div className="space-y-3">
                        <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                            <Upload className="w-4 h-4" /> Formato do Cortador (SVG)
                        </h2>
                        <p className="text-xs text-neutral-500">
                            A silhueta do SVG define a forma externa do cortador. A parede é esculpida para dentro.
                        </p>
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
                        ) : (
                        <button
                            onClick={triggerFilePicker}
                            className={`w-full block border-2 rounded-lg p-4 text-center cursor-pointer transition-colors bg-neutral-950/50 ${
                                svgPreview
                                    ? 'border-emerald-700/50 hover:border-emerald-500'
                                    : 'border-dashed border-neutral-700 hover:border-emerald-500'
                            }`}
                        >
                            <span className="text-emerald-400 font-medium text-sm">
                                {svgFile?.name || 'Selecionar SVG ou PNG'}
                            </span>
                        </button>
                        )}
                        {svgPreview && (
                            <div
                                className="relative rounded-lg overflow-hidden border border-neutral-700"
                                style={{ backgroundColor: '#f0ebe3' }}
                            >
                                <div
                                    dangerouslySetInnerHTML={{ __html: svgPreview.silhouetteSvg }}
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

                        {/* Dimensões externas */}
                        <div className="space-y-2">
                            <label className="text-sm text-neutral-300 font-medium">
                                Dimensões Externas do Cortador
                            </label>
                            <div className="flex items-center gap-2">
                                <div className="flex-1 space-y-1">
                                    <span className="text-xs text-neutral-500">Altura</span>
                                    <div className="flex items-center gap-1">
                                        <input
                                            type="number"
                                            min="10"
                                            max="300"
                                            step="1"
                                            value={artHeight}
                                            onChange={e => handleHeightChange(parseFloat(e.target.value) || 0)}
                                            className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
                                        />
                                        <span className="text-xs text-neutral-500">mm</span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setLockAspectRatio(l => !l)}
                                    className={`self-center mt-4 p-1.5 rounded border transition-colors ${
                                        lockAspectRatio
                                            ? 'bg-emerald-700 border-emerald-500 text-white'
                                            : 'bg-neutral-800 border-neutral-700 text-neutral-500'
                                    }`}
                                >
                                    {lockAspectRatio ? '🔒' : '🔓'}
                                </button>
                                <div className="flex-1 space-y-1">
                                    <span className="text-xs text-neutral-500">Largura</span>
                                    <div className="flex items-center gap-1">
                                        <input
                                            type="number"
                                            min="10"
                                            max="300"
                                            step="1"
                                            value={artWidth}
                                            onChange={e => handleWidthChange(parseFloat(e.target.value) || 0)}
                                            className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
                                        />
                                        <span className="text-xs text-neutral-500">mm</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Parâmetros dinâmicos do config.json */}
                        {modelConfig?.parameters?.map((param: any) => {
                            const currentValue = dynamicParams[param.id] ?? param.default;
                            if (param.type === 'boolean') {
                                return (
                                    <div key={param.id} className="space-y-2 pt-2 pb-1">
                                        <label className="flex items-start gap-3 cursor-pointer group">
                                            <input
                                                type="checkbox"
                                                checked={Boolean(currentValue)}
                                                onChange={e =>
                                                    handleDynamicParamChange(param.id, e.target.checked)
                                                }
                                                className="w-5 h-5 rounded border-neutral-600 bg-neutral-800 accent-emerald-500"
                                            />
                                            <ParameterLabel
                                                name={param.name}
                                                helpText={param.help_text}
                                                className="text-sm font-medium text-neutral-200"
                                            />
                                        </label>
                                    </div>
                                );
                            }
                            return (
                                <div key={param.id} className="space-y-2">
                                    <label className="flex justify-between text-sm">
                                        <ParameterLabel name={param.name} helpText={param.help_text} />
                                        <span className="text-emerald-400 font-mono">
                                            {Number(currentValue).toFixed(1)}{param.unit}
                                        </span>
                                    </label>
                                    <input
                                        type="range"
                                        min={param.min}
                                        max={param.max}
                                        step={param.step}
                                        value={Number(currentValue)}
                                        onChange={e =>
                                            handleDynamicParamChange(param.id, parseFloat(e.target.value))
                                        }
                                        className="w-full accent-emerald-500"
                                    />
                                </div>
                            );
                        })}

                        {/* Cor do modelo */}
                        <div className="flex flex-col gap-1">
                            <label className="text-xs text-neutral-500">Cor do Modelo</label>
                            <input
                                type="color"
                                value={modelColor}
                                onChange={e => setModelColor(e.target.value)}
                                className="w-full h-8 cursor-pointer rounded bg-neutral-900 border-none"
                            />
                        </div>
                    </div>
                </div>

                {/* Botão de geração */}
                <div className="mt-auto p-4 border-t border-neutral-800 bg-neutral-950">
                    <div className="flex gap-2">
                        <button
                            onClick={handleGenerateClick}
                            disabled={!svgFile || isGenerating}
                            className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded shadow-lg transition-all"
                        >
                            {isGenerating ? 'Gerando OpenSCAD...' : 'Gerar Cortador 3D'}
                        </button>
                        <ClearCacheButton
                            isClearingCache={isClearingCache}
                            isGenerating={isGenerating}
                            onClick={handleClearCache}
                        />
                    </div>
                </div>
            </aside>

            {/* Visualizador 3D */}
            <section className="flex-1 p-4 relative min-w-0 min-h-0 flex flex-col gap-3">
                <div className="flex-1 relative min-h-0">
                    <div className="absolute inset-0">
                        <Viewer3D
                            carimbBaseUrl={null}
                            carimbArteUrl={null}
                            cortadorUrl={cortadorUrl}
                            isGenerating={isGenerating}
                            artColor={modelColor}
                            modelColor={modelColor}
                            modelType="cortador"
                        />
                    </div>
                </div>
                {tmfUrl && (
                    <div className="flex-shrink-0 flex flex-col items-center gap-1">
                        <CacheBadge fromCache={fromCache} />
                        <button
                            onClick={() => downloadBlob(tmfUrl!, 'cortador_bolacha_formato_all.3mf')}
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
