import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Boxes, Copy, Download, Layers, Type as TypeIcon, Upload } from 'lucide-react';
import { Layout } from '../components/ui/Layout';
import { EditorCanvas } from '../components/editor2d/EditorCanvas';
import { LayerPanel } from '../components/editor2d/LayerPanel';
import { PartsPanel } from '../components/editor2d/PartsPanel';
import { createDefaultPartSettingsMap, type PartSettingsMap } from '../lib/partSettings';
import Viewer3D from '../components/ui/Viewer3D';
import { parseSvgToShapes } from '../lib/svgImport';
import { DEFAULT_FONT_FILE, FONT_OPTIONS, textToPath } from '../lib/textToPath';
import { offsetShapes } from '../lib/polygonOffset';
import { ALL_PART_IDS, groupLayersByPart } from '../lib/partGrouping';
import { serializePartsToSvg } from '../lib/serializePartToSvg';
import type { EditorLayer, ImageLayer, LayerTransform, PartId, TextLayer } from '../types/editor2d';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

async function downloadBlob(url: string, filename: string) {
    const res = await fetch(url);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(blobUrl);
}

// Fallback stage size used before the canvas container has been measured
// (first render, before the ResizeObserver reports real dimensions).
const DEFAULT_STAGE_WIDTH = 800;
const DEFAULT_STAGE_HEIGHT = 600;

// A newly imported layer is scaled so its longer dimension fills this fraction
// of the shorter stage dimension — keeps both tiny icons and huge traced SVGs
// landing at a sensible, editable size instead of at their raw SVG units.
const IMPORT_FIT_RATIO = 0.6;

// Default margin for the "Duplicar + silhueta" action (lib/polygonOffset.ts). Note:
// this number is in the SAME abstract layer-local units as a layer's own
// width/height/shapes (see polygonOffset.ts's module doc) — this project has no
// explicit mm-to-canvas-unit ratio yet, so "2" here is not literally 2mm. Treating
// it as such is a deliberate, documented simplification; reconciling real-world mm
// with these editor units is left for the 3D-generation step (Group 7).
const DEFAULT_SILHOUETTE_MARGIN = 2;

function isPngFile(file: File): boolean {
    return file.name.toLowerCase().endsWith('.png') || file.type === 'image/png';
}

interface TextDraft {
    text: string;
    fontFile: string;
    fontSize: number;
}

const DEFAULT_TEXT_DRAFT: TextDraft = { text: 'Texto', fontFile: DEFAULT_FONT_FILE, fontSize: 40 };

export default function Editor2D() {
    // 'edit' shows the tools/canvas/parts panels full-width; 'preview' shows the
    // Viewer3D full-width instead. Both live states — none of the 4 panels ever
    // unmount, only their visibility (via a `hidden` class) toggles, so switching
    // modes never resets layers/selectedId/partSettings and never forces the
    // Viewer3D's WebGL context or STL meshes to reload.
    const [mode, setMode] = useState<'edit' | 'preview'>('edit');
    const [layers, setLayers] = useState<EditorLayer[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);

    const [stageSize, setStageSize] = useState({ width: DEFAULT_STAGE_WIDTH, height: DEFAULT_STAGE_HEIGHT });
    const canvasContainerRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const nextImageIndexRef = useRef(1);

    const [textDraft, setTextDraft] = useState<TextDraft>(DEFAULT_TEXT_DRAFT);
    const [isRenderingText, setIsRenderingText] = useState(false);
    const [textError, setTextError] = useState<string | null>(null);
    const nextTextIndexRef = useRef(1);
    // Per-layer counter guarding against out-of-order async responses: if the user
    // edits a text layer's font/size again before an earlier textToPath() call
    // resolves, only the response matching the latest request for that layer id
    // is applied — otherwise a slow first request could overwrite a fast second one.
    const textUpdateTokenRef = useRef<Record<string, number>>({});

    // Measure the canvas area so the Konva Stage always fills it. Extracted as a
    // stable callback so both the mount-time ResizeObserver effect below AND the
    // mode-change effect (right after it) can invoke the same logic.
    const measureCanvasContainer = useCallback(() => {
        const el = canvasContainerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
            setStageSize({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
        }
    }, []);

    // Measure the canvas area so the Konva Stage always fills it, and stays in sync
    // when the sidebar/window resizes.
    useEffect(() => {
        const el = canvasContainerRef.current;
        if (!el) return;

        measureCanvasContainer();
        const observer = new ResizeObserver(measureCanvasContainer);
        observer.observe(el);
        return () => observer.disconnect();
    }, [measureCanvasContainer]);

    // The canvas container is hidden (via the `hidden` class, not unmounted) while
    // in 'preview' mode, so it can report a stale/zero size the whole time — and
    // the ResizeObserver above won't necessarily fire a useful measurement right
    // when it becomes visible again. Re-measure explicitly whenever we come back
    // to 'edit' so the Konva stage isn't left frozen at whatever size it had
    // before the switch (or the DEFAULT_STAGE_WIDTH/HEIGHT fallback).
    useEffect(() => {
        if (mode === 'edit') {
            measureCanvasContainer();
        }
    }, [mode, measureCanvasContainer]);

    const addImageLayer = useCallback((parsed: { shapes: ImageLayer['shapes']; width: number; height: number }) => {
        const stageW = stageSize.width || DEFAULT_STAGE_WIDTH;
        const stageH = stageSize.height || DEFAULT_STAGE_HEIGHT;

        const naturalMax = Math.max(parsed.width, parsed.height, 1);
        const targetMax = Math.min(stageW, stageH) * IMPORT_FIT_RATIO;
        const scale = targetMax / naturalMax;
        const scaledW = parsed.width * scale;
        const scaledH = parsed.height * scale;

        const id = `layer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const name = `Imagem ${nextImageIndexRef.current}`;
        nextImageIndexRef.current += 1;

        const layer: ImageLayer = {
            id,
            type: 'image',
            name,
            partId: null,
            shapes: parsed.shapes,
            width: parsed.width,
            height: parsed.height,
            transform: {
                x: (stageW - scaledW) / 2,
                y: (stageH - scaledH) / 2,
                scaleX: scale,
                scaleY: scale,
                rotation: 0,
            },
        };

        setLayers((prev) => [...prev, layer]);
        setSelectedId(id);
    }, [stageSize]);

    const updateLayerTransform = useCallback((id: string, partial: Partial<LayerTransform>) => {
        setLayers((prev) =>
            prev.map((layer) => (layer.id === id ? { ...layer, transform: { ...layer.transform, ...partial } } : layer))
        );
    }, []);

    const deleteLayer = useCallback((id: string) => {
        setLayers((prev) => prev.filter((layer) => layer.id !== id));
        setSelectedId((prev) => (prev === id ? null : prev));
    }, []);

    // Assigns (or clears, via `null`) which of the up to 4 parts a layer
    // belongs to. See types/editor2d.ts (PartId) and lib/partGrouping.ts,
    // which Group 7 consumes to build the generation request per part.
    const updateLayerPart = useCallback((id: string, partId: PartId | null) => {
        setLayers((prev) => prev.map((layer) => (layer.id === id ? { ...layer, partId } : layer)));
    }, []);

    // Derived grouping of layers by part — see lib/partGrouping.ts for the
    // shape and how Group 7 is expected to consume it.
    const partGroups = useMemo(() => groupLayersByPart(layers), [layers]);

    // Per-part height/color/extruder settings (Group 7's generation panel state).
    // Kept for all 4 possible parts (not just currently-active ones) so a part's
    // configured height/color survives temporarily unassigning/reassigning layers.
    const [partSettings, setPartSettings] = useState<PartSettingsMap>(() => createDefaultPartSettingsMap());
    const updatePartHeight = useCallback((partId: PartId, height: number) => {
        setPartSettings((prev) => ({ ...prev, [partId]: { ...prev[partId], height } }));
    }, []);
    const updatePartColor = useCallback((partId: PartId, color: string) => {
        setPartSettings((prev) => ({ ...prev, [partId]: { ...prev[partId], color } }));
    }, []);
    const updatePartExtruder = useCallback((partId: PartId, extruder: number) => {
        setPartSettings((prev) => ({ ...prev, [partId]: { ...prev[partId], extruder } }));
    }, []);

    // Generation state: POSTs serialized per-part SVGs to the editor_generico backend
    // model (Group 6) and stores back the resulting per-part STL URLs + the combined
    // .3mf URL. See lib/serializePartToSvg.ts for the layer-transform-flattening step
    // that turns each PartGroup into the SVG this request uploads.
    const [isGenerating, setIsGenerating] = useState(false);
    const [generateError, setGenerateError] = useState<string | null>(null);
    const [partStlUrls, setPartStlUrls] = useState<Partial<Record<PartId, string>>>({});
    const [tmfUrl, setTmfUrl] = useState<string | null>(null);

    const handleGenerate = useCallback(async () => {
        if (partGroups.length === 0) return;
        setIsGenerating(true);
        setGenerateError(null);
        try {
            const form = new FormData();
            // All active parts are serialized together so they share one coordinate
            // frame — see lib/serializePartToSvg.ts's module doc for why this must
            // happen in one call, not once per part (that was the cross-part
            // misalignment bug found in manual QA after this group first shipped).
            const svgByPart = serializePartsToSvg(partGroups);
            for (let n = 1; n <= 4; n++) {
                const partId = `part_${n}` as PartId;
                const group = partGroups.find((g) => g.partId === partId);
                if (group) {
                    const svgText = svgByPart[partId] as string;
                    form.append(`part${n}_svg`, new Blob([svgText], { type: 'image/svg+xml' }), `part${n}.svg`);
                    form.append(`part${n}_active`, 'true');
                    form.append(`part${n}_height`, String(partSettings[partId].height));
                    form.append(`extrusor_part${n}`, String(partSettings[partId].extruder));
                } else {
                    // Explicit "false" for every unassigned/empty slot — safer than relying
                    // on the backend's own default for an omitted field (see generator.py:
                    // `_params_dict.get(_slot_flag, "true")` — the backend default is
                    // actually "true", so omitting this for an inactive slot would activate
                    // it with the stale/placeholder SVG from a previous render).
                    form.append(`part${n}_active`, 'false');
                }
            }

            const res = await axios.post(`${API_BASE}/api/generate_parametric/editor_generico`, form);
            if (res.data?.files) {
                const stlUrls: Partial<Record<PartId, string>> = {};
                for (const partId of ALL_PART_IDS) {
                    const rel = res.data.files[partId];
                    if (rel) stlUrls[partId] = `${API_BASE}${rel}`;
                }
                setPartStlUrls(stlUrls);
                setTmfUrl(res.data.files['3mf'] ? `${API_BASE}${res.data.files['3mf']}` : null);
                setMode('preview');
            }
        } catch (err: any) {
            setGenerateError(err?.response?.data?.error ?? err?.message ?? 'Erro ao gerar modelo 3D.');
            setPartStlUrls({});
            setTmfUrl(null);
        } finally {
            setIsGenerating(false);
        }
    }, [partGroups, partSettings]);

    const extraMeshes = useMemo(
        () =>
            ALL_PART_IDS.filter((partId) => partStlUrls[partId]).map((partId) => ({
                url: partStlUrls[partId] as string,
                color: partSettings[partId].color,
            })),
        [partStlUrls, partSettings]
    );

    const [silhouetteMargin, setSilhouetteMargin] = useState(DEFAULT_SILHOUETTE_MARGIN);
    const [isComputingSilhouette, setIsComputingSilhouette] = useState(false);
    const [silhouetteError, setSilhouetteError] = useState<string | null>(null);
    const selectedLayer = selectedId ? layers.find((l) => l.id === selectedId) ?? null : null;

    // "Duplicar + silhueta": takes the selected layer's shapes, expands their
    // geometry outward by `silhouetteMargin` (lib/polygonOffset.ts — real path
    // offsetting via paper.js + clipper-lib, not a visual stroke), and adds the
    // result as a brand-new, independent ImageLayer — a text layer's silhouette is
    // still just a set of vector paths, not text, so it's modeled as an ImageLayer
    // like any imported art (see types/editor2d.ts).
    //
    // The new layer's transform is derived from the source layer's, corrected for
    // the origin shift offsetShapes() reports (expanding outward moves the shapes'
    // local (0,0) corner) so the silhouette renders centered on the original
    // artwork instead of offset from it. This correction accounts for rotation:
    // a rotated source layer's local axes aren't aligned with the canvas axes, so
    // the shift has to be rotated into canvas space before being applied to x/y.
    const handleDuplicateSilhouette = useCallback(() => {
        const source = selectedLayer;
        if (!source) return;
        setSilhouetteError(null);
        setIsComputingSilhouette(true);
        // offsetShapes() is synchronous and can be CPU-heavy on complex paths (see
        // its module doc — paper.js/clipper-lib have no async/worker path here).
        // Deferring to the next tick lets React paint the "Gerando..." state first;
        // without this the button label would only ever appear after the work is
        // already done, since nothing yields back to the browser mid-computation.
        setTimeout(() => {
            try {
                const result = offsetShapes(source.shapes, silhouetteMargin);

                const rad = (source.transform.rotation * Math.PI) / 180;
                const cos = Math.cos(rad);
                const sin = Math.sin(rad);
                const worldShiftX =
                    result.originShiftX * source.transform.scaleX * cos -
                    result.originShiftY * source.transform.scaleY * sin;
                const worldShiftY =
                    result.originShiftX * source.transform.scaleX * sin +
                    result.originShiftY * source.transform.scaleY * cos;

                const id = `layer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                const newLayer: ImageLayer = {
                    id,
                    type: 'image',
                    name: `${source.name} (silhueta)`,
                    partId: null,
                    shapes: result.shapes,
                    width: result.width,
                    height: result.height,
                    transform: {
                        ...source.transform,
                        x: source.transform.x - worldShiftX,
                        y: source.transform.y - worldShiftY,
                    },
                };

                setLayers((prev) => [...prev, newLayer]);
                setSelectedId(id);
            } catch (err: any) {
                setSilhouetteError(err?.message ?? 'Erro ao gerar silhueta.');
            } finally {
                setIsComputingSilhouette(false);
            }
        }, 0);
    }, [selectedLayer, silhouetteMargin]);

    // When the user selects an existing text layer (e.g. clicking it in the
    // LayerPanel), sync the "add text" form to that layer's current values so
    // editing continues seamlessly instead of showing stale draft values.
    // Depends only on `selectedId` — reacting to every `layers` change too would
    // fight the user's typing (see handleTextFieldChange below, which is the
    // thing that changes `layers` while this layer stays selected).
    useEffect(() => {
        if (!selectedId) return;
        const layer = layers.find((l) => l.id === selectedId);
        if (layer && layer.type === 'text') {
            setTextDraft({ text: layer.text, fontFile: layer.fontFamily, fontSize: layer.fontSize });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: only re-sync when the selection changes, not on every layers update
    }, [selectedId]);

    // Regenerates an existing text layer's glyph shapes in place (text/font/size
    // change) — never creates a new layer. This is what satisfies "changing the
    // font or text updates the existing layer's path instead of duplicating it".
    const regenerateTextLayer = useCallback(async (id: string, draft: TextDraft) => {
        const token = (textUpdateTokenRef.current[id] ?? 0) + 1;
        textUpdateTokenRef.current[id] = token;
        setTextError(null);
        setIsRenderingText(true);
        try {
            const result = await textToPath(draft.text, draft.fontFile, draft.fontSize);
            if (textUpdateTokenRef.current[id] !== token) return; // superseded by a newer edit
            setLayers((prev) =>
                prev.map((layer) =>
                    layer.id === id && layer.type === 'text'
                        ? {
                              ...layer,
                              text: draft.text,
                              fontFamily: draft.fontFile,
                              fontSize: draft.fontSize,
                              shapes: result.shapes,
                              width: result.width,
                              height: result.height,
                          }
                        : layer
                )
            );
        } catch (err: any) {
            if (textUpdateTokenRef.current[id] !== token) return;
            setTextError(err?.message ?? 'Erro ao gerar texto.');
        } finally {
            if (textUpdateTokenRef.current[id] === token) setIsRenderingText(false);
        }
    }, []);

    // Updates the "add text" form draft. If the currently selected layer is a
    // text layer, the edit also applies live to that layer (see regenerateTextLayer)
    // instead of only sitting in the draft — that's the "live edit" behavior.
    // Adding a brand-new layer is a separate, explicit action (handleAddTextLayer).
    const handleTextFieldChange = (partial: Partial<TextDraft>) => {
        const next = { ...textDraft, ...partial };
        setTextDraft(next);
        const current = selectedId ? layers.find((l) => l.id === selectedId) : undefined;
        if (current && current.type === 'text') {
            void regenerateTextLayer(current.id, next);
        }
    };

    const handleAddTextLayer = useCallback(async () => {
        setTextError(null);
        setIsRenderingText(true);
        try {
            const result = await textToPath(textDraft.text, textDraft.fontFile, textDraft.fontSize);
            const stageW = stageSize.width || DEFAULT_STAGE_WIDTH;
            const stageH = stageSize.height || DEFAULT_STAGE_HEIGHT;

            const naturalMax = Math.max(result.width, result.height, 1);
            const targetMax = Math.min(stageW, stageH) * IMPORT_FIT_RATIO;
            const scale = targetMax / naturalMax;
            const scaledW = result.width * scale;
            const scaledH = result.height * scale;

            const id = `layer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const name = `Texto ${nextTextIndexRef.current}`;
            nextTextIndexRef.current += 1;

            const layer: TextLayer = {
                id,
                type: 'text',
                name,
                partId: null,
                text: textDraft.text,
                fontFamily: textDraft.fontFile,
                fontSize: textDraft.fontSize,
                shapes: result.shapes,
                width: result.width,
                height: result.height,
                transform: {
                    x: (stageW - scaledW) / 2,
                    y: (stageH - scaledH) / 2,
                    scaleX: scale,
                    scaleY: scale,
                    rotation: 0,
                },
            };

            setLayers((prev) => [...prev, layer]);
            setSelectedId(id);
        } catch (err: any) {
            setTextError(err?.message ?? 'Erro ao gerar texto.');
        } finally {
            setIsRenderingText(false);
        }
    }, [textDraft, stageSize]);

    const triggerFilePicker = () => {
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
            fileInputRef.current.click();
        }
    };

    // Accepts .svg and .png. PNG goes through the same server-side trace endpoint
    // used by ChaveiroSimplesSvg.tsx (extension/MIME-type detection + POST to
    // /api/convert/png-to-svg) before both formats converge on the same SVG parsing path.
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadError(null);
        setIsUploading(true);
        try {
            let svgText: string;
            if (isPngFile(file)) {
                const form = new FormData();
                form.append('file', file, file.name);
                const res = await axios.post<string>(`${API_BASE}/api/convert/png-to-svg`, form, {
                    responseType: 'text',
                });
                svgText = res.data;
            } else {
                svgText = await file.text();
            }

            const parsed = await parseSvgToShapes(svgText);
            addImageLayer(parsed);
        } catch (err: any) {
            setUploadError(err?.response?.data?.error ?? err?.message ?? 'Erro ao importar arquivo.');
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    return (
        <Layout title="Editor 2D">
            <aside
                className={
                    mode === 'edit'
                        ? 'w-80 flex-shrink-0 min-h-0 bg-neutral-950 border-r border-neutral-800 flex flex-col'
                        : 'hidden'
                }
            >
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    <div className="border border-neutral-800 rounded-lg overflow-hidden">
                        <div className="flex items-center gap-2 px-3 py-2.5 bg-neutral-900">
                            <Upload className="w-3.5 h-3.5 text-neutral-400" />
                            <span className="text-xs font-semibold text-neutral-400 uppercase tracking-widest">
                                Adicionar imagem
                            </span>
                        </div>
                        <div className="px-3 pb-3 pt-2 space-y-2 bg-neutral-950 rounded-b-lg">
                            <input
                                ref={fileInputRef}
                                type="file"
                                className="hidden"
                                accept=".svg,.png"
                                onChange={handleFileUpload}
                            />
                            {isUploading ? (
                                <div className="w-full border-2 border-dashed border-amber-700/50 rounded-lg p-4 text-center bg-neutral-950/50">
                                    <span className="text-amber-400 text-sm animate-pulse">Importando...</span>
                                </div>
                            ) : (
                                <button
                                    onClick={triggerFilePicker}
                                    className="w-full border-2 border-dashed border-neutral-700 hover:border-emerald-500 rounded-lg p-4 text-center cursor-pointer transition-colors bg-neutral-950/50"
                                >
                                    <Upload className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
                                    <span className="text-emerald-400 font-medium text-sm block">Selecionar SVG ou PNG</span>
                                    <span className="text-xs text-neutral-500">Vira uma camada no canvas</span>
                                </button>
                            )}
                            {uploadError && (
                                <div className="bg-red-950 border border-red-800 rounded-lg p-2 text-xs text-red-300">
                                    {uploadError}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="border border-neutral-800 rounded-lg overflow-hidden">
                        <div className="flex items-center gap-2 px-3 py-2.5 bg-neutral-900">
                            <TypeIcon className="w-3.5 h-3.5 text-neutral-400" />
                            <span className="text-xs font-semibold text-neutral-400 uppercase tracking-widest">
                                {selectedLayer?.type === 'text' ? 'Editando texto' : 'Adicionar texto'}
                            </span>
                        </div>
                        <div className="px-3 pb-3 pt-2 space-y-2 bg-neutral-950 rounded-b-lg">
                            <input
                                type="text"
                                value={textDraft.text}
                                onChange={(e) => handleTextFieldChange({ text: e.target.value })}
                                placeholder="Digite um texto"
                                className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-neutral-200 focus:outline-none focus:border-emerald-600"
                            />
                            <div className="flex gap-2">
                                <select
                                    value={textDraft.fontFile}
                                    onChange={(e) => handleTextFieldChange({ fontFile: e.target.value })}
                                    className="flex-1 min-w-0 bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-2 text-sm text-neutral-200 focus:outline-none focus:border-emerald-600"
                                >
                                    {FONT_OPTIONS.map((font) => (
                                        <option key={font.file} value={font.file}>
                                            {font.label}
                                        </option>
                                    ))}
                                </select>
                                <input
                                    type="number"
                                    min={5}
                                    max={500}
                                    value={textDraft.fontSize}
                                    onChange={(e) =>
                                        handleTextFieldChange({ fontSize: Number(e.target.value) || 1 })
                                    }
                                    className="w-20 bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-2 text-sm text-neutral-200 focus:outline-none focus:border-emerald-600"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={handleAddTextLayer}
                                disabled={isRenderingText || textDraft.text.trim().length === 0}
                                className="w-full border-2 border-dashed border-neutral-700 hover:border-emerald-500 rounded-lg p-2 text-center cursor-pointer transition-colors bg-neutral-950/50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <span className="text-emerald-400 font-medium text-sm">
                                    {isRenderingText
                                        ? 'Gerando...'
                                        : selectedLayer?.type === 'text'
                                          ? 'Nova camada de texto'
                                          : 'Adicionar camada de texto'}
                                </span>
                            </button>
                            {textError && (
                                <div className="bg-red-950 border border-red-800 rounded-lg p-2 text-xs text-red-300">
                                    {textError}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="space-y-3">
                        <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-widest flex items-center gap-2">
                            <Layers className="w-3.5 h-3.5" /> Camadas
                        </h2>
                        <LayerPanel
                            layers={layers}
                            selectedId={selectedId}
                            onSelect={setSelectedId}
                            onDelete={deleteLayer}
                            onAssignPart={updateLayerPart}
                        />
                    </div>

                    {selectedLayer && (
                        <div className="border border-neutral-800 rounded-lg overflow-hidden">
                            <div className="flex items-center gap-2 px-3 py-2.5 bg-neutral-900">
                                <Copy className="w-3.5 h-3.5 text-neutral-400" />
                                <span className="text-xs font-semibold text-neutral-400 uppercase tracking-widest">
                                    Duplicar + silhueta
                                </span>
                            </div>
                            <div className="px-3 pb-3 pt-2 space-y-2 bg-neutral-950 rounded-b-lg">
                                <label className="flex items-center gap-2 text-xs text-neutral-400">
                                    Margem (unid. do editor)
                                    <input
                                        type="number"
                                        step={0.5}
                                        value={silhouetteMargin}
                                        onChange={(e) => setSilhouetteMargin(Number(e.target.value) || 0)}
                                        className="w-20 bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1 text-sm text-neutral-200 focus:outline-none focus:border-emerald-600"
                                    />
                                </label>
                                <button
                                    type="button"
                                    onClick={handleDuplicateSilhouette}
                                    disabled={isComputingSilhouette}
                                    className="w-full border-2 border-dashed border-neutral-700 hover:border-emerald-500 rounded-lg p-2 text-center cursor-pointer transition-colors bg-neutral-950/50 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <span className="text-emerald-400 font-medium text-sm">
                                        {isComputingSilhouette ? 'Gerando...' : 'Duplicar + silhueta'}
                                    </span>
                                </button>
                                <p className="text-[11px] text-neutral-600">
                                    Duplica "{selectedLayer.name}" e expande o contorno para fora pela margem acima.
                                </p>
                                {silhouetteError && (
                                    <div className="bg-red-950 border border-red-800 rounded-lg p-2 text-xs text-red-300">
                                        {silhouetteError}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </aside>

            <section
                className={
                    mode === 'edit'
                        ? 'flex-1 p-4 relative min-w-0 min-h-0 flex flex-col gap-3'
                        : 'hidden'
                }
            >
                <div
                    ref={canvasContainerRef}
                    className="flex-1 relative min-h-0 rounded-lg border border-dashed border-neutral-800 bg-neutral-950 overflow-hidden"
                >
                    <EditorCanvas
                        layers={layers}
                        selectedId={selectedId}
                        onSelect={setSelectedId}
                        onTransformChange={updateLayerTransform}
                        width={stageSize.width}
                        height={stageSize.height}
                    />
                </div>
            </section>

            <aside
                className={
                    mode === 'edit'
                        ? 'w-72 flex-shrink-0 min-h-0 bg-neutral-950 border-l border-neutral-800 flex flex-col'
                        : 'hidden'
                }
            >
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-widest flex items-center gap-2">
                        <Boxes className="w-3.5 h-3.5" /> Partes (geração 3D)
                    </h2>
                    <PartsPanel
                        partGroups={partGroups}
                        settings={partSettings}
                        onChangeHeight={updatePartHeight}
                        onChangeColor={updatePartColor}
                        onChangeExtruder={updatePartExtruder}
                    />
                    {generateError && (
                        <div className="bg-red-950 border border-red-800 rounded-lg p-3 text-sm text-red-300">
                            {generateError}
                        </div>
                    )}
                </div>
                <div className="p-4 border-t border-neutral-800 bg-neutral-950">
                    <button
                        type="button"
                        onClick={handleGenerate}
                        disabled={isGenerating || partGroups.length === 0}
                        className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded shadow-lg transition-all"
                    >
                        {isGenerating ? 'Gerando...' : 'Gerar 3D'}
                    </button>
                    {partGroups.length === 0 && (
                        <p className="text-xs text-neutral-500 text-center mt-2">
                            Atribua camadas a uma parte para habilitar a geração
                        </p>
                    )}
                </div>
            </aside>

            <section
                className={
                    mode === 'preview'
                        ? 'flex-1 p-4 relative min-w-0 min-h-0 flex flex-col gap-3 border-l border-neutral-800'
                        : 'hidden'
                }
            >
                <div className="flex-1 relative min-h-0">
                    <div className="absolute inset-0">
                        <Viewer3D
                            carimbBaseUrl={null}
                            carimbArteUrl={null}
                            cortadorUrl={null}
                            isGenerating={isGenerating}
                            artColor="#FFFFFF"
                            modelColor="#FFFFFF"
                            modelType="default"
                            extraMeshes={extraMeshes}
                        />
                    </div>
                </div>
                <div className="flex-shrink-0 flex flex-col items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setMode('edit')}
                        className="flex items-center gap-2 px-6 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white font-semibold rounded-lg shadow-lg text-sm transition-colors"
                    >
                        Voltar para o Editor
                    </button>
                    {tmfUrl && (
                        <button
                            type="button"
                            onClick={() => downloadBlob(tmfUrl, 'editor_2d_camadas.3mf')}
                            className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg shadow-lg text-sm transition-colors"
                        >
                            <Download className="w-4 h-4" /> Exportar 3MF
                        </button>
                    )}
                </div>
            </section>
        </Layout>
    );
}
