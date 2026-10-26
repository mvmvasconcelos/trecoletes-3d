import { useEffect } from 'react';
import axios from 'axios';
import { Sliders, ChevronDown } from 'lucide-react';
import { Layout } from '../components/ui/Layout';
import { BatchGenerationModal } from '../components/ui/BatchGenerationModal';
import { ParameterField } from '../components/ui/ParameterField';
import Viewer3D from '../components/ui/Viewer3D';
import { CacheBadge, ClearCacheButton } from '../components/ui/CacheControls';
import { useModelGenerate } from '../hooks/useModelGenerate';
import { useBatchGeneration } from '../hooks/useBatchGeneration';
import { useNomesFragment } from '../hooks/useNomesFragment';

const MODEL_ID = 'ponteira_lapis_texto';
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

export default function PonteiraLapisTexto() {
    const {
        config, params, setParam, openSections, toggleSection,
        isGenerating, error, setError, files, fromCache, isClearingCache, clearCache, generate,
    } = useModelGenerate(MODEL_ID, { initialOverrides: { extrusor_base: 1, extrusor_letras: 4 } });

    const { isBatchModalOpen, setIsBatchModalOpen, batchProgress, batchTmfUrl, handleBatchGenerate } =
        useBatchGeneration(MODEL_ID, params, {
            skipKeys: ['text_line_1', 'text_line_2', 'hole_orientation'],
            setError,
        });

    const nomesDaUrl = useNomesFragment();
    useEffect(() => { if (nomesDaUrl) setIsBatchModalOpen(true); }, [nomesDaUrl]);

    const handleGenerate = () => generate(params => {
        const form = new FormData();
        Object.entries(params).forEach(([k, v]) => form.append(k, String(v ?? '')));
        return axios.post(`${API_BASE}/api/generate_parametric/${MODEL_ID}`, form);
    });

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
                        {section.parameters?.map((p: any) => (
                            <ParameterField key={p.id} parameter={p} value={params[p.id] ?? p.default} onChange={setParam} accent="violet" />
                        ))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <Layout title="Ponteira Lapis Texto">
            <aside className="w-80 flex-shrink-0 bg-neutral-950 border-r border-neutral-800 flex flex-col">
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {!config && <p className="text-sm text-neutral-600 animate-pulse">Carregando configurações...</p>}
                    {config && (
                        <>
                            <div className="space-y-4 pb-1">
                                <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-widest flex items-center gap-2">
                                    <Sliders className="w-3.5 h-3.5" /> Texto
                                </h2>
                                {config.parameters?.map((p: any) => (
                                    <ParameterField key={p.id} parameter={p} value={params[p.id] ?? p.default} onChange={setParam} accent="violet" />
                                ))}
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
                            className="flex-1 py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-semibold rounded shadow-lg transition-all"
                        >
                            {isGenerating ? 'Gerando...' : 'Gerar Modelo 3D'}
                        </button>
                        <ClearCacheButton isClearingCache={isClearingCache} isGenerating={isGenerating} onClick={clearCache} />
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
                            carimbBaseUrl={files.base ?? null}
                            carimbArteUrl={files.letters ?? null}
                            cortadorUrl={null}
                            isGenerating={isGenerating}
                            artColor={(params['letters_color'] as string) ?? '#FFFFFF'}
                            modelColor={(params['base_color'] as string) ?? '#1B40D1'}
                            modelType="ponteira"
                        />
                    </div>
                </div>
                {files['3mf'] && (
                    <div className="flex-shrink-0 flex flex-col items-center gap-1">
                        <CacheBadge fromCache={fromCache} />
                        <button
                            onClick={() => downloadBlob(files['3mf'], 'ponteira_texto_all.3mf')}
                            className="flex items-center gap-2 px-6 py-2.5 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-lg shadow-lg text-sm transition-colors"
                        >
                            Baixar 3MF
                        </button>
                    </div>
                )}
            </section>
            <BatchGenerationModal
                isOpen={isBatchModalOpen}
                initialNames={nomesDaUrl}
                onClose={() => setIsBatchModalOpen(false)}
                onGenerate={handleBatchGenerate}
                onDownload={() => {
                    if (batchTmfUrl) downloadBlob(batchTmfUrl, 'ponteira_texto_lote.zip');
                }}
                defaultExtrusorBase={Number(params['extrusor_base']) || 1}
                defaultExtrusorLetras={Number(params['extrusor_letras']) || 4}
                isGenerating={batchProgress !== null && !batchTmfUrl}
                progress={batchProgress}
                downloadUrl={batchTmfUrl}
                error={error}
                enableTwoLineToggle={true}
                secondaryToggle={{
                    field: 'hole_orientation',
                    toggleLabel: 'Furo',
                    options: [
                        { value: 'FRONTBACK', label: 'Horizontal' },
                        { value: 'TOPBOTTOM', label: 'Vertical' },
                    ],
                    defaultValue: 'FRONTBACK',
                }}
            />
        </Layout>
    );
}
