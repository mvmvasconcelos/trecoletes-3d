import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Upload, Sliders, Download } from 'lucide-react';
import { Layout } from '../components/ui/Layout';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function ConversorPngSvg() {
    const [pngFile, setPngFile] = useState<File | null>(null);
    const [pngPreviewUrl, setPngPreviewUrl] = useState<string | null>(null);
    const [lineThickness, setLineThickness] = useState(0);
    const [isConverting, setIsConverting] = useState(false);
    const [svgText, setSvgText] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Revoga a URL de objeto anterior sempre que trocamos de arquivo/desmontamos.
    useEffect(() => {
        return () => {
            if (pngPreviewUrl) URL.revokeObjectURL(pngPreviewUrl);
        };
    }, [pngPreviewUrl]);

    const triggerFilePicker = () => {
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
            fileInputRef.current.click();
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const isPng = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png');
        if (!isPng) {
            setError('Arquivo inválido: selecione um arquivo PNG (.png).');
            setPngFile(null);
            if (pngPreviewUrl) URL.revokeObjectURL(pngPreviewUrl);
            setPngPreviewUrl(null);
            setSvgText(null);
            return;
        }

        setError(null);
        setSvgText(null);
        setPngFile(file);
        if (pngPreviewUrl) URL.revokeObjectURL(pngPreviewUrl);
        setPngPreviewUrl(URL.createObjectURL(file));
    };

    const handleConvert = async () => {
        if (!pngFile) return;
        setIsConverting(true);
        setError(null);
        setSvgText(null);
        try {
            const form = new FormData();
            form.append('file', pngFile, pngFile.name);
            form.append('line_thickness', String(lineThickness));
            const res = await axios.post<string>(
                `${API_BASE}/api/tools/png-to-svg`,
                form,
                { responseType: 'text' }
            );
            setSvgText(res.data);
        } catch (err: any) {
            let message = 'Falha desconhecida ao converter o PNG.';
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
            setIsConverting(false);
        }
    };

    const handleDownloadSvg = () => {
        if (!svgText || !pngFile) return;
        const blob = new Blob([svgText], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const filename = pngFile.name.replace(/\.png$/i, '') + '.svg';
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <Layout title="Conversor PNG → SVG">
            <aside className="w-96 flex-shrink-0 bg-neutral-900 border-r border-neutral-800 flex flex-col overflow-y-auto">
                <div className="p-6 space-y-8">
                    <div className="space-y-3">
                        <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                            <Upload className="w-4 h-4" /> Arquivo PNG
                        </h2>
                        <input ref={fileInputRef} type="file" className="hidden" accept="image/png,.png" onChange={handleFileSelect} />
                        {pngFile ? (
                            <button onClick={triggerFilePicker} className="w-full block border-2 border-sky-700/50 hover:border-sky-500 rounded-lg p-4 text-center cursor-pointer transition-colors bg-neutral-950/50">
                                <span className="text-sky-400 font-medium text-sm">{pngFile.name}</span>
                            </button>
                        ) : (
                            <button onClick={triggerFilePicker} className="w-full block border-2 border-dashed border-neutral-700 hover:border-sky-500 rounded-lg p-4 text-center cursor-pointer transition-colors bg-neutral-950/50">
                                <span className="text-sky-400 font-medium text-sm">Selecionar PNG</span>
                            </button>
                        )}

                        {pngPreviewUrl && (
                            <div className="relative rounded-lg overflow-hidden border border-neutral-700" style={{ backgroundColor: '#f0ebe3' }}>
                                <img src={pngPreviewUrl} alt="Pré-visualização do PNG" className="w-full h-auto max-h-48 object-contain p-2" />
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
                                type="range" min={0} max={5} step={1} value={lineThickness}
                                onChange={e => setLineThickness(parseInt(e.target.value, 10))}
                                className="w-full accent-sky-500"
                            />
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
                        onClick={handleConvert}
                        disabled={!pngFile || isConverting}
                        className="w-full py-3 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-semibold rounded shadow-lg transition-all"
                    >
                        {isConverting ? 'Convertendo...' : 'Converter'}
                    </button>
                </div>
            </aside>

            <section className="flex-1 p-4 relative min-w-0 min-h-0 flex flex-col gap-3">
                <div className="flex-1 relative min-h-0 rounded-lg overflow-hidden border border-neutral-800 flex items-center justify-center" style={{ backgroundColor: '#f0ebe3' }}>
                    {svgText ? (
                        <div
                            dangerouslySetInnerHTML={{ __html: svgText }}
                            className="w-full h-full flex items-center justify-center [&>svg]:max-w-full [&>svg]:max-h-full [&>svg]:object-contain"
                        />
                    ) : (
                        <span className="text-neutral-500 text-sm">
                            {isConverting ? 'Convertendo PNG para SVG...' : 'A pré-visualização do SVG aparecerá aqui.'}
                        </span>
                    )}
                </div>
                {svgText && (
                    <div className="flex-shrink-0 flex justify-center">
                        <button
                            onClick={handleDownloadSvg}
                            className="flex items-center gap-2 px-6 py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-semibold rounded-lg shadow-lg text-sm transition-colors"
                        >
                            <Download className="w-4 h-4" /> Baixar SVG
                        </button>
                    </div>
                )}
            </section>
        </Layout>
    );
}
