import React, { useRef, useEffect, useCallback, useState } from 'react';
import { FileSession, PEFile, PERegion, COLORS, DARK_COLORS } from '../types';

interface HexViewerProps {
  session: FileSession | null;
  theme: 'dark' | 'light';
  hoverOffset: number | null;
  onScroll: (newOffset: number) => void;
  onSelectionChange: (offset: number, size: number) => void;
  onHover: (offset: number | null) => void;
}

const LINE_HEIGHT = 20;
const BYTES_PER_LINE = 16;
const FONT_SIZE = 14;
const CHAR_WIDTH = 9; 
// Layout Measurements
const OFFSET_X = 10;
const HEX_X = 100;
const ASCII_X = 600;
const CANVAS_PADDING = 10;

export const HexViewer: React.FC<HexViewerProps> = ({ 
  session, 
  theme,
  hoverOffset,
  onScroll,
  onSelectionChange,
  onHover 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // State for Drag Selection
  const [dragStartOffset, setDragStartOffset] = useState<number | null>(null);

  const file = session?.file;
  const viewOffset = session?.viewOffset || 0;
  const selection = session?.selection;
  const searchResults = session?.searchResults || [];
  const currentSearchIndex = session?.currentSearchIndex || -1;

  const draw = useCallback(() => {
    if (!file || !canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isDark = theme === 'dark';
    
    // Dimensions
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    canvas.width = width;
    canvas.height = height;

    // Colors
    const bg = isDark ? '#1a202c' : '#f7fafc';
    const textMain = isDark ? '#e2e8f0' : '#2d3748';
    const textDim = isDark ? '#718096' : '#a0aec0';
    
    // Updated Highlight Colors (Orange)
    const highlightBg = isDark ? 'rgba(237, 137, 54, 0.5)' : 'rgba(255, 165, 0, 0.4)'; // Orange
    const hoverBg = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
    
    // Search Colors
    const searchHighlight = isDark ? 'rgba(183, 149, 11, 0.4)' : 'rgba(255, 255, 0, 0.4)';
    const searchCurrent = isDark ? 'rgba(229, 62, 62, 0.6)' : 'rgba(255, 69, 0, 0.6)';

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
    ctx.font = `${FONT_SIZE}px "JetBrains Mono", monospace`;
    ctx.textBaseline = 'middle';

    const startLine = Math.floor(viewOffset / BYTES_PER_LINE);
    const visibleLines = Math.ceil(height / LINE_HEIGHT) + 1;
    const totalLines = Math.ceil(file.size / BYTES_PER_LINE);
    const endVisibleOffset = (startLine + visibleLines) * BYTES_PER_LINE;
    const startVisibleOffset = startLine * BYTES_PER_LINE;

    // Pre-calculate visible search results
    const visibleSearchResults = [];
    if (searchResults.length > 0) {
        let idx = 0;
        while(idx < searchResults.length && (searchResults[idx].offset + searchResults[idx].size) < startVisibleOffset) {
            idx++;
        }
        while(idx < searchResults.length && searchResults[idx].offset < endVisibleOffset) {
            visibleSearchResults.push({ ...searchResults[idx], isCurrent: idx === currentSearchIndex });
            idx++;
        }
    }

    for (let i = 0; i < visibleLines; i++) {
      const lineIndex = startLine + i;
      if (lineIndex >= totalLines) break;

      const offset = lineIndex * BYTES_PER_LINE;
      const y = i * LINE_HEIGHT + LINE_HEIGHT / 2 + CANVAS_PADDING;

      // Draw Offset
      ctx.fillStyle = textDim;
      ctx.fillText(offset.toString(16).toUpperCase().padStart(8, '0'), OFFSET_X, y);

      // Draw Bytes
      for (let b = 0; b < BYTES_PER_LINE; b++) {
        const byteOffset = offset + b;
        if (byteOffset >= file.size) break;

        const byteVal = file.data.getUint8(byteOffset);
        const hexVal = byteVal.toString(16).toUpperCase().padStart(2, '0');
        const asciiChar = byteVal >= 32 && byteVal <= 126 ? String.fromCharCode(byteVal) : '.';

        let byteColor = textMain;
        let cellBg = null;
        let isSearchMatch = false;
        let isCurrentSearchMatch = false;

        // Check Search Results
        for (const res of visibleSearchResults) {
            if (byteOffset >= res.offset && byteOffset < res.offset + res.size) {
                isSearchMatch = true;
                if (res.isCurrent) isCurrentSearchMatch = true;
                break; 
            }
        }

        if (isCurrentSearchMatch) cellBg = searchCurrent;
        else if (isSearchMatch) cellBg = searchHighlight;
        else if (selection && byteOffset >= selection.offset && byteOffset < selection.offset + selection.size) {
            cellBg = highlightBg;
        }
        
        if (hoverOffset === byteOffset) {
             const hx = HEX_X + b * 3 * CHAR_WIDTH - 2;
             const hy = i * LINE_HEIGHT + CANVAS_PADDING;
             // Draw outline for hover or lighter overlay
             ctx.fillStyle = hoverBg;
             ctx.fillRect(hx, hy, 2 * CHAR_WIDTH + 4, LINE_HEIGHT);
             const ax = ASCII_X + b * CHAR_WIDTH;
             ctx.fillRect(ax, hy, CHAR_WIDTH, LINE_HEIGHT);
        }

        if (cellBg) {
             ctx.fillStyle = cellBg;
             const hx = HEX_X + b * 3 * CHAR_WIDTH - 2;
             const hy = i * LINE_HEIGHT + CANVAS_PADDING;
             ctx.fillRect(hx, hy, 2 * CHAR_WIDTH + 4, LINE_HEIGHT);
             const ax = ASCII_X + b * CHAR_WIDTH;
             ctx.fillRect(ax, hy, CHAR_WIDTH, LINE_HEIGHT);
        }

        // Draw Hex
        ctx.fillStyle = (isSearchMatch || isCurrentSearchMatch) && isDark ? '#fff' : byteColor;
        ctx.fillText(hexVal, HEX_X + b * 3 * CHAR_WIDTH, y);

        // Draw ASCII
        ctx.fillStyle = byteColor; // Reset color for ASCII
        ctx.fillText(asciiChar, ASCII_X + b * CHAR_WIDTH, y);
      }
    }
    
    // Draw region color bars
    const visibleEnd = (startLine + visibleLines) * BYTES_PER_LINE;
    const visibleStart = startLine * BYTES_PER_LINE;

    const flatRegions: PERegion[] = [];
    const collect = (rs: PERegion[]) => rs.forEach(r => {
        flatRegions.push(r);
        if(r.children) collect(r.children);
    });
    collect(file.regions);

    flatRegions.forEach(r => {
        const rEnd = r.offset + r.size;
        if (rEnd < visibleStart || r.offset > visibleEnd) return;

        const barStartLine = Math.max(startLine, Math.floor(r.offset / BYTES_PER_LINE));
        const barEndLine = Math.min(startLine + visibleLines, Math.floor((rEnd - 1) / BYTES_PER_LINE));
        
        if (barEndLine >= barStartLine) {
            const startY = (barStartLine - startLine) * LINE_HEIGHT + CANVAS_PADDING;
            const h = (barEndLine - barStartLine + 1) * LINE_HEIGHT;
            
            ctx.fillStyle = r.color;
            ctx.fillRect(0, startY, 5, h);
        }
    });

  }, [file, viewOffset, selection, searchResults, currentSearchIndex, theme, hoverOffset]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Global mouse up to stop dragging even if outside canvas
  useEffect(() => {
    const handleGlobalMouseUp = () => {
        if (dragStartOffset !== null) {
            setDragStartOffset(null);
        }
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [dragStartOffset]);


  // Helper to get offset from mouse coordinates
  const getOffsetFromCoords = (e: React.MouseEvent) => {
      if (!file || !canvasRef.current) return null;

      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top - CANVAS_PADDING;
      
      const lineIndex = Math.floor(y / LINE_HEIGHT);
      if (lineIndex < 0) return null;

      const startLine = Math.floor(viewOffset / BYTES_PER_LINE);
      const currentLine = startLine + lineIndex;
      const lineOffset = currentLine * BYTES_PER_LINE;

      let col = -1;
      if (x >= HEX_X && x < ASCII_X - 20) {
         col = Math.floor((x - HEX_X) / (3 * CHAR_WIDTH));
      } else if (x >= ASCII_X) {
         col = Math.floor((x - ASCII_X) / CHAR_WIDTH);
      }

      if (col >= 0 && col < 16) {
          const offset = lineOffset + col;
          if (offset < file.size) {
              return offset;
          }
      }
      return null;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const offset = getOffsetFromCoords(e);

    // Handle Dragging
    if (dragStartOffset !== null && offset !== null) {
        const start = Math.min(dragStartOffset, offset);
        const end = Math.max(dragStartOffset, offset);
        const size = end - start + 1;
        
        // Only update if changed
        if (selection?.offset !== start || selection?.size !== size) {
            onSelectionChange(start, size);
        }
    }

    onHover(offset);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
     // Prevent text selection cursor behavior
     e.preventDefault();
     
     const offset = getOffsetFromCoords(e);
     if (offset !== null) {
         setDragStartOffset(offset);
         onSelectionChange(offset, 1);
     }
  };

  // Custom Scrollbar Logic
  const handleWheel = (e: React.WheelEvent) => {
      if (!file) return;
      const deltaLines = Math.sign(e.deltaY) * 3; 
      const newOffset = Math.max(0, Math.min(file.size - 1, viewOffset + deltaLines * BYTES_PER_LINE));
      onScroll(newOffset);
  };
  
  const scrollPercentage = file ? viewOffset / file.size : 0;
  
  const handleScrollChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!file) return;
      const val = parseFloat(e.target.value);
      onScroll(Math.floor(val));
  };

  if (!file) return <div className="w-full h-full flex items-center justify-center text-gray-400">No File Loaded</div>;

  return (
    <div className="relative w-full h-full flex" ref={containerRef}>
      <canvas 
        ref={canvasRef}
        className="flex-1 cursor-text"
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseLeave={() => onHover(null)}
        onWheel={handleWheel}
      />
      <div className="w-4 h-full bg-gray-200 dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 relative">
         <input 
            type="range" 
            min={0} 
            max={file.size - BYTES_PER_LINE} 
            step={BYTES_PER_LINE}
            value={viewOffset}
            onChange={handleScrollChange}
            className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer z-10 appearance-none"
         />
         <div 
            className="absolute w-full bg-gray-400 dark:bg-gray-500 rounded pointer-events-none"
            style={{ 
                top: `${scrollPercentage * 100}%`, 
                height: '30px',
                marginTop: '-15px'
            }}
         />
      </div>
    </div>
  );
};
