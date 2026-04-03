import React, { useState, useEffect } from 'react';
import { Canvas, useLoader, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Center } from '@react-three/drei';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

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
            onChange={(e) => {
                if (e?.target?.object) {
                    (e.target.object as any).__orbitTarget = e.target.target.clone();
                }
            }}
        />
    );
}

// ------------------------------------------------------------------
// STL meshes
// ------------------------------------------------------------------
function StlMesh({ url, color }: { url: string; color: string }) {
    const geom = useLoader(STLLoader, url);
    return (
        <mesh geometry={geom} castShadow receiveShadow>
            <meshStandardMaterial color={color} roughness={0.4} metalness={0.1} />
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

function BuildPlateA1({ size = 256 }: { size?: number }) {
    const half = size / 2;
    const plateThickness = 2;

    return (
        <group position={[0, 0, -plateThickness / 2]} receiveShadow>
            {/* Corpo principal da mesa */}
            <mesh receiveShadow>
                <boxGeometry args={[size, size, plateThickness]} />
                <meshStandardMaterial color="#4a4a4f" roughness={0.85} metalness={0.15} />
            </mesh>

            {/* Área útil levemente destacada */}
            <mesh position={[0, 0, plateThickness / 2 + 0.02]} receiveShadow>
                <planeGeometry args={[size - 8, size - 8]} />
                <meshStandardMaterial color="#55555b" roughness={0.9} metalness={0.05} />
            </mesh>

            {/* Borda visual */}
            <lineSegments position={[0, 0, plateThickness / 2 + 0.08]}>
                <edgesGeometry args={[new THREE.PlaneGeometry(size, size)]} />
                <lineBasicMaterial color="#6b6b73" />
            </lineSegments>

            {/* Marcas de eixo no topo da mesa */}
            <line position={[0, 0, plateThickness / 2 + 0.1]}>
                <bufferGeometry
                    attach="geometry"
                    onUpdate={(geo: THREE.BufferGeometry) => {
                        geo.setFromPoints([
                            new THREE.Vector3(-half, 0, 0),
                            new THREE.Vector3(half, 0, 0),
                        ]);
                    }}
                />
                <lineBasicMaterial color="#6a6a70" />
            </line>
            <line position={[0, 0, plateThickness / 2 + 0.1]}>
                <bufferGeometry
                    attach="geometry"
                    onUpdate={(geo: THREE.BufferGeometry) => {
                        geo.setFromPoints([
                            new THREE.Vector3(0, -half, 0),
                            new THREE.Vector3(0, half, 0),
                        ]);
                    }}
                />
                <lineBasicMaterial color="#6a6a70" />
            </line>
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
    const [camInfo, setCamInfo] = useState<CameraInfo | null>(null);
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

            <Canvas shadows camera={{ position: [0, -220, 120], fov: 42 }}>
                <color attach="background" args={['#262626']} />
                <ambientLight intensity={0.5} />
                <hemisphereLight intensity={0.5} color="#ffffff" groundColor="#404040" />
                <directionalLight position={[50, 50, 100]} intensity={1.5} castShadow shadow-mapSize={[2048, 2048]} />

                {showBuildPlate && <BuildPlateA1 size={256} />}

                <React.Suspense fallback={null}>
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
                </React.Suspense>

                <ControlsWithTarget />
                <CameraTracker onUpdate={setCamInfo} />
                <axesHelper args={[50]} />
            </Canvas>

            {camInfo && (
                <div className="absolute bottom-3 right-3 z-20 font-mono text-xs bg-black/70 text-emerald-400 rounded-lg px-3 py-2 space-y-0.5 border border-emerald-900/50 backdrop-blur-sm select-all">
                    <div className="text-neutral-500 text-[10px] uppercase tracking-widest mb-1">Câmera (debug)</div>
                    <div>pos  <span className="text-white">[{fmt(camInfo.px)}, {fmt(camInfo.py)}, {fmt(camInfo.pz)}]</span></div>
                    <div>alvo <span className="text-white">[{fmt(camInfo.tx)}, {fmt(camInfo.ty)}, {fmt(camInfo.tz)}]</span></div>
                    <div>fov  <span className="text-white">{fmt(camInfo.fov)}°</span></div>
                </div>
            )}
        </div>
    );
}
