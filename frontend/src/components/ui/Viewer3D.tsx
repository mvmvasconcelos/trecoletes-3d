import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Canvas, useLoader, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Center, Line, Html, GizmoHelper, GizmoViewport } from '@react-three/drei';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import a1BuildPlateUrl from './A1_build_plate.stl?url';

// ------------------------------------------------------------------
// Camera HUD
// ------------------------------------------------------------------
interface CameraInfo {
    px: number; py: number; pz: number;
    tx: number; ty: number; tz: number;
    fov: number;
}

function CameraTracker({ onUpdate }: { onUpdate: (info: CameraInfo) => void }) {
    const { camera } = useThree();
    useFrame(() => {
        const pos = camera.position;
        const target = (camera as any).__orbitTarget as THREE.Vector3 | undefined;
        onUpdate({
            px: pos.x, py: pos.y, pz: pos.z,
            tx: target?.x ?? 0, ty: target?.y ?? 0, tz: target?.z ?? 0,
            fov: (camera as THREE.PerspectiveCamera).fov ?? 0,
        });
    });
    return null;
}

function ControlsWithTarget() {
    return (
        <OrbitControls
            makeDefault
            target={[0, 0, 0]}
            minDistance={120}
            maxDistance={900}
            onChange={(e) => {
                if (e?.target?.object) {
                    (e.target.object as any).__orbitTarget = e.target.target.clone();
                }
            }}
        />
    );
}

function PlateVisibilityTracker({ onUnderPlateChange }: { onUnderPlateChange: (isUnder: boolean) => void }) {
    const { camera } = useThree();
    useFrame(() => {
        onUnderPlateChange(camera.position.z < 4);
    });
    return null;
}

function ViewResetter({ resetToken, initialCamera }: { resetToken: number; initialCamera: [number, number, number] }) {
    const { camera, controls } = useThree();
    const animatingRef = useRef(false);
    const startTimeRef = useRef(0);
    const durationRef = useRef(0.45); // segundos
    const startPosRef = useRef(new THREE.Vector3());
    const endPosRef = useRef(new THREE.Vector3());
    const startTargetRef = useRef(new THREE.Vector3());
    const endTargetRef = useRef(new THREE.Vector3(0, 0, 0));

    useEffect(() => {
        const c = controls as any;
        if (!c?.addEventListener) return;

        const cancelAnimation = () => {
            animatingRef.current = false;
        };

        c.addEventListener('start', cancelAnimation);
        return () => c.removeEventListener('start', cancelAnimation);
    }, [controls]);

    useFrame(() => {
        if (!animatingRef.current) return;

        const elapsed = performance.now() / 1000 - startTimeRef.current;
        const t = Math.min(1, elapsed / durationRef.current);
        const easeOut = 1 - Math.pow(1 - t, 3);

        camera.position.lerpVectors(startPosRef.current, endPosRef.current, easeOut);

        const c = controls as any;
        if (c?.target) {
            c.target.lerpVectors(startTargetRef.current, endTargetRef.current, easeOut);
            c.update?.();
            (camera as any).__orbitTarget = c.target.clone();
        } else {
            (camera as any).__orbitTarget = new THREE.Vector3(0, 0, 0);
        }

        if (t >= 1) {
            animatingRef.current = false;
        }
    });

    useEffect(() => {
        if (resetToken === 0) return;
        startPosRef.current.copy(camera.position);
        endPosRef.current.set(initialCamera[0], initialCamera[1], initialCamera[2]);

        const c = controls as any;
        if (c?.target) {
            startTargetRef.current.copy(c.target);
        } else {
            const fallback = (camera as any).__orbitTarget as THREE.Vector3 | undefined;
            startTargetRef.current.copy(fallback ?? new THREE.Vector3(0, 0, 0));
        }

        startTimeRef.current = performance.now() / 1000;
        animatingRef.current = true;
    }, [resetToken, camera, controls, initialCamera]);

    return null;
}

// ------------------------------------------------------------------
// STL meshes
// ------------------------------------------------------------------
function StlMesh({ url, color }: { url: string; color: string }) {
    const geom = useLoader(STLLoader, url);
    return (
        <mesh geometry={geom} castShadow receiveShadow>
            <meshStandardMaterial
                color={color}
                roughness={0.4}
                metalness={0.1}
                polygonOffset
                polygonOffsetFactor={-1}
                polygonOffsetUnits={-1}
            />
        </mesh>
    );
}

function PlaceholderModel() {
    return (
        <mesh castShadow receiveShadow>
            <boxGeometry args={[40, 40, 10]} />
            <meshStandardMaterial color="#404040" metalness={0.2} roughness={0.3} />
        </mesh>
    );
}

function BuildPlateA1({
    isUnderPlateView = false,
}: {
    isUnderPlateView?: boolean;
}) {
    const plateGeom = useLoader(STLLoader, a1BuildPlateUrl);
    const peiTexture = useMemo(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = '#d2b258';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Grão fino para lembrar a textura de chapa PEI.
            for (let i = 0; i < 17000; i++) {
                const x = Math.random() * canvas.width;
                const y = Math.random() * canvas.height;
                const a = 0.05 + Math.random() * 0.14;
                const warm = 205 + Math.floor(Math.random() * 38);
                const cool = 118 + Math.floor(Math.random() * 26);
                ctx.fillStyle = `rgba(${warm}, ${warm - 12}, ${cool}, ${a.toFixed(3)})`;
                ctx.fillRect(x, y, 1.0, 1.0);
            }

            for (let i = 0; i < 5200; i++) {
                const x = Math.random() * canvas.width;
                const y = Math.random() * canvas.height;
                const a = 0.03 + Math.random() * 0.06;
                ctx.fillStyle = `rgba(116, 98, 42, ${a.toFixed(3)})`;
                ctx.fillRect(x, y, 1.0, 1.0);
            }
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(2.8, 2.8);
        tex.anisotropy = 4;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
        return tex;
    }, []);
    const { center, minZ } = useMemo(() => {
        plateGeom.computeBoundingBox();
        const bb = plateGeom.boundingBox;
        if (!bb) {
            return {
                center: new THREE.Vector3(0, 0, 0),
                minZ: 0,
            };
        }
        return {
            center: new THREE.Vector3(
                (bb.min.x + bb.max.x) * 0.5,
                (bb.min.y + bb.max.y) * 0.5,
                (bb.min.z + bb.max.z) * 0.5,
            ),
            minZ: bb.min.z,
        };
    }, [plateGeom]);

    // Traz a chapa para o centro do mundo e apoia no plano Z=0.
    const platePosition: [number, number, number] = [
        -center.x,
        -center.y,
        -minZ - 0.5,
    ];
    const bodyOpacityFinal = isUnderPlateView ? 0.12 : 0.42;
    const plateMaterialBase = {
        transparent: true,
        side: THREE.DoubleSide as THREE.Side,
        depthWrite: false,
        depthTest: !isUnderPlateView,
    };

    return (
        <group receiveShadow>
            {/* Chapa real da A1 via STL */}
            <mesh geometry={plateGeom} position={platePosition} receiveShadow>
                <meshStandardMaterial
                    color="#dfc56a"
                    map={peiTexture}
                    roughness={0.9}
                    metalness={0.18}
                    emissive="#3a3116"
                    emissiveIntensity={0.08}
                    {...plateMaterialBase}
                    opacity={bodyOpacityFinal}
                />
            </mesh>
        </group>
    );
}

interface ModelBounds {
    min: [number, number, number];
    max: [number, number, number];
    size: [number, number, number];
}

function DimensionLabel({ pos, text }: { pos: [number, number, number]; text: string }) {
    return (
        <Html position={pos} center occlude={false} zIndexRange={[120, 0]}>
            <div
                className="px-2.5 py-1 rounded-md bg-black/85 border border-emerald-400/80 text-emerald-300 text-[13px] font-bold whitespace-nowrap shadow-lg shadow-emerald-950/60"
                style={{ pointerEvents: 'none' }}
            >
                {text}
            </div>
        </Html>
    );
}

function DimensionOverlay({ bounds, visible }: { bounds: ModelBounds | null; visible: boolean }) {
    if (!visible || !bounds) return null;

    const [minX, minY, minZ] = bounds.min;
    const [maxX, maxY, maxZ] = bounds.max;
    const [sizeX, sizeY, sizeZ] = bounds.size;
    const fmt = (n: number) => `${n.toFixed(2)}mm`;
    const off = 10;
    const tick = 2.2;

    const xY = maxY + off;
    const yX = maxX + off;
    const zX = minX - off;
    const zY = minY - off;

    return (
        <group>
            {/* Eixo X */}
            <Line points={[[minX, xY, minZ], [maxX, xY, minZ]]} color="#22c55e" lineWidth={1.5} />
            <Line points={[[minX, xY - tick, minZ], [minX, xY + tick, minZ]]} color="#22c55e" lineWidth={1.2} />
            <Line points={[[maxX, xY - tick, minZ], [maxX, xY + tick, minZ]]} color="#22c55e" lineWidth={1.2} />
            <DimensionLabel pos={[(minX + maxX) / 2, xY + 2.6, maxZ + 1.6]} text={fmt(sizeX)} />

            {/* Eixo Y */}
            <Line points={[[yX, minY, minZ], [yX, maxY, minZ]]} color="#22c55e" lineWidth={1.5} />
            <Line points={[[yX - tick, minY, minZ], [yX + tick, minY, minZ]]} color="#22c55e" lineWidth={1.2} />
            <Line points={[[yX - tick, maxY, minZ], [yX + tick, maxY, minZ]]} color="#22c55e" lineWidth={1.2} />
            <DimensionLabel pos={[yX + 2.8, (minY + maxY) / 2, maxZ + 1.6]} text={fmt(sizeY)} />

            {/* Eixo Z */}
            <Line points={[[zX, zY, minZ], [zX, zY, maxZ]]} color="#22c55e" lineWidth={1.5} />
            <Line points={[[zX - tick, zY, minZ], [zX + tick, zY, minZ]]} color="#22c55e" lineWidth={1.2} />
            <Line points={[[zX - tick, zY, maxZ], [zX + tick, zY, maxZ]]} color="#22c55e" lineWidth={1.2} />
            <DimensionLabel pos={[zX + 3.2, zY, (minZ + maxZ) / 2]} text={fmt(sizeZ)} />
        </group>
    );
}

// ------------------------------------------------------------------
// Props & Main Viewer
// ------------------------------------------------------------------
export interface Viewer3DProps {
    carimbBaseUrl: string | null;
    carimbArteUrl: string | null;
    cortadorUrl: string | null;
    isGenerating: boolean;
    artColor: string;
    modelColor: string;
    modelType?: 'cortador' | 'ponteira' | 'ferramenta' | 'default';
    artOffset?: [number, number, number];
    showBuildPlate?: boolean;
}

export default function Viewer3D({ carimbBaseUrl, carimbArteUrl, cortadorUrl, isGenerating, artColor, modelColor, modelType = 'default', artOffset, showBuildPlate = true }: Viewer3DProps) {
    const MODEL_Z_LIFT = 0.8;
    const INITIAL_CAMERA = useMemo<[number, number, number]>(() => [0, -300, 210], []);
    const modelRef = useRef<THREE.Group>(null);
    const [camInfo, setCamInfo] = useState<CameraInfo | null>(null);
    const [isUnderPlateView, setIsUnderPlateView] = useState(false);
    const [showDimensions, setShowDimensions] = useState(false);
    const [modelBounds, setModelBounds] = useState<ModelBounds | null>(null);
    const [resetViewToken, setResetViewToken] = useState(0);
    const [elapsed, setElapsed] = useState(0);
    const [msgIndex, setMsgIndex] = useState(0);
    const fmt = (n: number) => n.toFixed(1);
    const hasModel = carimbBaseUrl || carimbArteUrl || cortadorUrl;

    const updateModelBounds = useCallback(() => {
        if (!modelRef.current) return;
        const box = new THREE.Box3().setFromObject(modelRef.current);
        if (box.isEmpty()) return;

        const size = new THREE.Vector3();
        box.getSize(size);
        setModelBounds({
            min: [box.min.x, box.min.y, box.min.z],
            max: [box.max.x, box.max.y, box.max.z],
            size: [size.x, size.y, size.z],
        });
    }, []);

    useEffect(() => {
        if (!hasModel) {
            setShowDimensions(false);
            setModelBounds(null);
            return;
        }
        const t = setTimeout(updateModelBounds, 0);
        return () => clearTimeout(t);
    }, [hasModel, carimbBaseUrl, carimbArteUrl, cortadorUrl, artOffset, updateModelBounds]);

    const MESSAGES_BY_TYPE = {
        cortador: [
            { label: "Enviando arte ao servidor...",     detail: "Normalizando SVG para o OpenSCAD" },
            { label: "Calculando silhueta...",            detail: "Gerando geometria do cortador" },
            { label: "Gerando carimbo base...",           detail: "Extrudando a placa de apoio" },
            { label: "Gerando arte em relevo...",         detail: "Processando os traços do design" },
            { label: "Montando as peças...",              detail: "Unindo malhas para exportação 3MF" },
            { label: "Quase pronto...",                   detail: "Finalizando geometria" },
        ],
        ponteira: [
            { label: "Preparando estrutura...",           detail: "Calculando dimensões da base" },
            { label: "Processando texto/arte...",         detail: "Gerando posições e relevo" },
            { label: "Montando a peça...",                detail: "Mesclando base e letras" },
            { label: "Quase pronto...",                   detail: "Finalizando geometria 3D" },
        ],
        ferramenta: [
            { label: "Calculando dimensões...",           detail: "Ajustando margens e furos" },
            { label: "Subtraindo volumes...",             detail: "Cavando furos cilíndricos" },
            { label: "Quase pronto...",                   detail: "Finalizando geometria" },
        ],
        default: [
            { label: "Processando...",                    detail: "Iniciando renderização" },
            { label: "Gerando modelo...",                 detail: "Calculando geometria 3D" },
            { label: "Montando malhas...",                detail: "Preparando arquivos" },
            { label: "Quase pronto...",                   detail: "Finalizando o processo" },
        ]
    };
    const MESSAGES = MESSAGES_BY_TYPE[modelType] || MESSAGES_BY_TYPE['default'];

    useEffect(() => {
        if (!isGenerating) { setElapsed(0); setMsgIndex(0); return; }
        setElapsed(0);
        setMsgIndex(0);

        const timer = setInterval(() => setElapsed(s => s + 1), 1000);

        // Avança mensagem: primeiras trocas rápidas, depois desacelera
        const delays = [2000, 5000, 10000, 18000, 30000];
        let step = 0;
        const advance = () => {
            step++;
            setMsgIndex(i => Math.min(i + 1, MESSAGES.length - 1));
            if (step < delays.length) {
                setTimeout(advance, delays[step]);
            }
        };
        const first = setTimeout(advance, delays[0]);

        return () => { clearInterval(timer); clearTimeout(first); };
    }, [isGenerating]);

    const msg = MESSAGES[msgIndex];

    return (
        <div className="w-full h-full relative bg-neutral-800 rounded-lg overflow-hidden border border-neutral-700">

            {isGenerating && (
                <div className="absolute inset-0 bg-neutral-900/80 backdrop-blur-sm flex flex-col items-center justify-center z-10 gap-4">
                    {/* Spinner */}
                    <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />

                    {/* Mensagem principal */}
                    <div className="text-center space-y-1 px-8">
                        <h3 className="text-lg font-semibold text-emerald-400 transition-all">{msg.label}</h3>
                        <p className="text-neutral-500 text-sm">{msg.detail}</p>
                    </div>

                    {/* Barra de progresso indeterminada */}
                    <div className="w-64 h-1.5 bg-neutral-700 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full animate-[indeterminate_1.6s_ease-in-out_infinite]"
                             style={{ width: '40%' }} />
                    </div>

                    {/* Partes + timer */}
                    <div className="flex items-center gap-4 text-xs text-neutral-600">
                        {modelType === 'cortador' && (
                            <>
                                <span className={carimbBaseUrl ? 'text-emerald-500' : ''}>Base</span>
                                <span>·</span>
                                <span className={carimbArteUrl ? 'text-emerald-500' : ''}>Arte</span>
                                <span>·</span>
                                <span className={cortadorUrl ? 'text-emerald-500' : ''}>Cortador</span>
                            </>
                        )}
                        {modelType === 'ponteira' && (
                            <>
                                <span className={carimbBaseUrl ? 'text-emerald-500' : ''}>Corpo</span>
                                <span>·</span>
                                <span className={carimbArteUrl ? 'text-emerald-500' : ''}>Relevo</span>
                            </>
                        )}
                        {modelType === 'ferramenta' && (
                            <span className={carimbBaseUrl ? 'text-emerald-500' : ''}>Peça Principal</span>
                        )}
                        {modelType === 'default' && (
                            <span className={carimbBaseUrl ? 'text-emerald-500' : ''}>Processando...</span>
                        )}
                        <span className="ml-3 font-mono text-neutral-700">{elapsed}s</span>
                    </div>
                </div>
            )}

            <Canvas
                shadows
                camera={{ position: INITIAL_CAMERA, fov: 40, near: 5, far: 1800 }}
                onPointerMissed={() => setShowDimensions(false)}
            >
                <color attach="background" args={['#262626']} />
                <ambientLight intensity={0.65} />
                <hemisphereLight intensity={0.6} color="#fff8ef" groundColor="#40392b" />
                <directionalLight position={[50, 50, 100]} intensity={1.65} castShadow shadow-mapSize={[2048, 2048]} />

                {showBuildPlate && (
                    <BuildPlateA1
                        isUnderPlateView={isUnderPlateView}
                    />
                )}

                <React.Suspense fallback={null}>
                    <group position={[0, 0, MODEL_Z_LIFT]}>
                        <Center disableZ>
                            {hasModel ? (
                                <group
                                    ref={modelRef}
                                    onPointerDown={(e) => {
                                        e.stopPropagation();
                                        updateModelBounds();
                                        setShowDimensions(true);
                                    }}
                                >
                                    {carimbBaseUrl && <StlMesh key={carimbBaseUrl} url={carimbBaseUrl} color={modelColor} />}
                                    {carimbArteUrl && (
                                        <group position={artOffset ?? [0, 0, 0]}>
                                            <StlMesh key={carimbArteUrl} url={carimbArteUrl} color={artColor} />
                                        </group>
                                    )}
                                    {cortadorUrl && <StlMesh key={cortadorUrl} url={cortadorUrl} color={modelColor} />}
                                </group>
                            ) : (
                                <PlaceholderModel />
                            )}
                        </Center>

                        <DimensionOverlay bounds={modelBounds} visible={showDimensions && !isGenerating} />
                    </group>
                </React.Suspense>

                <ControlsWithTarget />
                <PlateVisibilityTracker onUnderPlateChange={setIsUnderPlateView} />
                <ViewResetter resetToken={resetViewToken} initialCamera={INITIAL_CAMERA} />
                <CameraTracker onUpdate={setCamInfo} />
                <GizmoHelper alignment="bottom-left" margin={[80, 80]}>
                    <GizmoViewport
                        axisColors={['#ef4444', '#84cc16', '#60a5fa']}
                        labels={['X', 'Y', 'Z']}
                        labelColor="#e5e7eb"
                    />
                </GizmoHelper>
            </Canvas>

            <button
                type="button"
                onClick={() => setResetViewToken((n) => n + 1)}
                className="absolute bottom-3 left-3 z-20 px-3 py-2 rounded-lg bg-black/70 border border-neutral-600 text-neutral-100 text-xs font-semibold hover:bg-black/85 transition-colors"
                title="Resetar visualização"
            >
                🏠
            </button>

            {camInfo && (
                <div className="absolute bottom-3 right-3 z-20">
                    {showDimensions && modelBounds && (
                        <div className="mb-2 font-mono bg-black/88 text-emerald-200 rounded-lg px-4 py-3 border border-emerald-500/70 backdrop-blur-sm min-w-[210px]">
                            <div className="text-neutral-300 text-[11px] uppercase tracking-widest mb-2">Dimensões Atuais</div>
                            <div className="text-sm">X: <span className="text-white font-semibold">{modelBounds.size[0].toFixed(2)} mm</span></div>
                            <div className="text-sm">Y: <span className="text-white font-semibold">{modelBounds.size[1].toFixed(2)} mm</span></div>
                            <div className="text-sm">Z: <span className="text-white font-semibold">{modelBounds.size[2].toFixed(2)} mm</span></div>
                        </div>
                    )}
                    <div className="font-mono text-xs bg-black/70 text-emerald-400 rounded-lg px-3 py-2 space-y-0.5 border border-emerald-900/50 backdrop-blur-sm select-all">
                    <div className="text-neutral-500 text-[10px] uppercase tracking-widest mb-1">Câmera (debug)</div>
                    <div>pos  <span className="text-white">[{fmt(camInfo.px)}, {fmt(camInfo.py)}, {fmt(camInfo.pz)}]</span></div>
                    <div>alvo <span className="text-white">[{fmt(camInfo.tx)}, {fmt(camInfo.ty)}, {fmt(camInfo.tz)}]</span></div>
                    <div>fov  <span className="text-white">{fmt(camInfo.fov)}°</span></div>
                    </div>
                </div>
            )}
        </div>
    );
}
