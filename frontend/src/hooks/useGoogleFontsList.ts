import { useEffect } from 'react';

export function useGoogleFontsList(fontFamilies: string[]) {
    useEffect(() => {
        if (!fontFamilies || fontFamilies.length === 0) return;
        
        // Filter out empty names and duplicates
        const familiesToLoad = Array.from(new Set(fontFamilies.filter(f => f && f.trim() !== '')));
        if (familiesToLoad.length === 0) return;

        const familiesQuery = familiesToLoad.map(f => `family=${f.replace(/ /g, '+')}`).join('&');
        const linkId = `fonts-list-${btoa(familiesQuery).substring(0, 20)}`;

        if (!document.getElementById(linkId)) {
            const link = document.createElement('link');
            link.id = linkId;
            link.rel = 'stylesheet';
            link.href = `https://fonts.googleapis.com/css2?${familiesQuery}&display=swap`;
            document.head.appendChild(link);
        }
    }, [JSON.stringify(fontFamilies)]);
}
