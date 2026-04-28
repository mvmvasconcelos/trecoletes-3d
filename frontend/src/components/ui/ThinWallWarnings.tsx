import { TriangleAlert } from 'lucide-react';

interface ThinWallWarningsProps {
    warnings: string[];
}

export function ThinWallWarnings({ warnings }: ThinWallWarningsProps) {
    if (warnings.length === 0) return null;
    return (
        <div className="bg-amber-950 border border-amber-700 rounded-lg p-3 text-sm text-amber-300 space-y-1.5">
            <p className="font-semibold flex items-center gap-1.5 text-amber-200">
                <TriangleAlert className="w-4 h-4 flex-shrink-0" />
                Parede{warnings.length > 1 ? 's' : ''} fina{warnings.length > 1 ? 's' : ''} detectada{warnings.length > 1 ? 's' : ''}
            </p>
            {warnings.map((w, i) => (
                <p key={i} className="leading-snug">{w}</p>
            ))}
        </div>
    );
}
