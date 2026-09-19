import { useState, useRef } from 'react';
import axios from 'axios';
import { processSvgFile, type ProcessedSVG } from '../svgProcessor';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface UseSvgUploadOptions {
    initialWidth?: number;
    initialHeight?: number;
    /** Espessura de linha (thickness) passada pro processSvgFile. Pode ser fixa
     * ou uma função lida no momento do processamento (ex.: cortador_bolacha lê
     * de um parâmetro dinâmico do modelo, não um valor fixo). */
    lineThickness?: number | (() => number);
    dilatePx?: number;
}

/**
 * Upload de arte (SVG ou PNG convertido) com preview e trava de proporção —
 * compartilhado pelas páginas de modelo que recebem uma arte em vez de texto.
 * Independente do useModelGenerate: não sabe nada sobre params/config/geração.
 */
export function useSvgUpload(options?: UseSvgUploadOptions) {
    const initialWidth = options?.initialWidth ?? 60;
    const initialHeight = options?.initialHeight ?? 60;

    const [svgFile, setSvgFile] = useState<File | null>(null);
    const [svgText, setSvgText] = useState<string | null>(null);
    const [svgPreview, setSvgPreview] = useState<ProcessedSVG | null>(null);
    const [svgAspectRatio, setSvgAspectRatio] = useState(1.0);
    const [lockAspectRatio, setLockAspectRatio] = useState(true);
    const [artWidth, setArtWidth] = useState(initialWidth);
    const [artHeight, setArtHeight] = useState(initialHeight);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isConvertingPng, setIsConvertingPng] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const triggerFilePicker = () => {
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
            fileInputRef.current.click();
        }
    };

    const handleHeightChange = (val: number) => {
        setArtHeight(val);
        if (lockAspectRatio) setArtWidth(Math.round(val * svgAspectRatio * 10) / 10);
    };
    const handleWidthChange = (val: number) => {
        setArtWidth(val);
        if (lockAspectRatio) setArtHeight(Math.round(val / svgAspectRatio * 10) / 10);
    };

    const processSvgText = async (text: string) => {
        setSvgText(text);
        try {
            const thickness = typeof options?.lineThickness === 'function'
                ? options.lineThickness()
                : (options?.lineThickness ?? 0.5);
            const processed = await processSvgFile(text, thickness, options?.dilatePx ?? 3.0);
            setSvgPreview(processed);
            if (processed && processed.width > 0 && processed.height > 0) {
                const ratio = processed.width / processed.height;
                setSvgAspectRatio(ratio);
                setArtWidth(initialWidth);
                setArtHeight(Math.round((initialWidth / ratio) * 10) / 10);
            }
            setIsModalOpen(true);
        } catch (err) {
            console.error('SVG Processing Error:', err);
            alert('Erro ao processar o arquivo SVG.');
        }
    };

    const handleSvgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setSvgFile(file);
        const fileIsPng = file.name.toLowerCase().endsWith('.png') || file.type === 'image/png';
        if (fileIsPng) {
            setIsConvertingPng(true);
            try {
                const form = new FormData();
                form.append('file', file, file.name);
                const res = await axios.post<string>(`${API_BASE}/api/convert/png-to-svg`, form, { responseType: 'text' });
                await processSvgText(res.data);
            } catch (err: any) {
                alert(`Erro ao converter PNG: ${err?.response?.data?.error ?? 'Falha desconhecida'}`);
            } finally {
                setIsConvertingPng(false);
            }
            return;
        }
        const reader = new FileReader();
        reader.onload = async (evt) => {
            const text = evt.target?.result as string;
            if (!text) return;
            await processSvgText(text);
        };
        reader.readAsText(file);
    };

    return {
        svgFile, svgText, svgPreview, setSvgPreview,
        svgAspectRatio, lockAspectRatio, setLockAspectRatio,
        artWidth, artHeight, setArtWidth, setArtHeight,
        isModalOpen, setIsModalOpen, isConvertingPng, fileInputRef,
        triggerFilePicker, handleHeightChange, handleWidthChange, handleSvgUpload,
    };
}
