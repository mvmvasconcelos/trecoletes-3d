import { Trash2 } from 'lucide-react';

/**
 * Badge que indica se o resultado foi servido do cache ou gerado agora.
 * Exibir próximo ao botão de download.
 *
 * Uso: <CacheBadge fromCache={fromCache} />
 * Uso (centralizado, ex: lote): <CacheBadge fromCache={batchFromCache} centered />
 */
export function CacheBadge({ fromCache, centered }: { fromCache: boolean | null; centered?: boolean }) {
    if (fromCache === null) return null;
    return (
        <p className={`text-xs font-medium ${centered ? 'text-center ' : ''}${fromCache ? 'text-amber-400' : 'text-emerald-400'}`}>
            {fromCache ? '⚡ Do cache' : '✔ Recém gerado'}
        </p>
    );
}

/**
 * Botão de limpar cache — colocar ao lado do botão principal de gerar.
 *
 * Uso:
 *   <ClearCacheButton
 *     isClearingCache={isClearingCache}
 *     isGenerating={isGenerating}
 *     onClick={handleClearCache}
 *   />
 */
export function ClearCacheButton({
    isClearingCache,
    isGenerating,
    onClick,
}: {
    isClearingCache: boolean;
    isGenerating: boolean;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            disabled={isClearingCache || isGenerating}
            title="Limpar cache"
            className="px-3 py-3 bg-neutral-800 hover:bg-red-900 text-neutral-400 hover:text-red-300 rounded border border-neutral-700 hover:border-red-700 transition-all"
        >
            {isClearingCache ? '...' : <Trash2 className="w-4 h-4" />}
        </button>
    );
}
