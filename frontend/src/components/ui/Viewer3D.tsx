import React, { useState, useEffect, useMemo } from 'react';
import { Canvas, useLoader, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Center } from '@react-three/drei';
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
    const [camInfo, setCamInfo] = useState<CameraInfo | null>(null);
    const [isUnderPlateView, setIsUnderPlateView] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const [msgIndex, setMsgIndex] = useState(0);
    const fmt = (n: number) => n.toFixed(1);
    const hasModel = carimbBaseUrl || carimbArteUrl || cortadorUrl;

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

            <Canvas shadows camera={{ position: [0, -300, 210], fov: 40, near: 5, far: 1800 }}>
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
                                <>
                                    {carimbBaseUrl && <StlMesh key={carimbBaseUrl} url={carimbBaseUrl} color={modelColor} />}
                                    {carimbArteUrl && (
                                        <group position={artOffset ?? [0, 0, 0]}>
                                            <StlMesh key={carimbArteUrl} url={carimbArteUrl} color={artColor} />
                                        </group>
                                    )}
                                    {cortadorUrl && <StlMesh key={cortadorUrl} url={cortadorUrl} color={modelColor} />}
                                </>
                            ) : (
                                <PlaceholderModel />
                            )}
                        </Center>
                    </group>
                </React.Suspense>

                <ControlsWithTarget />
                <PlateVisibilityTracker onUnderPlateChange={setIsUnderPlateView} />
                <CameraTracker onUpdate={setCamInfo} />
                <axesHelper args={[50]} />
            </Canvas>

            {camInfo && (
                <div className="absolute bottom-3 right-3 z-20">
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
