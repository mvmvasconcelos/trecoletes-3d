import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Upload, Sliders, Download } from 'lucide-react';
import { Layout } from '../components/ui/Layout';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function ConversorPngSvg() {
    const [pngFile, setPngFile] = useState<File | null>(null);
    const [pngPreviewUrl, setPngPreviewUrl] = useState<string | null>(null);
    const [lineThickness, setLineThickness] = useState(0);
    const [isPreviewUpdating, setIsPreviewUpdating] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
    const [generatedSvgText, setGeneratedSvgText] = useState<string | null>(null);
    const [isGeneratingSvg, setIsGeneratingSvg] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const previewRequestIdRef = useRef(0);
    const previewDebounceRef = useRef<number | null>(null);

    // Revoga a URL de objeto anterior sempre que trocamos de arquivo/desmontamos.
    useEffect(() => {
        return () => {
            if (pngPreviewUrl) URL.revokeObjectURL(pngPreviewUrl);
            if (previewUrl) URL.revokeObjectURL(previewUrl);
        };
    }, [pngPreviewUrl, previewUrl]);

    const triggerFilePicker = () => {
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
            fileInputRef.current.click();
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const allowedExtensions = ['.png', '.jpg', '.jpeg', '.bmp', '.gif', '.webp', '.tiff', '.tif', '.svg'];
        const allowedMimePrefixes = [
            'image/png',
            'image/jpeg',
            'image/bmp',
            'image/gif',
            'image/webp',
            'image/tiff',
            'image/svg+xml',
        ];
        const lowerName = file.name.toLowerCase();
        const isAllowed =
            allowedMimePrefixes.includes(file.type) ||
            allowedExtensions.some(ext => lowerName.endsWith(ext));
        if (!isAllowed) {
            previewRequestIdRef.current += 1;
            setError('Arquivo inválido: selecione uma imagem (PNG, JPEG, BMP, GIF, WEBP, TIFF ou SVG).');
            setPngFile(null);
            if (pngPreviewUrl) URL.revokeObjectURL(pngPreviewUrl);
            setPngPreviewUrl(null);
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            setPreviewUrl(null);
            setPreviewBlob(null);
            setGeneratedSvgText(null);
            return;
        }

        setError(null);
        previewRequestIdRef.current += 1;
        setPngFile(file);
        if (pngPreviewUrl) URL.revokeObjectURL(pngPreviewUrl);
        setPngPreviewUrl(URL.createObjectURL(file));
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
        setPreviewBlob(null);
        setGeneratedSvgText(null);
    };

    const createLivePreview = async (file: File, thickness: number): Promise<Blob | null> => {
        const requestId = ++previewRequestIdRef.current;
        setIsPreviewUpdating(true);
        try {
            if (requestId === previewRequestIdRef.current) {
                const objectUrl = URL.createObjectURL(file);
                let generatedBlob: Blob | null = null;
                const imageUrl = await new Promise<string>((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => {
                        try {
                            const maxSize = 1100;
                            const scale = Math.min(1, maxSize / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
                            const width = Math.max(1, Math.round((img.naturalWidth || img.width || 1) * scale));
                            const height = Math.max(1, Math.round((img.naturalHeight || img.height || 1) * scale));
                            const canvas = document.createElement('canvas');
                            canvas.width = width;
                            canvas.height = height;
                            const ctx = canvas.getContext('2d', { willReadFrequently: true });
                            if (!ctx) {
                                reject(new Error('Canvas 2D indisponível.'));
                                return;
                            }

                            ctx.fillStyle = '#ffffff';
                            ctx.fillRect(0, 0, width, height);
                            ctx.drawImage(img, 0, 0, width, height);

                            const source = ctx.getImageData(0, 0, width, height);
                            const size = width * height;
                            let mask = new Uint8Array(size);

                            for (let i = 0, px = 0; i < source.data.length; i += 4, px++) {
                                const r = source.data[i];
                                const g = source.data[i + 1];
                                const b = source.data[i + 2];
                                const a = source.data[i + 3];
                                const luminance = (r * 0.299) + (g * 0.587) + (b * 0.114);
                                mask[px] = a > 32 && luminance < 245 ? 1 : 0;
                            }

                            const passes = Math.max(0, Math.min(20, Math.round(thickness)));
                            for (let pass = 0; pass < passes; pass++) {
                                const next = new Uint8Array(size);
                                for (let y = 0; y < height; y++) {
                                    const row = y * width;
                                    for (let x = 0; x < width; x++) {
                                        const idx = row + x;
                                        if (!mask[idx]) continue;
                                        for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1); ny++) {
                                            const nRow = ny * width;
                                            for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx++) {
                                                next[nRow + nx] = 1;
                                            }
                                        }
                                    }
                                }
                                mask = next;
                            }

                            const output = ctx.createImageData(width, height);
                            for (let px = 0, i = 0; px < size; px++, i += 4) {
                                const on = mask[px] === 1;
                                const value = on ? 0 : 255;
                                output.data[i] = value;
                                output.data[i + 1] = value;
                                output.data[i + 2] = value;
                                output.data[i + 3] = 255;
                            }
                            ctx.putImageData(output, 0, 0);

                            canvas.toBlob((blob) => {
                                URL.revokeObjectURL(objectUrl);
                                if (!blob) {
                                    reject(new Error('Falha ao gerar preview.'));
                                    return;
                                }
                                generatedBlob = blob;
                                resolve(URL.createObjectURL(blob));
                            }, 'image/png');
                        } catch (err) {
                            URL.revokeObjectURL(objectUrl);
                            reject(err);
                        }
                    };
                    img.onerror = () => {
                        URL.revokeObjectURL(objectUrl);
                        reject(new Error('Falha ao carregar a imagem para o preview.'));
                    };
                    img.src = objectUrl;
                });

                if (requestId === previewRequestIdRef.current) {
                    if (generatedBlob) {
                        setPreviewBlob(generatedBlob);
                    }
                    setPreviewUrl(prev => {
                        if (prev) URL.revokeObjectURL(prev);
                        return imageUrl;
                    });
                    return generatedBlob;
                } else {
                    URL.revokeObjectURL(imageUrl);
                }
            }
        } catch (err: any) {
            if (requestId === previewRequestIdRef.current) {
                setError(err?.message ?? 'Falha desconhecida ao atualizar a pré-visualização.');
            }
            return null;
        } finally {
            if (requestId === previewRequestIdRef.current) {
                setIsPreviewUpdating(false);
            }
        }
        return null;
    };

    useEffect(() => {
        if (!pngFile) return;
        if (previewDebounceRef.current) {
            window.clearTimeout(previewDebounceRef.current);
        }
        previewDebounceRef.current = window.setTimeout(() => {
            void createLivePreview(pngFile, lineThickness);
        }, 250);

        return () => {
            if (previewDebounceRef.current) {
                window.clearTimeout(previewDebounceRef.current);
            }
        };
    }, [pngFile, lineThickness]);

    const handleGenerateSvg = async () => {
        if (!pngFile) return;
        setIsGeneratingSvg(true);
        setError(null);
        try {
            const thickenedBlob = previewBlob ?? await createLivePreview(pngFile, lineThickness);
            const fileToConvert = thickenedBlob
                ? new File([thickenedBlob], pngFile.name.replace(/\.[^.]+$/, '') + '-preview.png', { type: 'image/png' })
                : pngFile;
            const form = new FormData();
            form.append('file', fileToConvert, fileToConvert.name);
            form.append('line_thickness', '0');
            const res = await axios.post<string>(
                `${API_BASE}/api/tools/image-to-svg`,
                form,
                { responseType: 'text' }
            );
            setGeneratedSvgText(res.data);
        } catch (err: any) {
            let message = 'Falha desconhecida ao gerar o SVG.';
            const raw = err?.response?.data;
            if (typeof raw === 'string') {
                try {
                    const parsed = JSON.parse(raw);
                    if (parsed?.error) message = parsed.error;
                } catch {
                    // resposta não era JSON, mantém fallback
                }
            } else if (raw?.error) {
                message = raw.error;
            }
            setError(message);
        } finally {
            setIsGeneratingSvg(false);
        }
    };

    const handleDownloadSvg = () => {
        if (!generatedSvgText || !pngFile) return;
        const blob = new Blob([generatedSvgText], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const filename = pngFile.name.replace(/\.(png|jpe?g|bmp|gif|webp|tiff?|svg)$/i, '') + '.svg';
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <Layout title="Conversor de Imagem → SVG">
            <aside className="w-96 flex-shrink-0 bg-neutral-900 border-r border-neutral-800 flex flex-col overflow-y-auto">
                <div className="p-6 space-y-8">
                    <div className="space-y-3">
                        <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                            <Upload className="w-4 h-4" /> Arquivo de Imagem
                        </h2>
                        <input ref={fileInputRef} type="file" className="hidden" accept="image/png,image/jpeg,image/bmp,image/gif,image/webp,image/tiff,image/svg+xml,.png,.jpg,.jpeg,.bmp,.gif,.webp,.tiff,.tif,.svg" onChange={handleFileSelect} />
                        {pngFile ? (
                            <button onClick={triggerFilePicker} className="w-full block border-2 border-sky-700/50 hover:border-sky-500 rounded-lg p-4 text-center cursor-pointer transition-colors bg-neutral-950/50">
                                <span className="text-sky-400 font-medium text-sm">{pngFile.name}</span>
                            </button>
                        ) : (
                            <button onClick={triggerFilePicker} className="w-full block border-2 border-dashed border-neutral-700 hover:border-sky-500 rounded-lg p-4 text-center cursor-pointer transition-colors bg-neutral-950/50">
                                <span className="text-sky-400 font-medium text-sm">Selecionar Imagem</span>
                            </button>
                        )}

                        {pngPreviewUrl && (
                            <div className="relative rounded-lg overflow-hidden border border-neutral-700" style={{ backgroundColor: '#f0ebe3' }}>
                                <img src={pngPreviewUrl} alt="Pré-visualização da imagem" className="w-full h-auto max-h-48 object-contain p-2" />
                            </div>
                        )}
                    </div>

                    <div className="space-y-4">
                        <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                            <Sliders className="w-4 h-4" /> Configurações
                        </h2>
                        <div className="space-y-2">
                            <label className="flex justify-between text-sm">
                                <span>Espessura da linha</span>
                                <span className="text-sky-400 font-mono">{lineThickness}</span>
                            </label>
                            <input
                                type="range" min={0} max={20} step={1} value={lineThickness}
                                onChange={e => {
                                    setLineThickness(parseInt(e.target.value, 10));
                                    setGeneratedSvgText(null);
                                }}
                                className="w-full accent-sky-500"
                            />
                            <p className="text-xs text-neutral-500">
                                {isPreviewUpdating ? 'Atualizando pré-visualização...' : 'A pré-visualização atualiza em tempo real.'}
                            </p>
                        </div>
                    </div>

                    {error && (
                        <div className="bg-red-950 border border-red-800 rounded-lg p-3 text-sm text-red-300">
                            {error}
                        </div>
                    )}
                </div>

                <div className="mt-auto p-4 border-t border-neutral-800 bg-neutral-950">
                    <button
                        onClick={handleGenerateSvg}
                        disabled={!pngFile || isGeneratingSvg}
                        className="w-full py-3 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-semibold rounded shadow-lg transition-all"
                    >
                        {isGeneratingSvg ? 'Gerando...' : 'Gerar SVG'}
                    </button>
                </div>
            </aside>

            <section className="flex-1 p-4 relative min-w-0 min-h-0 flex flex-col gap-4">
                <div className="grid grid-rows-[minmax(0,1fr)_minmax(260px,0.7fr)] gap-4 flex-1 min-h-0">
                    <div className="rounded-lg overflow-hidden border border-neutral-800 flex flex-col min-h-0 bg-neutral-950/40">
                        <div className="px-4 py-3 border-b border-neutral-800 bg-neutral-950/70 flex items-center justify-between gap-3">
                            <div>
                                <h3 className="text-sm font-semibold text-neutral-200">Pré-visualização em tempo real</h3>
                                <p className="text-xs text-neutral-500">Atualiza enquanto você ajusta a espessura.</p>
                            </div>
                            <span className="text-xs text-sky-400 font-mono">{lineThickness}px</span>
                        </div>
                        <div className="flex-1 min-h-0 flex items-center justify-center" style={{ backgroundColor: '#f0ebe3' }}>
                            {previewUrl ? (
                                <img
                                    src={previewUrl}
                                    alt="Pré-visualização com espessura aplicada"
                                    className="w-full h-full object-contain"
                                />
                            ) : (
                                <span className="text-neutral-500 text-sm">
                                    {isPreviewUpdating ? 'Atualizando pré-visualização...' : 'A pré-visualização aparecerá aqui.'}
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="rounded-lg overflow-hidden border border-neutral-800 flex flex-col min-h-0 bg-neutral-950/40">
                        <div className="px-4 py-3 border-b border-neutral-800 bg-neutral-950/70 flex items-center justify-between gap-3">
                            <div>
                                <h3 className="text-sm font-semibold text-neutral-200">SVG gerado</h3>
                                <p className="text-xs text-neutral-500">Só aparece depois de clicar em Gerar SVG.</p>
                            </div>
                            {generatedSvgText ? (
                                <button
                                    onClick={handleDownloadSvg}
                                    className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-semibold rounded-lg shadow-lg text-xs transition-colors"
                                >
                                    <Download className="w-4 h-4" /> Baixar SVG
                                </button>
                            ) : (
                                <span className="text-xs text-neutral-500">Aguardando geração</span>
                            )}
                        </div>
                        <div className="flex-1 min-h-0 flex items-center justify-center p-4" style={{ backgroundColor: '#f0ebe3' }}>
                            {generatedSvgText ? (
                                <div
                                    dangerouslySetInnerHTML={{ __html: generatedSvgText }}
                                    className="w-full h-full flex items-center justify-center [&>svg]:max-w-full [&>svg]:max-h-full [&>svg]:object-contain"
                                />
                            ) : (
                                <span className="text-neutral-500 text-sm">Clique em Gerar SVG para ver o resultado final.</span>
                            )}
                        </div>
                    </div>
                </div>
            </section>
        </Layout>
    );
}
