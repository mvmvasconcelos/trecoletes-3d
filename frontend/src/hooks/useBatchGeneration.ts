import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import type { BatchNameEntry } from '../components/ui/BatchGenerationModal';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface UseBatchGenerationOptions {
    /** Campos do `params` que não entram no POST de lote (recalculados por nome, ex.: text_line_1). */
    skipKeys?: string[];
    setError: (err: string | null) => void;
}

/**
 * Geração em lote (POST /generate_batch + polling em /batch_status). Depende
 * do `params` e do `setError` do useModelGenerate — não duplica erro próprio,
 * reaproveita o do núcleo. Só usado pelas páginas com BatchGenerationModal.
 */
export function useBatchGeneration(modelId: string, params: Record<string, any>, options: UseBatchGenerationOptions) {
    const { skipKeys = [], setError } = options;
    const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
    const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
    const [batchTmfUrl, setBatchTmfUrl] = useState<string | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
                .filter(([k]) => !skipKeys.includes(k))
                .forEach(([k, v]) => form.append(k, String(v ?? '')));
            const res = await axios.post(`${API_BASE}/api/generate_batch/${modelId}`, form);
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

    return { isBatchModalOpen, setIsBatchModalOpen, batchProgress, batchTmfUrl, handleBatchGenerate };
}
