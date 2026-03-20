import React from 'react';
import { Link } from 'react-router-dom';
import { Scissors, Home, ChevronRight } from 'lucide-react';

interface LayoutProps {
  title: string;
  children: React.ReactNode;
}

export function Layout({ title, children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-200 flex flex-col font-sans">
      {/* Header Pipeline Status */}
      <header className="flex items-center justify-between px-6 py-4 bg-neutral-950 border-b border-neutral-800">
        <Link to="/" className="flex items-center gap-3 text-emerald-500 font-bold text-xl tracking-wide hover:text-emerald-400 transition-colors">
          <Scissors className="w-6 h-6" />
          <span>TRECOLETES 3D</span>
        </Link>
        <div className="text-sm text-neutral-500 flex items-center gap-2">
          <Link to="/" className="hover:text-emerald-400 transition-colors flex items-center gap-1">
            <Home className="w-4 h-4" /> Vitrine
          </Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-neutral-400">Produtos</span>
          <ChevronRight className="w-3 h-3" />
          <strong className="text-emerald-400">Gerador: {title}</strong>
        </div>
      </header>
      
      {/* Main App Layout */}
      <main className="flex-1 flex overflow-hidden">
        {children}
      </main>
    </div>
  );
}
