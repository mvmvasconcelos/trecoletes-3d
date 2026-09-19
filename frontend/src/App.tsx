import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import CortadorBolacha from './pages/CortadorBolacha';
import CortadorBolachaFormato from './pages/CortadorBolachaFormato';
import PonteiraLapisSvg from './pages/PonteiraLapisSvg';
import PonteiraLapisTexto from './pages/PonteiraLapisTexto';
import Ferramentas from './pages/Ferramentas';
import ChaveiroSimples from './pages/ChaveiroSimples';
import TampaBic from './pages/TampaBic';
import CarimboEvaSvg from './pages/CarimboEvaSvg';
import CarimboRelevoSvg from './pages/CarimboRelevoSvg';
import ChaveiroSimplesSvg from './pages/ChaveiroSimplesSvg';
import GeradorTopoBolo from './pages/GeradorTopoBolo';
import GeradorTopoBoloSvg from './pages/GeradorTopoBoloSvg';
import MexedorDrinksSvg from './pages/MexedorDrinksSvg';
import LetreiraSocial from './pages/LetreiraSocial';
import Editor2D from './pages/Editor2D';
import ConversorPngSvg from './pages/ConversorPngSvg';
import CalculadoraPonteiras from './pages/CalculadoraPonteiras';

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/cortador-bolacha" element={<CortadorBolacha />} />
        <Route path="/cortador-bolacha-formato" element={<CortadorBolachaFormato />} />
        <Route path="/ponteira-svg" element={<PonteiraLapisSvg />} />
        <Route path="/ponteira-texto" element={<PonteiraLapisTexto />} />
        <Route path="/chaveiro-simples" element={<ChaveiroSimples />} />
        <Route path="/chaveiro-simples-svg" element={<ChaveiroSimplesSvg />} />
        <Route path="/tampa-bic" element={<TampaBic />} />
        <Route path="/carimbo-eva-svg" element={<CarimboEvaSvg />} />
        <Route path="/carimbo-relevo-svg" element={<CarimboRelevoSvg />} />
        <Route path="/topo-bolo" element={<GeradorTopoBolo />} />
        <Route path="/topo-bolo-svg" element={<GeradorTopoBoloSvg />} />
        <Route path="/mexedor-drinks-svg" element={<MexedorDrinksSvg />} />
        <Route path="/letreiro-social" element={<LetreiraSocial />} />
        <Route path="/ferramentas" element={<Ferramentas />} />
        <Route path="/editor-2d" element={<Editor2D />} />
        <Route path="/conversor-png-svg" element={<ConversorPngSvg />} />
        <Route path="/calculadora-ponteiras" element={<CalculadoraPonteiras />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
