const PREFIX = '#nomes=';

/**
 * Lê `#nomes=<JSON url-encoded>` (lista de nomes enviada pelo admin da Loja da Cati).
 * Vai no fragmento, não na query, para os nomes não caírem no log do servidor.
 * Qualquer coisa que não seja uma lista não-vazia de strings → null.
 */
export function parseNomesFragment(hash: string): string[] | null {
    if (!hash.startsWith(PREFIX)) return null;
    try {
        const parsed: unknown = JSON.parse(decodeURIComponent(hash.slice(PREFIX.length)));
        if (!Array.isArray(parsed) || parsed.length === 0) return null;
        return parsed.every((n) => typeof n === 'string') ? parsed : null;
    } catch {
        return null;
    }
}
