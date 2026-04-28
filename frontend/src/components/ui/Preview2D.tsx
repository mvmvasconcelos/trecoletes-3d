import React, { useState } from 'react';
import { Maximize2, Minimize2, Eye } from 'lucide-react';

interface Preview2DProps {
  title?: string;
  children: React.ReactNode;
  width?: number;
  height?: number;
  className?: string;
}

export function Preview2D({ 
  title = "Preview 2D - versão ALPHA", 
  children, 
  width = 300, 
  height = 200,
  className = ""
}: Preview2DProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className={`absolute top-4 left-4 z-10 flex flex-col bg-neutral-800/95 backdrop-blur-md border border-neutral-600/50 rounded-xl shadow-2xl overflow-hidden transition-all duration-300 ${className}`}
         style={{ width: isExpanded ? width : 'auto' }}>
      
      {/* Header */}
      <div 
        className="flex items-center justify-between px-3 py-2 bg-neutral-700/80 cursor-pointer border-b border-neutral-600/50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-semibold text-neutral-200 uppercase tracking-wider">{title}</span>
        </div>
        <button 
          className="text-neutral-400 hover:text-neutral-200 transition-colors focus:outline-none p-1 rounded-md hover:bg-neutral-600/50"
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }}
        >
          {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Content */}
      <div 
        className={`relative flex items-center justify-center transition-all duration-300 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+PHJlY3Qgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiBmaWxsPSJyZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMSkiIC8+PHJlY3Qgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiBmaWxsPSJyZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMTUpIiAvPjxyZWN0IHg9IjEwIiB5PSIxMCIgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiBmaWxsPSJyZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMTUpIiAvPjwvc3ZnPg==')]`}
        style={{ 
          height: isExpanded ? height : 0, 
          opacity: isExpanded ? 1 : 0,
          pointerEvents: isExpanded ? 'auto' : 'none'
        }}
      >
        {isExpanded && children}
      </div>
    </div>
  );
}
