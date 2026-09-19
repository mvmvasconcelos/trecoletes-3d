import { useState, useEffect } from 'react';
import axios from 'axios';
import { useCacheManagement } from './useCacheManagement';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface UseModelGenerateOptions {
    /** Valores aplicados por cima dos defaults do config.json ao carregar (ex.: extrusor_base=1). */
    initialOverrides?: Record<string, any>;
}

/**
 * Núcleo compartilhado das páginas de modelo: carrega o config.json, mantém o
 * estado dos parâmetros/seções, e envolve o ciclo de geração (loading/erro/
 * cache/arquivos resultantes). Não sabe COMO a requisição de geração é
 * montada — a página passa isso via `generate(requestFn)`, o que permite
 * reusar o mesmo hook tanto no fluxo /generate_parametric (FormData de
 * params) quanto no fluxo legado /generate (upload de 2 SVGs fixos).
 */
export function useModelGenerate(modelId: string, options?: UseModelGenerateOptions) {
    const [config, setConfig] = useState<any>(null);
    const [params, setParams] = useState<Record<string, any>>({});
    const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [files, setFiles] = useState<Record<string, string>>({});
    const { fromCache, setFromCache, isClearingCache, clearCache: clearCacheRaw } = useCacheManagement();

    useEffect(() => {
        let isMounted = true;
        axios.get(`${API_BASE}/api/models/${modelId}/config`)
            .then(res => {
                if (!isMounted) return;
                const cfg = res.data;
                setConfig(cfg);
                const initial: Record<string, any> = {};
                const setDefaults = (list: any[]) => list?.forEach((p: any) => { initial[p.id] = p.default; });
                setDefaults(cfg.parameters);
                cfg.sections?.forEach((s: any) => setDefaults(s.parameters));
                Object.assign(initial, options?.initialOverrides);
                setParams(initial);
                const initOpen: Record<string, boolean> = {};
                cfg.sections?.forEach((s: any) => {
                    initOpen[s.name] = s.collapsed !== undefined ? !s.collapsed : true;
                });
                setOpenSections(initOpen);
            })
            .catch(() => {});
        return () => { isMounted = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [modelId]);

    const setParam = (id: string, val: any) => setParams(prev => ({ ...prev, [id]: val }));
    const toggleSection = (name: string) => setOpenSections(prev => ({ ...prev, [name]: !prev[name] }));

    const clearCache = () => clearCacheRaw(() => setFiles({}));

    const generate = async (requestFn: (params: Record<string, any>) => Promise<{ data: any }>) => {
        setIsGenerating(true);
        setError(null); setFiles({}); setFromCache(null);
        try {
            const res = await requestFn(params);
            if (res.data?.files) {
                const urls: Record<string, string> = {};
                for (const [k, v] of Object.entries(res.data.files)) urls[k] = `${API_BASE}${v}`;
                setFiles(urls);
                setFromCache(res.data.from_cache ?? false);
            }
        } catch (err: any) {
            setError(err?.response?.data?.error ?? 'Erro desconhecido');
        } finally {
            setIsGenerating(false);
        }
    };

    return {
        config, params, setParam, openSections, toggleSection,
        isGenerating, error, setError, files, fromCache, isClearingCache, clearCache,
        generate,
    };
}
