import { useEffect, useState } from 'react';
import { parseNomesFragment } from '../utils/nomesFragment';

/**
 * Nomes vindos de `#nomes=` na URL: lidos ao montar e a cada `hashchange` (colar
 * um `#nomes=` novo com a página aberta não remonta nada). Cada leitura válida
 * devolve um array novo e apaga o fragmento da barra (replaceState: sem reload
 * nem entrada nova no histórico; mantém history.state do react-router).
 */
export function useNomesFragment(): string[] | null {
    const [nomes, setNomes] = useState<string[] | null>(null);
    useEffect(() => {
        const ler = () => {
            const lidos = parseNomesFragment(window.location.hash);
            if (!lidos) return;
            setNomes(lidos);
            window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
        };
        ler();
        window.addEventListener('hashchange', ler);
        return () => window.removeEventListener('hashchange', ler);
    }, []);
    return nomes;
}
