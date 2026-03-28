import { useState } from 'react';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * Hook reutilizável para gerenciamento de cache em modelos 3D.
 *
 * Uso:
 *   const { fromCache, setFromCache, isClearingCache, clearCache } = useCacheManagement();
 *
 *   // Para limpar o cache + resetar URLs do modelo:
 *   const handleClearCache = () => clearCache(() => {
 *     setTmfUrl(null); setBaseUrl(null); // etc.
 *   });
 */
export function useCacheManagement() {
    const [fromCache, setFromCache] = useState<boolean | null>(null);
    const [isClearingCache, setIsClearingCache] = useState(false);

    const clearCache = async (onClear?: () => void) => {
        setIsClearingCache(true);
        try {
            await axios.post(`${API_BASE}/api/clear_cache`);
            setFromCache(null);
            onClear?.();
        } catch { }
        setIsClearingCache(false);
    };

    return { fromCache, setFromCache, isClearingCache, clearCache };
}
