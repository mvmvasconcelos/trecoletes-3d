import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import CortadorBolacha from './pages/CortadorBolacha';
import CortadorBolachaFormato from './pages/CortadorBolachaFormato';
import PonteiraLapisSvg from './pages/PonteiraLapisSvg';
import PonteiraLapisTexto from './pages/PonteiraLapisTexto';
import Ferramentas from './pages/Ferramentas';
import ChaveiroSimples from './pages/ChaveiroSimples';
import TesteToleranciaTexto from './pages/TesteToleranciaTexto';
import TesteToleranciaTextoCQ from './pages/TesteToleranciaTextoCQ';
import TesteTampaCaneta from './pages/TesteTampaCaneta';
import TampaCaneta from './pages/TampaCaneta';
import CarimboEvaSvg from './pages/CarimboEvaSvg';
import ChaveiroSindicato from './pages/ChaveiroSindicato';
import ChaveiroSimplesSvg from './pages/ChaveiroSimplesSvg';
import GeradorTopoBolo from './pages/GeradorTopoBolo';
import GeradorTopoBoloSvg from './pages/GeradorTopoBoloSvg';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/cortador-bolacha" element={<CortadorBolacha />} />
        <Route path="/cortador-bolacha-formato" element={<CortadorBolachaFormato />} />
        <Route path="/ponteira-svg" element={<PonteiraLapisSvg />} />
        <Route path="/ponteira-texto" element={<PonteiraLapisTexto />} />
        <Route path="/chaveiro-simples" element={<ChaveiroSimples />} />
        <Route path="/chaveiro-sindicato" element={<ChaveiroSindicato />} />
        <Route path="/chaveiro-simples-svg" element={<ChaveiroSimplesSvg />} />
        <Route path="/tampa-caneta" element={<TampaCaneta />} />
        <Route path="/carimbo-eva-svg" element={<CarimboEvaSvg />} />
        <Route path="/teste-tampa-caneta" element={<TesteTampaCaneta />} />
        <Route path="/teste-tolerancia-texto" element={<TesteToleranciaTexto />} />
        <Route path="/teste-tolerancia-cq" element={<TesteToleranciaTextoCQ />} />
        <Route path="/topo-bolo" element={<GeradorTopoBolo />} />
        <Route path="/topo-bolo-svg" element={<GeradorTopoBoloSvg />} />
        <Route path="/ferramentas" element={<Ferramentas />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
