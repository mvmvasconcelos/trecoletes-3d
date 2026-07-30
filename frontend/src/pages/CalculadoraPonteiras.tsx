import { useEffect, useMemo, useState } from 'react';
import { Clock3, Layers, RotateCcw, Timer, Zap } from 'lucide-react';
import { Layout } from '../components/ui/Layout';

type CalcMode = 'pecas' | 'horas';

interface CalibrationSettings {
    minutesPerPiece: number;
    gramsPerPiece: number;
}

const DEFAULT_SETTINGS: CalibrationSettings = {
    minutesPerPiece: 2450 / 190,
    gramsPerPiece: 701.67 / 190,
};

const REFERENCE_PIECES_PER_PLATE = 65;

const STORAGE_KEY = 'ponteira_calculator_settings_v1';

function loadSettings(): CalibrationSettings {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return DEFAULT_SETTINGS;
        const parsed = JSON.parse(raw);
        const isValid =
            typeof parsed?.minutesPerPiece === 'number' &&
            parsed.minutesPerPiece > 0 &&
            typeof parsed?.gramsPerPiece === 'number' &&
            parsed.gramsPerPiece > 0;
        if (!isValid) return DEFAULT_SETTINGS;
        return {
            minutesPerPiece: parsed.minutesPerPiece,
            gramsPerPiece: parsed.gramsPerPiece,
        };
    } catch {
        return DEFAULT_SETTINGS;
    }
}

function formatDuration(totalMinutes: number): string {
    const safeMinutes = Math.max(0, Math.round(totalMinutes));
    const days = Math.floor(safeMinutes / 1440);
    const hours = Math.floor((safeMinutes % 1440) / 60);
    const minutes = safeMinutes % 60;

    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

function roundTo(value: number, digits = 2): string {
    return new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    }).format(value);
}

interface NumberInputProps {
    id: string;
    label: string;
    value: number;
    onChange: (value: number) => void;
    min?: number;
    step?: number;
    suffix?: string;
    hint?: string;
}

function NumberInput({ id, label, value, onChange, min = 0, step = 1, suffix, hint }: NumberInputProps) {
    return (
        <div className="space-y-1.5">
            <label htmlFor={id} className="text-sm font-medium text-neutral-200">
                {label}
            </label>
            <div className="flex items-center gap-2 rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 focus-within:border-emerald-500 transition-colors">
                <input
                    id={id}
                    type="number"
                    min={min}
                    step={step}
                    value={Number.isFinite(value) ? value : 0}
                    onChange={(event) => {
                        const next = Number(event.target.value);
                        onChange(Number.isFinite(next) ? Math.max(min, next) : min);
                    }}
                    className="w-full bg-transparent text-base text-neutral-100 focus:outline-none"
                />
                {suffix && <span className="text-sm text-neutral-400">{suffix}</span>}
            </div>
            {hint && <p className="text-xs text-neutral-500">{hint}</p>}
        </div>
    );
}

export default function CalculadoraPonteiras() {
    const [mode, setMode] = useState<CalcMode>('pecas');
    const [pieceCountInput, setPieceCountInput] = useState('');
    const [targetHours, setTargetHours] = useState(12);
    const [platesInRun, setPlatesInRun] = useState(1);
    const [showCalibration, setShowCalibration] = useState(false);
    const [settings, setSettings] = useState<CalibrationSettings>(() => loadSettings());

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    }, [settings]);

    const values = useMemo(() => {
        const pieceCount = Number(pieceCountInput);
        const parsedPieceCount = Number.isFinite(pieceCount) ? Math.max(0, Math.round(pieceCount)) : 0;
        const piecesByHours = Math.floor((targetHours * 60) / settings.minutesPerPiece);
        const totalPieces = mode === 'pecas' ? parsedPieceCount : Math.max(0, piecesByHours);

        const totalMinutes = totalPieces * settings.minutesPerPiece;
        const totalHoursDecimal = totalMinutes / 60;
        const filamentGrams = totalPieces * settings.gramsPerPiece;

        const platesNeededByCapacity = totalPieces > 0 ? Math.ceil(totalPieces / REFERENCE_PIECES_PER_PLATE) : 0;
        const piecesPerPlateByHours =
            mode === 'horas' && platesInRun > 0 ? Math.ceil(totalPieces / platesInRun) : REFERENCE_PIECES_PER_PLATE;

        return {
            totalPieces,
            totalMinutes,
            totalHoursDecimal,
            filamentGrams,
            platesNeededByCapacity,
            piecesPerPlateByHours,
        };
    }, [mode, pieceCountInput, platesInRun, settings, targetHours]);

    return (
        <Layout title="Calculadora de Ponteiras">
            <section className="flex-1 overflow-y-auto bg-neutral-900">
                <div className="mx-auto w-full max-w-6xl p-4 md:p-6 space-y-4 md:space-y-5">
                    <div className="rounded-2xl border border-emerald-900/70 bg-gradient-to-br from-emerald-950 via-neutral-950 to-neutral-900 p-4 md:p-6">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h1 className="text-2xl md:text-3xl font-bold text-emerald-300 tracking-tight">Calculadora de Ponteiras</h1>
                                <p className="mt-2 text-sm md:text-base text-neutral-300">
                                    Planeje o build por quantidade de peças ou por janela de horas, com estimativa de tempo e filamento.
                                </p>
                            </div>
                            <div className="hidden sm:flex items-center justify-center w-12 h-12 rounded-xl border border-emerald-700/60 bg-emerald-900/30 text-emerald-300">
                                <Timer className="w-6 h-6" />
                            </div>
                        </div>
                        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-sm">
                            <div className="rounded-xl bg-neutral-900/70 border border-neutral-800 px-3 py-2 text-neutral-300">
                                Perfil: <span className="text-emerald-300 font-semibold">ajustável</span>
                            </div>
                            <div className="rounded-xl bg-neutral-900/70 border border-neutral-800 px-3 py-2 text-neutral-300">
                                Referência: <span className="text-emerald-300 font-semibold">~65 peças por mesa</span>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-3">
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => setMode('pecas')}
                                className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                                    mode === 'pecas'
                                        ? 'bg-emerald-600 text-white'
                                        : 'bg-neutral-900 text-neutral-300 hover:bg-neutral-800'
                                }`}
                            >
                                Calcular por peças
                            </button>
                            <button
                                type="button"
                                onClick={() => setMode('horas')}
                                className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                                    mode === 'horas'
                                        ? 'bg-emerald-600 text-white'
                                        : 'bg-neutral-900 text-neutral-300 hover:bg-neutral-800'
                                }`}
                            >
                                Calcular por horas
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 md:p-5 space-y-4">
                            <h2 className="text-sm font-semibold uppercase tracking-widest text-neutral-400">Entradas</h2>

                            {mode === 'pecas' ? (
                                <div className="space-y-1.5">
                                    <label htmlFor="pieceCount" className="text-sm font-medium text-neutral-200">
                                        Quantidade total de peças
                                    </label>
                                    <div className="flex items-center gap-2 rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 focus-within:border-emerald-500 transition-colors">
                                        <input
                                            id="pieceCount"
                                            type="number"
                                            min={0}
                                            step={1}
                                            value={pieceCountInput}
                                            onChange={(event) => setPieceCountInput(event.target.value)}
                                            placeholder="Digite a quantidade"
                                            className="w-full bg-transparent text-base text-neutral-100 placeholder:text-neutral-500 focus:outline-none"
                                        />
                                        <span className="text-sm text-neutral-400">peças</span>
                                    </div>
                                    <p className="text-xs text-neutral-500">Use esse modo quando você já sabe o volume de produção desejado.</p>
                                </div>
                            ) : (
                                <>
                                    <NumberInput
                                        id="targetHours"
                                        label="Horas disponíveis de impressão"
                                        value={targetHours}
                                        onChange={setTargetHours}
                                        min={0}
                                        step={0.5}
                                        suffix="h"
                                        hint="Ex.: impressão noturna de 10h, 12h, 24h etc."
                                    />
                                    <NumberInput
                                        id="platesInRun"
                                        label="Quantidade de mesas no ciclo"
                                        value={platesInRun}
                                        onChange={setPlatesInRun}
                                        min={1}
                                        step={1}
                                        suffix="mesas"
                                        hint="Usado para sugerir quantas peças colocar em cada mesa nesse período."
                                    />
                                </>
                            )}

                            <div className="rounded-xl border border-neutral-800 bg-neutral-900/70 p-3 text-sm text-neutral-400">
                                <p>
                                    Premissas em uso: {roundTo(settings.minutesPerPiece)} min/peça e {roundTo(settings.gramsPerPiece)} g/peça.
                                </p>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 md:p-5 space-y-4">
                            <h2 className="text-sm font-semibold uppercase tracking-widest text-neutral-400">Resultados</h2>

                            <div className="rounded-xl border border-emerald-900/70 bg-emerald-950/30 p-4">
                                <p className="text-xs uppercase tracking-wider text-emerald-300/80">Resumo principal</p>
                                {mode === 'pecas' ? (
                                    <p className="mt-1 text-lg md:text-xl font-semibold text-emerald-200">
                                        {values.totalPieces} peças demandam {formatDuration(values.totalMinutes)}
                                    </p>
                                ) : (
                                    <p className="mt-1 text-lg md:text-xl font-semibold text-emerald-200">
                                        Em {roundTo(targetHours, 1)}h você produz cerca de {values.totalPieces} peças
                                    </p>
                                )}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
                                    <p className="text-xs text-neutral-500 uppercase tracking-wider flex items-center gap-1">
                                        <Clock3 className="w-3.5 h-3.5" /> Tempo total
                                    </p>
                                    <p className="mt-1 text-base font-semibold text-neutral-100">{formatDuration(values.totalMinutes)}</p>
                                    <p className="text-xs text-neutral-500">{roundTo(values.totalHoursDecimal)} horas</p>
                                </div>

                                <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
                                    <p className="text-xs text-neutral-500 uppercase tracking-wider flex items-center gap-1">
                                        <Layers className="w-3.5 h-3.5" /> Mesas
                                    </p>
                                    <p className="mt-1 text-base font-semibold text-neutral-100">
                                        {mode === 'pecas' ? values.platesNeededByCapacity : platesInRun}
                                    </p>
                                    <p className="text-xs text-neutral-500">
                                        {mode === 'pecas'
                                            ? `estimativa com ~${REFERENCE_PIECES_PER_PLATE} peças por mesa`
                                            : `${values.piecesPerPlateByHours} peças sugeridas por mesa`}
                                    </p>
                                </div>

                                <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
                                    <p className="text-xs text-neutral-500 uppercase tracking-wider flex items-center gap-1">
                                        <Zap className="w-3.5 h-3.5" /> Filamento (peso)
                                    </p>
                                    <p className="mt-1 text-base font-semibold text-neutral-100">{roundTo(values.filamentGrams)} g</p>
                                    <p className="text-xs text-neutral-500">aproximado</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 md:p-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <h2 className="text-sm font-semibold uppercase tracking-widest text-neutral-400">Calibracao avancada</h2>
                            <button
                                type="button"
                                onClick={() => setShowCalibration((prev) => !prev)}
                                className="px-3 py-2 rounded-lg text-sm border border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-emerald-500 hover:text-emerald-300 transition-colors"
                            >
                                {showCalibration ? 'Ocultar ajustes' : 'Mostrar ajustes'}
                            </button>
                        </div>

                        {showCalibration && (
                            <div className="mt-4 space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <NumberInput
                                        id="minutesPerPiece"
                                        label="Minutos por peça"
                                        value={settings.minutesPerPiece}
                                        onChange={(value) => setSettings((prev) => ({ ...prev, minutesPerPiece: value || 0.1 }))}
                                        min={0.1}
                                        step={0.01}
                                        suffix="min"
                                    />
                                    <NumberInput
                                        id="gramsPerPiece"
                                        label="Gramas por peça"
                                        value={settings.gramsPerPiece}
                                        onChange={(value) => setSettings((prev) => ({ ...prev, gramsPerPiece: value || 0.01 }))}
                                        min={0.01}
                                        step={0.01}
                                        suffix="g"
                                    />
                                </div>

                                <div className="flex justify-end">
                                    <button
                                        type="button"
                                        onClick={() => setSettings(DEFAULT_SETTINGS)}
                                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-800/80 bg-amber-950/40 text-amber-300 hover:bg-amber-900/50 transition-colors"
                                    >
                                        <RotateCcw className="w-4 h-4" /> Restaurar padrões do teste
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </section>
        </Layout>
    );
}
