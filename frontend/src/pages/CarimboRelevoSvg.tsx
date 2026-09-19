import axios from 'axios';
import { Upload, Sliders, ChevronDown } from 'lucide-react';
import { Layout } from '../components/ui/Layout';
import { ParameterField } from '../components/ui/ParameterField';
import Viewer3D from '../components/ui/Viewer3D';
import { CacheBadge, ClearCacheButton } from '../components/ui/CacheControls';
import { SvgPreviewModal } from '../components/ui/SvgPreviewModal';
import { useModelGenerate } from '../hooks/useModelGenerate';
import { useSvgUpload } from '../hooks/useSvgUpload';

const MODEL_ID = 'carimbo_relevo_svg';
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

export default function CarimboRelevoSvg() {
    const {
        config, params, setParam, openSections, toggleSection,
        isGenerating, error, files, fromCache, isClearingCache, clearCache, generate,
    } = useModelGenerate(MODEL_ID);

    const {
        svgFile, svgText, svgPreview, setSvgPreview,
        lockAspectRatio, setLockAspectRatio, artWidth, artHeight,
        isModalOpen, setIsModalOpen, isConvertingPng, fileInputRef,
        triggerFilePicker, handleHeightChange, handleWidthChange, handleSvgUpload,
    } = useSvgUpload({ initialWidth: 60, initialHeight: 20 });

    const handleModalConfirm = (processed: any) => {
        setSvgPreview(processed);
        setIsModalOpen(false);
    };

    const handleGenerate = () => {
        if (!svgPreview) return;
        generate(params => {
            const form = new FormData();
            form.append('svg_linhas_path', new Blob([svgPreview.thickenedSvg], { type: 'image/svg+xml' }), 'linhas.svg');
            form.append('art_width', String(artWidth));
            form.append('art_height', String(artHeight));
            Object.entries(params).forEach(([k, v]) => {
                if (v !== undefined && v !== null) form.append(k, String(v));
            });
            return axios.post(`${API_BASE}/api/generate_parametric/${MODEL_ID}`, form);
        });
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
                        {section.parameters?.map((p: any) => (
                            <ParameterField key={p.id} parameter={p} value={params[p.id] ?? p.default} onChange={setParam} accent="violet" />
                        ))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <Layout title="Carimbo em Relevo - SVG">
            <SvgPreviewModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onConfirm={handleModalConfirm}
                onLoadAnother={() => { setIsModalOpen(false); triggerFilePicker(); }}
                svgText={svgText}
                initialThickness={0.5}
            />

            <aside className="w-80 flex-shrink-0 bg-neutral-950 border-r border-neutral-800 flex flex-col">
                <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-3">
                    {!config && <p className="text-sm text-neutral-600 animate-pulse">Carregando configurações...</p>}
                    {config && (
                        <>
                            {/* Upload do SVG */}
                            <div className="border border-neutral-800 rounded-lg overflow-hidden">
                                <div className="flex items-center gap-2 px-3 py-2.5 bg-neutral-900">
                                    <Upload className="w-3.5 h-3.5 text-neutral-400" />
                                    <span className="text-xs font-semibold text-neutral-400 uppercase tracking-widest">Logo SVG ou PNG</span>
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
                                                    {svgFile?.name || 'Logo carregado'}
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
                                            <span className="text-xs text-neutral-500">O logo sai em relevo positivo à esquerda e em cavidade à direita</span>
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
                                                    onChange={e => handleWidthChange(parseFloat(e.target.value) || 60)}
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
                                                    type="number" min="5" max="100" step="1"
                                                    value={artHeight}
                                                    onChange={e => handleHeightChange(parseFloat(e.target.value) || 20)}
                                                    className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white focus:border-violet-500 focus:outline-none"
                                                />
                                                <span className="text-xs text-neutral-500 shrink-0">mm</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Seções do config.json */}
                            {config?.sections?.map(renderAccordionSection)}
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
                            {isGenerating ? 'Gerando...' : 'Gerar Carimbo 3D'}
                        </button>
                        <ClearCacheButton isClearingCache={isClearingCache} isGenerating={isGenerating} onClick={clearCache} />
                    </div>
                </div>
            </aside>

            <section className="flex-1 p-4 relative min-w-0 min-h-0 flex flex-col gap-3">
                <div className="flex-1 relative min-h-0">
                    <div className="absolute inset-0">
                        <Viewer3D
                            carimbBaseUrl={files.carimbo ?? null}
                            carimbArteUrl={null}
                            cortadorUrl={null}
                            isGenerating={isGenerating}
                            artColor="#FFFFFF"
                            modelColor="#3B82F6"
                            modelType="ferramenta"
                        />
                    </div>
                </div>
                {files['3mf'] && (
                    <div className="flex-shrink-0 flex flex-col items-center gap-1">
                        <CacheBadge fromCache={fromCache} />
                        <button
                            onClick={() => downloadBlob(files['3mf'], 'carimbo_relevo_svg_all.3mf')}
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
