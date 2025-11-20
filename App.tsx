import React, { useState, useEffect } from 'react';
import { AppState, PEFile, PERegion, SearchResult } from './types';
import { parsePE } from './services/peParser';
import { Sidebar } from './components/Sidebar';
import { HexViewer } from './components/HexViewer';
import { Inspector } from './components/Inspector';
import { SearchDialog } from './components/SearchDialog';

const App: React.FC = () => {
  // Initialize state
  const [appState, setAppState] = useState<AppState>(() => ({
    file: null,
    selection: null,
    hoverOffset: null,
    theme: (localStorage.getItem('theme') as 'dark' | 'light') || 'dark',
    isAnimating: false,
    viewOffset: 0,
    searchResults: [],
    currentSearchIndex: -1,
    isSearchOpen: false
  }));

  const [dragOver, setDragOver] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showCopyMenu, setShowCopyMenu] = useState(false);

  // Effect to apply theme class
  useEffect(() => {
    if (appState.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', appState.theme);
  }, [appState.theme]);

  // File Loading
  const handleFile = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const pe = parsePE(buffer, file.name, appState.theme === 'dark');
      if (!pe.isValid) {
        setErrorMsg(pe.error || 'Invalid PE File');
        return;
      }
      
      setErrorMsg(null);
      setAppState(prev => ({
        ...prev,
        file: pe,
        selection: null,
        viewOffset: 0,
        isAnimating: true,
        searchResults: [],
        currentSearchIndex: -1
      }));

      // Simple animation simulation
      setTimeout(() => setAppState(s => ({ ...s, isAnimating: false })), 1000);
    } catch (e) {
      setErrorMsg('Failed to parse file');
      console.error(e);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const toggleTheme = () => {
    setAppState(prev => ({ ...prev, theme: prev.theme === 'dark' ? 'light' : 'dark' }));
  };

  const handleRegionSelect = (region: PERegion) => {
     setAppState(prev => ({
         ...prev,
         selection: { offset: region.offset, size: region.size, region },
         viewOffset: Math.floor(region.offset / 16) * 16 // Align to line
     }));
  };

  const exportPNG = () => {
    const canvas = document.querySelector('canvas');
    if (canvas) {
        const url = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = 'pe-view.png';
        link.href = url;
        link.click();
    }
  };

  // --- Copy Functionality ---
  const getSelectedBytes = (): Uint8Array | null => {
      if (!appState.file || !appState.selection) return null;
      const { offset, size } = appState.selection;
      return new Uint8Array(appState.file.data.buffer.slice(offset, offset + size));
  };

  const copyAs = async (format: 'hex' | 'hexArr' | 'cArr' | 'python' | 'binary' | 'base64') => {
      const bytes = getSelectedBytes();
      if (!bytes) return;
      
      let text = '';
      const arr = Array.from(bytes);

      switch (format) {
          case 'hex':
              text = arr.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
              break;
          case 'hexArr':
              text = arr.map(b => '0x' + b.toString(16).padStart(2, '0').toUpperCase()).join(', ');
              break;
          case 'cArr':
              text = '{ ' + arr.map(b => '0x' + b.toString(16).padStart(2, '0').toUpperCase()).join(', ') + ' }';
              break;
          case 'python':
              // Escape logic for python bytes
              text = "b'" + arr.map(b => {
                  if (b >= 32 && b <= 126 && b !== 39 && b !== 92) return String.fromCharCode(b);
                  return '\\x' + b.toString(16).padStart(2, '0');
              }).join('') + "'";
              break;
          case 'binary':
               text = arr.map(b => b.toString(2).padStart(8,'0')).join('');
               break;
          case 'base64':
               // Standard Base64
               let binary = '';
               arr.forEach(b => binary += String.fromCharCode(b));
               text = btoa(binary);
               break;
      }

      try {
          await navigator.clipboard.writeText(text);
          setShowCopyMenu(false);
          // Optional: Toast notification could go here
      } catch (err) {
          console.error('Failed to copy', err);
      }
  };

  // Search Navigation
  const jumpToSearchResult = (index: number) => {
      const { searchResults } = appState;
      if (index >= 0 && index < searchResults.length) {
          const res = searchResults[index];
          setAppState(s => ({
              ...s,
              currentSearchIndex: index,
              viewOffset: Math.floor(res.offset / 16) * 16,
              selection: { offset: res.offset, size: res.size, region: null } 
          }));
      }
  };

  const nextResult = () => {
      if (appState.searchResults.length === 0) return;
      const next = (appState.currentSearchIndex + 1) % appState.searchResults.length;
      jumpToSearchResult(next);
  };
  
  const prevResult = () => {
      if (appState.searchResults.length === 0) return;
      const prev = (appState.currentSearchIndex - 1 + appState.searchResults.length) % appState.searchResults.length;
      jumpToSearchResult(prev);
  };
  
  // Keyboard Shortcuts
  useEffect(() => {
      const handleKey = (e: KeyboardEvent) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
              e.preventDefault();
              const offsetStr = prompt('Jump to Offset (Hex):');
              if(offsetStr) {
                  const off = parseInt(offsetStr, 16);
                  if(!isNaN(off)) {
                      setAppState(s => ({ ...s, viewOffset: Math.floor(off / 16) * 16 }));
                  }
              }
          }
          
          if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
              e.preventDefault();
              setAppState(s => ({ ...s, isSearchOpen: !s.isSearchOpen }));
          }

          if (e.key === 'F3') {
              e.preventDefault();
              if (e.shiftKey) prevResult();
              else nextResult();
          }
      };
      window.addEventListener('keydown', handleKey);
      return () => window.removeEventListener('keydown', handleKey);
  }, [appState.searchResults, appState.currentSearchIndex]);

  return (
    <div 
      className={`flex flex-col h-screen w-screen ${dragOver ? 'opacity-50' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onClick={() => setShowCopyMenu(false)} // Close menu on click outside
    >
      {/* Header / Toolbar */}
      <header className="h-12 bg-gray-800 border-b border-gray-700 flex items-center px-4 justify-between shrink-0 z-20 shadow-md">
        <div className="flex items-center gap-4">
           <h1 className="text-white font-bold text-lg tracking-tight">PE<span className="text-blue-400">Visualizer</span></h1>
           {appState.file && <span className="text-gray-400 text-sm px-2 py-1 bg-gray-900 rounded font-mono">{appState.file.name}</span>}
        </div>
        
        <div className="flex items-center gap-2">
            {!appState.file && (
                <label className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm transition-colors">
                    Open File
                    <input type="file" className="hidden" onChange={(e) => e.target.files && handleFile(e.target.files[0])} />
                </label>
            )}
            {appState.file && (
                <>
                     {/* Search Controls */}
                    <div className="mr-4 flex items-center gap-1">
                        <button onClick={() => setAppState(s => ({...s, isSearchOpen: true}))} className="text-gray-300 hover:text-white p-1.5 rounded hover:bg-gray-700" title="Find (Ctrl+F)">🔍</button>
                        {appState.searchResults.length > 0 && (
                            <div className="flex items-center gap-1 text-gray-300 text-xs bg-gray-700 rounded px-2 py-0.5 ml-2">
                                <span>{appState.currentSearchIndex + 1} / {appState.searchResults.length}</span>
                                <button onClick={prevResult} className="hover:text-white px-1 font-bold">▲</button>
                                <button onClick={nextResult} className="hover:text-white px-1 font-bold">▼</button>
                            </div>
                        )}
                    </div>
                    
                    {/* Copy Dropdown */}
                    <div className="relative">
                         <button 
                            onClick={(e) => { e.stopPropagation(); setShowCopyMenu(!showCopyMenu); }}
                            disabled={!appState.selection}
                            className="text-gray-200 hover:text-white text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                         >
                             Copy Selection ▾
                         </button>
                         {showCopyMenu && appState.selection && (
                             <div className="absolute top-full right-0 mt-1 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-xl overflow-hidden z-50 py-1">
                                 <button onClick={() => copyAs('hex')} className="w-full text-left px-4 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">
                                     Hex String <span className="text-gray-400 ml-2">(4D 5A)</span>
                                 </button>
                                 <button onClick={() => copyAs('hexArr')} className="w-full text-left px-4 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">
                                     0x Array <span className="text-gray-400 ml-2">(0x4D, 0x5A)</span>
                                 </button>
                                 <button onClick={() => copyAs('cArr')} className="w-full text-left px-4 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">
                                     C Array <span className="text-gray-400 ml-2">({'{'} 0x4D... {'}'})</span>
                                 </button>
                                 <button onClick={() => copyAs('python')} className="w-full text-left px-4 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">
                                     Python Bytes <span className="text-gray-400 ml-2">(b'\x4D...')</span>
                                 </button>
                                 <button onClick={() => copyAs('binary')} className="w-full text-left px-4 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">
                                     Binary Stream <span className="text-gray-400 ml-2">(0100...)</span>
                                 </button>
                                 <button onClick={() => copyAs('base64')} className="w-full text-left px-4 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">
                                     Base64
                                 </button>
                             </div>
                         )}
                    </div>

                    <button onClick={exportPNG} className="text-gray-300 hover:text-white text-xs px-2 py-1.5 bg-gray-700 rounded hover:bg-gray-600 ml-2" title="Export View as PNG">PNG</button>
                </>
            )}
            <button onClick={toggleTheme} className="text-gray-400 hover:text-white p-2 rounded ml-2">
                {appState.theme === 'dark' ? '🌙' : '☀️'}
            </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* Search Dialog */}
        {appState.file && (
            <SearchDialog 
                file={appState.file}
                isOpen={appState.isSearchOpen}
                onClose={() => setAppState(s => ({...s, isSearchOpen: false}))}
                onResults={(results) => {
                    setAppState(s => ({
                        ...s, 
                        searchResults: results, 
                        currentSearchIndex: results.length > 0 ? 0 : -1
                    }));
                    // Auto-jump to first
                    if(results.length > 0) {
                        setAppState(s => ({ 
                            ...s, 
                            viewOffset: Math.floor(results[0].offset / 16) * 16,
                            currentSearchIndex: 0
                        }));
                    }
                }}
            />
        )}

        {/* Error Overlay */}
        {errorMsg && (
            <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center backdrop-blur-sm">
                <div className="bg-white dark:bg-gray-800 p-6 rounded shadow-xl max-w-md text-center">
                    <h3 className="text-red-500 font-bold text-xl mb-2">Error</h3>
                    <p className="text-gray-700 dark:text-gray-300">{errorMsg}</p>
                    <button onClick={() => setErrorMsg(null)} className="mt-4 bg-gray-200 dark:bg-gray-700 px-4 py-2 rounded hover:bg-gray-300 dark:hover:bg-gray-600">Close</button>
                </div>
            </div>
        )}

        {!appState.file && !errorMsg && (
             <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 pointer-events-none">
                 <div className="text-6xl mb-4 opacity-20">📂</div>
                 <p>Drag & Drop a PE file (.exe, .dll) here</p>
                 <p className="text-sm opacity-60 mt-2">Fully client-side, no data leaves your browser.</p>
             </div>
        )}

        {/* Left Sidebar */}
        <div className="w-64 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 shrink-0 flex flex-col">
            <div className="p-2 border-b border-gray-200 dark:border-gray-800 font-semibold text-xs uppercase text-gray-500 tracking-wider">Structure</div>
            <Sidebar 
                file={appState.file} 
                selectedRegion={appState.selection?.region || null} 
                onSelect={handleRegionSelect} 
            />
        </div>

        {/* Main Canvas Area */}
        <div className="flex-1 bg-white dark:bg-gray-950 relative flex flex-col min-w-0">
            <div className="flex-1 relative overflow-hidden">
                <HexViewer 
                    file={appState.file} 
                    appState={appState}
                    onScroll={(off) => setAppState(s => ({...s, viewOffset: off}))}
                    onSelectionChange={(offset, size) => {
                        // Find the deepest region that contains this offset
                        let foundRegion = null;
                        if(appState.file) {
                             const search = (regions: PERegion[]) => {
                                 for(const r of regions) {
                                     if(offset >= r.offset && offset < r.offset + r.size) {
                                         foundRegion = r;
                                         if(r.children) search(r.children);
                                     }
                                 }
                             };
                             search(appState.file.regions);
                        }

                        setAppState(s => ({
                            ...s, 
                            selection: { offset, size, region: foundRegion }
                        }));
                    }}
                    onHover={(offset) => setAppState(s => ({ ...s, hoverOffset: offset }))}
                />
            </div>
            
            {/* Bottom Inspector Panel */}
            <div className="h-36 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 shrink-0 z-10 shadow-lg">
                <Inspector appState={appState} />
            </div>
        </div>

      </div>
    </div>
  );
};

export default App;