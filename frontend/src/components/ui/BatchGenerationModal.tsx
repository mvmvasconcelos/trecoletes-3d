import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Upload, X } from 'lucide-react';

export type BatchNameEntry = {
    nome: string;
    extrusor_base: number;
    extrusor_letras: number;
};

type BatchProgress = {
    done: number;
    total: number;
};

interface BatchGenerationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onGenerate: (rows: BatchNameEntry[]) => void | Promise<void>;
    onDownload: () => void;
    defaultExtrusorBase: number;
    defaultExtrusorLetras: number;
    isGenerating: boolean;
    progress: BatchProgress | null;
    downloadUrl: string | null;
    error?: string | null;
    title?: string;
    downloadLabel?: string;
}

function makeEmptyRow(defaultExtrusorBase: number, defaultExtrusorLetras: number): BatchNameEntry {
    return {
        nome: '',
        extrusor_base: defaultExtrusorBase,
        extrusor_letras: defaultExtrusorLetras,
    };
}

function toTitleCase(text: string): string {
    return text.replace(/\S+/g, (word) =>
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    );
}

function cycleCase(text: string): string {
    const up = text.toUpperCase();
    const lo = text.toLowerCase();
    if (text === up && text !== lo) return lo;       // UPPER → lower
    if (text === lo)               return toTitleCase(text); // lower → Title
    return up;                                        // Title/misto → UPPER
}

function toIntOrDefault(value: unknown, fallback: number): number {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : fallback;
}

function normalizeRows(rows: BatchNameEntry[]): BatchNameEntry[] {
    return rows
        .map((row) => ({
            nome: row.nome.trim(),
            extrusor_base: toIntOrDefault(row.extrusor_base, 1),
            extrusor_letras: toIntOrDefault(row.extrusor_letras, 1),
        }))
        .filter((row) => row.nome.length > 0);
}

function parseJsonRows(content: string, defaultExtrusorBase: number, defaultExtrusorLetras: number): BatchNameEntry[] {
    const parsed = JSON.parse(content) as unknown;
    if (!Array.isArray(parsed)) {
        throw new Error('JSON deve ser uma lista.');
    }

    const rows: BatchNameEntry[] = [];
    for (const item of parsed) {
        if (typeof item === 'string') {
            const nome = item.trim();
            if (!nome) continue;
            rows.push({
                nome,
                extrusor_base: defaultExtrusorBase,
                extrusor_letras: defaultExtrusorLetras,
            });
            continue;
        }

        if (item && typeof item === 'object' && 'nome' in item) {
            const obj = item as Record<string, unknown>;
            const nome = String(obj.nome ?? '').trim();
            if (!nome) continue;
            rows.push({
                nome,
                extrusor_base: toIntOrDefault(obj.extrusor_base, defaultExtrusorBase),
                extrusor_letras: toIntOrDefault(obj.extrusor_letras, defaultExtrusorLetras),
            });
            continue;
        }

        throw new Error('Formato JSON invalido.');
    }

    return rows;
}

function parseTextRows(content: string, defaultExtrusorBase: number, defaultExtrusorLetras: number): BatchNameEntry[] {
    return content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((nome) => ({
            nome,
            extrusor_base: defaultExtrusorBase,
            extrusor_letras: defaultExtrusorLetras,
        }));
}

export function BatchGenerationModal({
    isOpen,
    onClose,
    onGenerate,
    onDownload,
    defaultExtrusorBase,
    defaultExtrusorLetras,
    isGenerating,
    progress,
    downloadUrl,
    error,
    title = 'Gerar em Lotes',
    downloadLabel = 'Baixar Lote (ZIP)',
}: BatchGenerationModalProps) {
    const [rows, setRows] = useState<BatchNameEntry[]>(() => [makeEmptyRow(defaultExtrusorBase, defaultExtrusorLetras)]);
    const [localError, setLocalError] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const snapshotRef = useRef<string>('');

    useEffect(() => {
        if (!isOpen) return;
        const normalized = normalizeRows(rows);
        snapshotRef.current = JSON.stringify(normalized);
        setLocalError(null);
    }, [isOpen]);

    const normalizedRows = useMemo(() => normalizeRows(rows), [rows]);

    const duplicateInfo = useMemo(() => {
        const counter = new Map<string, number>();
        for (const row of normalizedRows) {
            const key = row.nome.toLowerCase();
            counter.set(key, (counter.get(key) ?? 0) + 1);
        }

        const duplicates = Array.from(counter.entries())
            .filter(([, qty]) => qty > 1)
            .map(([name, qty]) => ({ name, qty }));

        return {
            count: duplicates.length,
            names: duplicates.map((d) => `${d.name} (${d.qty}x)`),
        };
    }, [normalizedRows]);

    const hasChanges = useMemo(() => {
        const current = JSON.stringify(normalizedRows);
        return current !== snapshotRef.current;
    }, [normalizedRows]);

    if (!isOpen) return null;

    const requestClose = () => {
        if (hasChanges) {
            const confirmed = window.confirm('Existem alteracoes nao salvas. Deseja fechar mesmo assim?');
            if (!confirmed) return;
        }
        onClose();
    };

    const addRow = () => {
        setRows((prev) => [...prev, makeEmptyRow(defaultExtrusorBase, defaultExtrusorLetras)]);
    };

    const removeRow = (index: number) => {
        setRows((prev) => {
            if (prev.length <= 1) {
                return [makeEmptyRow(defaultExtrusorBase, defaultExtrusorLetras)];
            }
            return prev.filter((_, i) => i !== index);
        });
    };

    const updateRow = (index: number, patch: Partial<BatchNameEntry>) => {
        setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    };

    const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const fileNameLower = file.name.toLowerCase();
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const content = String(ev.target?.result ?? '');
                const imported = fileNameLower.endsWith('.json')
                    ? parseJsonRows(content, defaultExtrusorBase, defaultExtrusorLetras)
                    : parseTextRows(content, defaultExtrusorBase, defaultExtrusorLetras);

                if (imported.length === 0) {
                    setLocalError('Arquivo vazio ou sem nomes validos.');
                    return;
                }

                setRows(imported);
                setLocalError(null);
            } catch {
                setLocalError('Nao foi possivel processar o arquivo. Use JSON, TXT ou MD validos.');
            }
        };

        reader.readAsText(file);
        e.target.value = '';
    };

    const handleGenerate = async () => {
        if (normalizedRows.length === 0 || isGenerating) return;
        await onGenerate(normalizedRows);
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4"
            onClick={(e) => {
                if (e.target === e.currentTarget) requestClose();
            }}
        >
            <div className="w-full max-w-4xl max-h-[90vh] bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl flex flex-col overflow-hidden">
                <div className="px-4 py-3 sm:px-5 border-b border-neutral-800 bg-neutral-950 flex items-center justify-between gap-3">
                    <div>
                        <h2 className="text-base sm:text-lg font-semibold text-neutral-100">{title}</h2>
                        <p className="text-xs text-neutral-400">{normalizedRows.length} nome(s) validos</p>
                    </div>
                    <button
                        type="button"
                        onClick={requestClose}
                        className="w-9 h-9 rounded-lg border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white flex items-center justify-center transition-colors"
                        aria-label="Fechar modal"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="px-4 py-4 sm:px-5 space-y-3 overflow-y-auto min-h-0 flex-1">
                    <div className="grid grid-cols-12 gap-2 text-[11px] uppercase tracking-wider text-neutral-500 px-1">
                        <span className="col-span-6">Nome</span>
                        <span className="col-span-2">Letra</span>
                        <span className="col-span-2">Base</span>
                        <span className="col-span-2 text-right">Acao</span>
                    </div>

                    <div className="space-y-2">
                        {rows.map((row, index) => (
                            <div key={`batch-row-${index}`} className="grid grid-cols-12 gap-2">
                                <input
                                    type="text"
                                    value={row.nome}
                                    onChange={(e) => updateRow(index, { nome: e.target.value })}
                                    placeholder="Digite um nome"
                                    className="col-span-6 bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                                />
                                <input
                                    type="number"
                                    min={1}
                                    value={row.extrusor_letras}
                                    onChange={(e) => updateRow(index, { extrusor_letras: toIntOrDefault(e.target.value, defaultExtrusorLetras) })}
                                    className="col-span-2 bg-neutral-800 border border-neutral-700 rounded px-2 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                                />
                                <input
                                    type="number"
                                    min={1}
                                    value={row.extrusor_base}
                                    onChange={(e) => updateRow(index, { extrusor_base: toIntOrDefault(e.target.value, defaultExtrusorBase) })}
                                    className="col-span-2 bg-neutral-800 border border-neutral-700 rounded px-2 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                                />
                                <div className="col-span-2 flex justify-end gap-1">
                                    <button
                                        type="button"
                                        onClick={() => updateRow(index, { nome: cycleCase(row.nome) })}
                                        className="w-10 h-10 rounded-lg border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-emerald-300 flex items-center justify-center transition-colors font-semibold text-xs leading-none"
                                        aria-label={`Ciclar capitalização da linha ${index + 1}`}
                                        title="Ciclar capitalização (Title / UPPER / lower)"
                                    >
                                        Aa
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => removeRow(index)}
                                        className="w-10 h-10 rounded-lg border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-red-300 flex items-center justify-center transition-colors"
                                        aria-label={`Remover linha ${index + 1}`}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    <button
                        type="button"
                        onClick={addRow}
                        className="w-10 h-10 rounded-lg border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 text-emerald-400 hover:text-emerald-300 flex items-center justify-center transition-colors"
                        aria-label="Adicionar linha"
                    >
                        <Plus className="w-5 h-5" />
                    </button>

                    {duplicateInfo.count > 0 && (
                        <div className="bg-amber-950/60 border border-amber-800 rounded-lg px-3 py-2 text-xs text-amber-300">
                            Nomes duplicados detectados: {duplicateInfo.names.join(', ')}
                        </div>
                    )}

                    {(localError || error) && (
                        <div className="bg-red-950 border border-red-800 rounded-lg px-3 py-2 text-sm text-red-300">
                            {localError || error}
                        </div>
                    )}

                    {progress && (
                        <div className="space-y-1.5">
                            <div className="w-full bg-neutral-800 rounded-full h-2 overflow-hidden">
                                <div
                                    className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
                                    style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }}
                                />
                            </div>
                            <p className="text-xs text-neutral-400 text-center">
                                {downloadUrl ? 'Lote concluido!' : `${progress.done} de ${progress.total} renderizados...`}
                            </p>
                        </div>
                    )}

                    {downloadUrl && (
                        <div className="flex justify-end">
                            <button
                                type="button"
                                onClick={onDownload}
                                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors"
                            >
                                {downloadLabel}
                            </button>
                        </div>
                    )}
                </div>

                <div className="px-4 py-3 sm:px-5 border-t border-neutral-800 bg-neutral-950 flex items-center justify-between gap-3">
                    <input
                        ref={fileRef}
                        type="file"
                        accept=".json,.txt,.md,text/plain,text/markdown,application/json"
                        className="hidden"
                        onChange={handleFileImport}
                    />

                    <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 text-sm font-medium transition-colors"
                    >
                        <Upload className="w-4 h-4" />
                        Carregar arquivo
                    </button>

                    <button
                        type="button"
                        onClick={handleGenerate}
                        disabled={normalizedRows.length === 0 || isGenerating}
                        className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
                    >
                        {isGenerating ? 'Gerando...' : 'Gerar Modelos'}
                    </button>
                </div>
            </div>
        </div>
    );
}
