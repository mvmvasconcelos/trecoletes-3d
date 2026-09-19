import React, { useState } from 'react';
import axios from 'axios';
import { Upload, Sliders } from 'lucide-react';
import { Layout } from '../components/ui/Layout';
import { SvgPreviewModal } from '../components/ui/SvgPreviewModal';
import Viewer3D from '../components/ui/Viewer3D';
import { CacheBadge, ClearCacheButton } from '../components/ui/CacheControls';
import { ParameterField } from '../components/ui/ParameterField';
import { useModelGenerate } from '../hooks/useModelGenerate';
import { useSvgUpload } from '../hooks/useSvgUpload';

const MODEL_ID = 'cortador_bolacha';
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

export default function CortadorBolacha() {
    const { config, params, setParam, isGenerating, error, files, fromCache, isClearingCache, clearCache, generate } =
        useModelGenerate(MODEL_ID);

    const [artColor, setArtColor] = useState('#f5f0e8');
    const [modelColor, setModelColor] = useState('#34d399');

    const {
        svgFile, svgText, svgPreview, setSvgPreview,
        artWidth, artHeight,
        lockAspectRatio, setLockAspectRatio,
        isModalOpen, setIsModalOpen, isConvertingPng, fileInputRef,
        triggerFilePicker, handleHeightChange, handleWidthChange, handleSvgUpload,
    } = useSvgUpload({ initialWidth: 70, initialHeight: 70, lineThickness: () => params['line_offset'] ?? 0.5 });

    type CutterShape = 'silhouette' | 'square' | 'circle' | 'rectangle' | 'hexagon' | 'ellipse';
    const [cutterShape, setCutterShape] = useState<CutterShape>('silhouette');
    const [cutterW, setCutterW] = useState(78);
    const [cutterH, setCutterH] = useState(78);
    const [cutterWDraft, setCutterWDraft] = useState('78');
    const [cutterHDraft, setCutterHDraft] = useState('78');

    const currentSilhouetteExp = params['silhouette_exp'] ?? 4.0;
    const minCutterW = artWidth + currentSilhouetteExp * 2;
    const minCutterH = artHeight + currentSilhouetteExp * 2;

    const artDiag = Math.sqrt(artWidth * artWidth + artHeight * artHeight);
    const autoSquareSize = Math.max(artWidth, artHeight) + currentSilhouetteExp * 2;
    const autoCircleHexSize = artDiag + currentSilhouetteExp * 2;
    const isAutoShape = cutterShape === 'square' || cutterShape === 'circle' || cutterShape === 'hexagon';
    const isManualSizeShape = cutterShape === 'rectangle' || cutterShape === 'ellipse';
    const autoSize = cutterShape === 'square' ? autoSquareSize : autoCircleHexSize;

    const effectiveCutterW = isAutoShape ? autoSize : Math.max(cutterW, minCutterW);
    const effectiveCutterH = isAutoShape ? autoSize : Math.max(cutterH, minCutterH);

    // Quando o formato muda para elipse/retângulo, garante que as dimensões respeitam o mínimo
    React.useEffect(() => {
        if (isManualSizeShape) {
            const newW = Math.ceil(Math.max(cutterW, minCutterW));
            const newH = Math.ceil(Math.max(cutterH, minCutterH));
            setCutterW(newW);
            setCutterH(newH);
            setCutterWDraft(newW.toString());
            setCutterHDraft(newH.toString());
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cutterShape]);

    const handleModalConfirm = (processed: any, finalThickness: number) => {
        setSvgPreview(processed);
        setParam('line_offset', finalThickness);
        setIsModalOpen(false);
    };

    const handleGenerateClick = () => {
        if (!svgPreview) return;
        generate(params => {
            const formData = new FormData();
            formData.append('linhas_svg', new Blob([svgPreview.thickenedSvg], { type: 'image/svg+xml' }), 'linhas.svg');
            formData.append('silhueta_svg', new Blob([svgPreview.silhouetteSvg], { type: 'image/svg+xml' }), 'silhueta.svg');
            formData.append('base_height', '2.0');
            formData.append('art_width', artWidth.toString());
            formData.append('art_height', artHeight.toString());
            formData.append('cutter_shape', cutterShape);
            formData.append('cutter_width', effectiveCutterW.toString());
            formData.append('cutter_height', effectiveCutterH.toString());

            if (config && config.parameters) {
                config.parameters.forEach((param: any) => {
                    let val = params[param.id] ?? param.default;
                    if (param.scad_multiplier) val = val * param.scad_multiplier;
                    formData.append(param.id, val.toString());
                });
            }

            return axios.post(`${API_BASE}/api/generate/${MODEL_ID}`, formData);
        });
    };

    return (
        <Layout title="Cortador de Bolacha">
            <SvgPreviewModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onConfirm={handleModalConfirm} onLoadAnother={() => { setIsModalOpen(false); triggerFilePicker(); }} svgText={svgText} initialThickness={params['line_offset'] ?? 0.5} />

            <aside className="w-[400px] flex-shrink-0 bg-neutral-900 border-r border-neutral-800 flex flex-col overflow-y-auto">
                <div className="p-6 space-y-8">
                    <div className="space-y-3">
                        <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-widest flex items-center gap-2"><Upload className="w-4 h-4" /> Arte Principal</h2>
                        <input ref={fileInputRef} type="file" className="hidden" accept=".svg,.png" onChange={handleSvgUpload} />
                        {isConvertingPng ? (
                            <div className="w-full border-2 border-dashed border-amber-700/50 rounded-lg p-4 text-center bg-neutral-950/50">
                                <span className="text-amber-400 text-sm animate-pulse">Convertendo PNG para SVG...</span>
                            </div>
                        ) : svgPreview ? (
                            <button onClick={() => setIsModalOpen(true)} className="w-full block border-2 border-emerald-700/50 hover:border-emerald-500 rounded-lg p-4 text-center cursor-pointer transition-colors bg-neutral-950/50">
                                <span className="text-emerald-400 font-medium text-sm">{svgFile?.name || 'Arte carregada'}</span>
                            </button>
                        ) : (
                            <button onClick={triggerFilePicker} className="w-full block border-2 border-dashed border-neutral-700 hover:border-emerald-500 rounded-lg p-4 text-center cursor-pointer transition-colors bg-neutral-950/50">
                                <span className="text-emerald-400 font-medium text-sm">Selecionar SVG ou PNG</span>
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

                        {config?.parameters?.filter((p: any) => p.id !== 'line_offset').map((param: any) => (
                            <ParameterField key={param.id} parameter={param} value={params[param.id] ?? param.default} onChange={setParam} accent="emerald" />
                        ))}

                        <div className="space-y-2">
                            <label className="text-sm text-neutral-300 font-medium">Formato do Cortador</label>
                            <select value={cutterShape} onChange={e => setCutterShape(e.target.value as CutterShape)} className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white focus:border-emerald-500">
                                <option value="silhouette">Silhueta da arte</option>
                                <option value="square">Quadrado</option>
                                <option value="circle">Círculo</option>
                                <option value="rectangle">Retângulo</option>
                                <option value="hexagon">Hexágono</option>
                                <option value="ellipse">Elipse</option>
                            </select>
                            {isAutoShape && <p className="text-xs text-emerald-500/80">Automático: {autoSize.toFixed(1)} mm</p>}
                            {isManualSizeShape && (
                                <div className="grid grid-cols-2 gap-3 mt-2">
                                    <div className="space-y-1">
                                        <span className="text-xs text-neutral-500">
                                            Largura
                                            <span className="text-amber-500/80"> (mín. {minCutterW.toFixed(0)} mm)</span>
                                        </span>
                                        <div className="flex items-center gap-1">
                                            <input
                                                type="number"
                                                max={300}
                                                step={1}
                                                value={cutterWDraft}
                                                onChange={e => setCutterWDraft(e.target.value)}
                                                onBlur={e => {
                                                    const v = Math.ceil(Math.max(parseFloat(e.target.value) || minCutterW, minCutterW));
                                                    setCutterW(v);
                                                    setCutterWDraft(v.toString());
                                                }}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                                }}
                                                className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
                                            />
                                            <span className="text-xs text-neutral-500">mm</span>
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-xs text-neutral-500">
                                            Altura
                                            <span className="text-amber-500/80"> (mín. {minCutterH.toFixed(0)} mm)</span>
                                        </span>
                                        <div className="flex items-center gap-1">
                                            <input
                                                type="number"
                                                max={300}
                                                step={1}
                                                value={cutterHDraft}
                                                onChange={e => setCutterHDraft(e.target.value)}
                                                onBlur={e => {
                                                    const v = Math.ceil(Math.max(parseFloat(e.target.value) || minCutterH, minCutterH));
                                                    setCutterH(v);
                                                    setCutterHDraft(v.toString());
                                                }}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                                }}
                                                className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
                                            />
                                            <span className="text-xs text-neutral-500">mm</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

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

                    {error && (
                        <div className="bg-red-950 border border-red-800 rounded-lg p-3 text-sm text-red-300">{error}</div>
                    )}
                </div>

                <div className="mt-auto p-4 border-t border-neutral-800 bg-neutral-950">
                    <div className="flex gap-2">
                        <button onClick={handleGenerateClick} disabled={!svgFile || isGenerating} className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded shadow-lg transition-all">
                            {isGenerating ? 'Gerando OpenSCAD...' : 'Gerar Peças 3D'}
                        </button>
                        <ClearCacheButton isClearingCache={isClearingCache} isGenerating={isGenerating} onClick={clearCache} />
                    </div>
                </div>
            </aside>

            <section className="flex-1 p-4 relative min-w-0 min-h-0 flex flex-col gap-3">
                <div className="flex-1 relative min-h-0">
                    <div className="absolute inset-0">
                        <Viewer3D carimbBaseUrl={files.carimbo_base ?? null} carimbArteUrl={files.carimbo_arte ?? null} cortadorUrl={files.cortador ?? null} isGenerating={isGenerating} artColor={artColor} modelColor={modelColor} modelType="cortador" />
                    </div>
                </div>
                {files['3mf'] && (
                    <div className="flex-shrink-0 flex flex-col items-center gap-1">
                        <CacheBadge fromCache={fromCache} />
                        <button onClick={() => downloadBlob(files['3mf'], 'cortador_bolacha_all.3mf')} className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg shadow-lg text-sm transition-colors">
                            Baixar 3MF
                        </button>
                    </div>
                )}
            </section>
        </Layout>
    );
}
