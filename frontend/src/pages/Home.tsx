import React from 'react';
import { Link } from 'react-router-dom';
import { Scissors, Image, Type, PenTool, Sliders, Key } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-200 font-sans p-8 flex flex-col items-center">
      <header className="w-full max-w-4xl flex items-center justify-center gap-3 mb-10 text-emerald-500">
        <Scissors className="w-10 h-10" />
        <h1 className="text-4xl font-bold tracking-wider">TRECOLETES 3D</h1>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-4xl">
        <Link to="/cortador-bolacha" className="group rounded-xl border border-neutral-800 bg-neutral-950 p-6 flex flex-col gap-4 hover:border-emerald-500 hover:shadow-lg hover:shadow-emerald-900/20 transition-all">
          <div className="w-12 h-12 rounded-lg bg-emerald-900/30 flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
            <Image className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-neutral-100 group-hover:text-emerald-400 transition-colors">Cortador de Bolacha</h2>
            <p className="text-neutral-500 mt-2 text-sm">Gere cortadores a partir de suas artes em SVG.</p>
          </div>
        </Link>

        <Link to="/ponteira-svg" className="group rounded-xl border border-neutral-800 bg-neutral-950 p-6 flex flex-col gap-4 hover:border-emerald-500 hover:shadow-lg hover:shadow-emerald-900/20 transition-all">
          <div className="w-12 h-12 rounded-lg bg-emerald-900/30 flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
            <PenTool className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-neutral-100 group-hover:text-emerald-400 transition-colors">Ponteira de Lápis (SVG)</h2>
            <p className="text-neutral-500 mt-2 text-sm">Crie ponteiras personalizadas a partir de vetores SVG.</p>
          </div>
        </Link>

        <Link to="/chaveiro-simples" className="group rounded-xl border border-neutral-800 bg-neutral-950 p-6 flex flex-col gap-4 hover:border-emerald-500 hover:shadow-lg hover:shadow-emerald-900/20 transition-all">
          <div className="w-12 h-12 rounded-lg bg-emerald-900/30 flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
            <Key className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-neutral-100 group-hover:text-emerald-400 transition-colors">Chaveiro Simples</h2>
            <p className="text-neutral-500 mt-2 text-sm">Gere chaveiros com textos personalizados e borda/offest.</p>
          </div>
        </Link>

        <Link to="/ponteira-texto" className="group rounded-xl border border-neutral-800 bg-neutral-950 p-6 flex flex-col gap-4 hover:border-emerald-500 hover:shadow-lg hover:shadow-emerald-900/20 transition-all">
          <div className="w-12 h-12 rounded-lg bg-emerald-900/30 flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
            <Type className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-neutral-100 group-hover:text-emerald-400 transition-colors">Ponteira com Texto</h2>
            <p className="text-neutral-500 mt-2 text-sm">Gere ponteiras com nomes e textos 3D multicoloridos.</p>
          </div>
        </Link>

        <Link to="/teste-tolerancia-texto" className="group rounded-xl border border-neutral-800 bg-neutral-950 p-6 flex flex-col gap-4 hover:border-emerald-500 hover:shadow-lg hover:shadow-emerald-900/20 transition-all">
          <div className="w-12 h-12 rounded-lg bg-emerald-900/30 flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
            <Sliders className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-neutral-100 group-hover:text-emerald-400 transition-colors">Teste de Tolerância Texto</h2>
            <p className="text-neutral-500 mt-2 text-sm">Teste tolerâncias de encaixe com textos subtraídos em chapas.</p>
          </div>
        </Link>

        <Link to="/ferramentas" className="group rounded-xl border border-neutral-800 bg-neutral-950 p-6 flex flex-col gap-4 hover:border-amber-500 hover:shadow-lg hover:shadow-amber-900/20 transition-all">
          <div className="w-12 h-12 rounded-lg bg-amber-900/30 flex items-center justify-center text-amber-500 group-hover:scale-110 transition-transform">
            <Sliders className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-neutral-100 group-hover:text-amber-400 transition-colors">Ferramentas de Teste</h2>
            <p className="text-neutral-500 mt-2 text-sm">Calibre furos e outras utilidades técnicas de impressão 3D.</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
