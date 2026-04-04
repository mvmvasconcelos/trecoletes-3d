import { useEffect } from 'react';

export function useGoogleFont(fontFamily: string | null | undefined) {
    useEffect(() => {
        if (!fontFamily) return;
        
        const linkId = `font-${fontFamily.replace(/ /g, '-')}`;
        if (!document.getElementById(linkId)) {
            const link = document.createElement('link');
            link.id = linkId;
            link.rel = 'stylesheet';
            link.href = `https://fonts.googleapis.com/css2?family=${fontFamily.replace(/ /g, '+')}&display=swap`;
            document.head.appendChild(link);
        }
    }, [fontFamily]);
}
