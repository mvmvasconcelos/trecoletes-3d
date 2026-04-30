import React from 'react';
import { Link } from 'react-router-dom';
import { Scissors, Image, Type, PenTool, Sliders, FlaskConical, PenLine, KeyRound, Cake, Stamp, GlassWater } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-200 font-sans p-8 flex flex-col items-center">
      <header className="w-full max-w-4xl flex items-center justify-center gap-3 mb-10 text-emerald-500">
        <Scissors className="w-10 h-10" />
        <h1 className="text-4xl font-bold tracking-wider">TRECOLETES 3D</h1>
      </header>

      {/* Seção de Modelos */}
      <div className="w-full max-w-4xl mb-8">
        <h2 className="text-lg font-semibold text-emerald-400 uppercase tracking-widest mb-6">Modelos</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Link to="/cortador-bolacha" className="group rounded-xl border border-neutral-800 bg-neutral-950 p-6 flex flex-col gap-4 hover:border-emerald-500 hover:shadow-lg hover:shadow-emerald-900/20 transition-all">
          <div className="w-12 h-12 rounded-lg bg-emerald-900/30 flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
            <Image className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-neutral-100 group-hover:text-emerald-400 transition-colors">Cortador de Bolacha</h2>
            <p className="text-neutral-500 mt-2 text-sm">Gere cortadores a partir de suas artes em SVG.</p>
          </div>
        </Link>

        <Link to="/cortador-bolacha-formato" className="group rounded-xl border border-neutral-800 bg-neutral-950 p-6 flex flex-col gap-4 hover:border-emerald-500 hover:shadow-lg hover:shadow-emerald-900/20 transition-all">
          <div className="w-12 h-12 rounded-lg bg-emerald-900/30 flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
            <Scissors className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-neutral-100 group-hover:text-emerald-400 transition-colors">Cortador por Formato SVG</h2>
            <p className="text-neutral-500 mt-2 text-sm">Cortador cuja silhueta SVG é a própria forma do cortador, sem carimbo.</p>
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
          <img
            src="/chaveiro_simples_plate_1.png"
            alt="Preview do Chaveiro Simples"
            className="w-full max-w-[220px] h-28 mx-auto rounded-lg border border-neutral-800 bg-neutral-900 object-contain p-1 group-hover:scale-[1.02] transition-transform"
          />
          <div>
            <h2 className="text-xl font-bold text-neutral-100 group-hover:text-emerald-400 transition-colors">Chaveiro Simples</h2>
            <p className="text-neutral-500 mt-2 text-sm">Gere chaveiros com textos personalizados e borda/offest.</p>
          </div>
        </Link>

        <Link to="/chaveiro-sindicato" className="group rounded-xl border border-neutral-800 bg-neutral-950 p-6 flex flex-col gap-4 hover:border-emerald-500 hover:shadow-lg hover:shadow-emerald-900/20 transition-all">
          <div className="w-12 h-12 rounded-lg bg-emerald-900/30 flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
            <KeyRound className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-neutral-100 group-hover:text-emerald-400 transition-colors">Chaveiro Sindicato</h2>
            <p className="text-neutral-500 mt-2 text-sm">Gere nomes na face traseira do chaveiro SSPMVA (Arial Black, 1ª camada espelhada).</p>
          </div>
        </Link>

        <Link to="/chaveiro-simples-svg" className="group rounded-xl border border-neutral-800 bg-neutral-950 p-6 flex flex-col gap-4 hover:border-emerald-500 hover:shadow-lg hover:shadow-emerald-900/20 transition-all">
          <div className="w-12 h-12 rounded-lg bg-emerald-900/30 flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
            <Image className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-neutral-100 group-hover:text-emerald-400 transition-colors">Chaveiro com SVG</h2>
            <p className="text-neutral-500 mt-2 text-sm">Gere chaveiros com texto e uma arte SVG ao lado direito.</p>
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

        <Link to="/tampa-caneta" className="group rounded-xl border border-neutral-800 bg-neutral-950 p-6 flex flex-col gap-4 hover:border-emerald-500 hover:shadow-lg hover:shadow-emerald-900/20 transition-all">
          <div className="w-12 h-12 rounded-lg bg-emerald-900/30 flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
            <PenLine className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-neutral-100 group-hover:text-emerald-400 transition-colors">Tampa de Caneta</h2>
            <p className="text-neutral-500 mt-2 text-sm">Gere tampas personalizadas com furo cônico para canetas BIC.<br />(Em desenvolvimento)</p>
          </div>
        </Link>

        <Link to="/topo-bolo" className="group rounded-xl border border-neutral-800 bg-neutral-950 p-6 flex flex-col gap-4 hover:border-emerald-500 hover:shadow-lg hover:shadow-emerald-900/20 transition-all">
          <div className="w-12 h-12 rounded-lg bg-emerald-900/30 flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
            <Cake className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-neutral-100 group-hover:text-emerald-400 transition-colors">Topo de Bolo</h2>
            <p className="text-neutral-500 mt-2 text-sm">Gere topos de bolo personalizados com texto em relevo e hastes para fixar.</p>
          </div>
        </Link>

        <Link to="/topo-bolo-svg" className="group rounded-xl border border-neutral-800 bg-neutral-950 p-6 flex flex-col gap-4 hover:border-emerald-500 hover:shadow-lg hover:shadow-emerald-900/20 transition-all">
          <div className="w-12 h-12 rounded-lg bg-emerald-900/30 flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
            <Image className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-neutral-100 group-hover:text-emerald-400 transition-colors">Topo de Bolo SVG</h2>
            <p className="text-neutral-500 mt-2 text-sm">Gere topos de bolo a partir de artes em SVG, com relevo e hastes para fixar.</p>
          </div>
        </Link>

        <Link to="/carimbo-eva-svg" className="group rounded-xl border border-neutral-800 bg-neutral-950 p-6 flex flex-col gap-4 hover:border-emerald-500 hover:shadow-lg hover:shadow-emerald-900/20 transition-all">
          <div className="w-12 h-12 rounded-lg bg-emerald-900/30 flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
            <Stamp className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-neutral-100 group-hover:text-emerald-400 transition-colors">Carimbo EVA SVG</h2>
            <p className="text-neutral-500 mt-2 text-sm">Gere kit de carimbo EVA (segurador, molde e forma) a partir de artes SVG.</p>
          </div>
        </Link>

        <Link to="/mexedor-drinks-svg" className="group rounded-xl border border-neutral-800 bg-neutral-950 p-6 flex flex-col gap-4 hover:border-emerald-500 hover:shadow-lg hover:shadow-emerald-900/20 transition-all">
          <div className="w-12 h-12 rounded-lg bg-emerald-900/30 flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
            <GlassWater className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-neutral-100 group-hover:text-emerald-400 transition-colors">Mexedor de Drinks</h2>
            <p className="text-neutral-500 mt-2 text-sm">Gere mexedores de drinks personalizados com arte SVG em relevo e fundo orgânico, circular ou quadrado.</p>
          </div>
        </Link>
        </div>
      </div>

      {/* Separador */}
      <div className="w-full max-w-4xl border-t border-neutral-700 my-8"></div>

      {/* Seção de Testes e Ferramentas */}
      <div className="w-full max-w-4xl">
        <h2 className="text-lg font-semibold text-sky-400 uppercase tracking-widest mb-6">Testes & Ferramentas</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Link to="/teste-tampa-caneta" className="group rounded-xl border border-neutral-800 bg-neutral-950 p-6 flex flex-col gap-4 hover:border-sky-500 hover:shadow-lg hover:shadow-sky-900/20 transition-all">
          <div className="w-12 h-12 rounded-lg bg-sky-900/30 flex items-center justify-center text-sky-500 group-hover:scale-110 transition-transform">
            <FlaskConical className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-neutral-100 group-hover:text-sky-400 transition-colors">Teste Tampa Caneta BIC</h2>
            <p className="text-neutral-500 mt-2 text-sm">Protótipo de encaixe com furo cônico + cilindro final para calibrar folga.</p>
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

        <Link to="/teste-tolerancia-cq" className="group rounded-xl border border-neutral-800 bg-neutral-950 p-6 flex flex-col gap-4 hover:border-violet-500 hover:shadow-lg hover:shadow-violet-900/20 transition-all">
          <div className="w-12 h-12 rounded-lg bg-violet-900/30 flex items-center justify-center text-violet-500 group-hover:scale-110 transition-transform">
            <Sliders className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-neutral-100 group-hover:text-violet-400 transition-colors">Teste de Tolerância (CQ)</h2>
            <p className="text-neutral-500 mt-2 text-sm">Variante CadQuery — largura de texto real via fonttools, sem OpenSCAD.</p>
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
    </div>
  );
}
