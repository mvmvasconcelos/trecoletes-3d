import { useEffect, useState } from 'react';
import { parseNomesFragment } from '../utils/nomesFragment';

/**
 * Nomes vindos de `#nomes=` na URL, lidos uma vez ao montar a página. O fragmento
 * é apagado da barra logo em seguida (replaceState: sem reload nem entrada nova
 * no histórico; mantém history.state do react-router).
 */
export function useNomesFragment(): string[] | null {
    const [nomes] = useState(() => parseNomesFragment(window.location.hash));
    useEffect(() => {
        if (nomes) window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
    }, [nomes]);
    return nomes;
}
