
import React, { useState, useEffect, useMemo } from 'react';
import { AppState, PERegion, SearchResult, FileSession, ParsedFile } from './types';
import { parsePE } from './services/peParser';
import { parseMachO } from './services/machOParser';
import { parseELF } from './services/elfParser';
import { Sidebar } from './components/Sidebar';
import { HexViewer } from './components/HexViewer';
import { Inspector } from './components/Inspector';
import { SearchDialog } from './components/SearchDialog';
import { AboutModal } from './components/AboutModal';

type CopyMode = 'hex' | 'hexArr' | 'cArr' | 'python' | 'binary' | 'base64';

const COPY_MODES: Record<CopyMode, string> = {
    hex: 'Hex String',
    hexArr: '0x Array',
    cArr: 'C Array',
    python: 'Python Bytes',
    binary: 'Binary',
    base64: 'Base64'
};

const App: React.FC = () => {
  // Initialize state
  const [appState, setAppState] = useState<AppState>(() => ({
    sessions: [],
    activeSessionId: null,
    hoverOffset: null,
    theme: (localStorage.getItem('theme') as 'dark' | 'light') || 'dark',
    isAnimating: false,
    isAboutOpen: false,
  }));

  const [dragOver, setDragOver] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Copy State
  const [showCopyMenu, setShowCopyMenu] = useState(false);
  const [copyMode, setCopyMode] = useState<CopyMode>('hex');
  const [copyFeedback, setCopyFeedback] = useState(false);

  const activeSession = useMemo(() => 
    appState.sessions.find(s => s.id === appState.activeSessionId) || null, 
  [appState.sessions, appState.activeSessionId]);

  // Helper to update active session
  const updateActiveSession = (partial: Partial<FileSession>) => {
      if (!appState.activeSessionId) return;
      setAppState(prev => ({
          ...prev,
          sessions: prev.sessions.map(s => 
              s.id === prev.activeSessionId ? { ...s, ...partial } : s
          )
      }));
  };

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
    if (appState.sessions.length >= 5) {
        setErrorMsg("Maximum 5 files allowed. Close a tab to open a new file.");
        return;
    }

    try {
      const buffer = await file.arrayBuffer();
      
      // Simple format detection
      const view = new DataView(buffer);
      let parsedFile: ParsedFile | null = null;
      
      if (view.byteLength >= 4) {
          const magic = view.getUint32(0, false); // Big Endian check
          
          // PE: 'MZ'
          if (view.getUint16(0, true) === 0x5A4D) { 
              parsedFile = parsePE(buffer, file.name, appState.theme === 'dark');
          } 
          // ELF: 0x7F 'E' 'L' 'F'
          else if (view.getUint8(0) === 0x7F && 
                   view.getUint8(1) === 0x45 && 
                   view.getUint8(2) === 0x4C && 
                   view.getUint8(3) === 0x46) {
              parsedFile = parseELF(buffer, file.name, appState.theme === 'dark');
          }
          // Mach-O
          else if (
              magic === 0xFEEDFACE || magic === 0xCEFAEDFE || // Mach-O 32
              magic === 0xFEEDFACF || magic === 0xCFFAEDFE || // Mach-O 64
              magic === 0xCAFEBABE || magic === 0xBEBAFECA || // Mach-O Fat
              magic === 0xCAFEBABF || magic === 0xBFBAFECA    // Mach-O Fat 64
          ) {
              parsedFile = parseMachO(buffer, file.name, appState.theme === 'dark');
          } else {
              // Fallback / Unknown - Try PE first (it handles small file errors gracefully)
               parsedFile = parsePE(buffer, file.name, appState.theme === 'dark');
          }
      } else {
          // Small files fallback to PE parser
          parsedFile = parsePE(buffer, file.name, appState.theme === 'dark');
      }

      if (!parsedFile || !parsedFile.isValid) {
        setErrorMsg(parsedFile?.error || 'Unrecognized or Invalid Binary File');
        return;
      }
      
      setErrorMsg(null);
      
      // Create new session
      const newSession: FileSession = {
          id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
          file: parsedFile,
          selection: null,
          viewOffset: 0,
          searchResults: [],
          currentSearchIndex: -1,
          isSearchOpen: false
      };

      setAppState(prev => ({
        ...prev,
        sessions: [...prev.sessions, newSession],
        activeSessionId: newSession.id,
        isAnimating: true
      }));

      // Simple animation simulation
      setTimeout(() => setAppState(s => ({ ...s, isAnimating: false })), 1000);
    } catch (e) {
      setErrorMsg('Failed to parse file: ' + (e instanceof Error ? e.message : 'Unknown error'));
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

  const closeSession = (id: string) => {
      setAppState(prev => {
          const newSessions = prev.sessions.filter(s => s.id !== id);
          let newActiveId = prev.activeSessionId;
          // If closing active session, switch to another
          if (id === prev.activeSessionId) {
              newActiveId = newSessions.length > 0 ? newSessions[newSessions.length - 1].id : null;
          }
          return {
              ...prev,
              sessions: newSessions,
              activeSessionId: newActiveId
          };
      });
  };

  const switchSession = (id: string) => {
      setAppState(prev => ({ ...prev, activeSessionId: id }));
  };

  const handleRegionSelect = (region: PERegion) => {
     if (!activeSession) return;
     updateActiveSession({
         selection: { offset: region.offset, size: region.size, region },
         viewOffset: Math.floor(region.offset / 16) * 16
     });
  };

  const exportPNG = () => {
    const canvas = document.querySelector('canvas');
    if (canvas) {
        const url = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = 'view.png';
        link.href = url;
        link.click();
    }
  };

  // --- Copy Functionality ---
  const getSelectedBytes = (): Uint8Array | null => {
      if (!activeSession || !activeSession.selection) return null;
      const { offset, size } = activeSession.selection;
      // Safety check
      if (offset + size > activeSession.file.size) return null;
      return new Uint8Array(activeSession.file.data.buffer.slice(offset, offset + size));
  };

  const handleCopy = async (modeOverride?: CopyMode) => {
      const targetMode = modeOverride || copyMode;
      
      // If user selected a specific mode from menu, update state
      if (modeOverride) {
          setCopyMode(modeOverride);
      }

      const bytes = getSelectedBytes();
      if (!bytes) return;
      
      let text = '';
      const arr = Array.from(bytes);

      switch (targetMode) {
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
               let binary = '';
               arr.forEach(b => binary += String.fromCharCode(b));
               text = btoa(binary);
               break;
      }

      try {
          await navigator.clipboard.writeText(text);
          setShowCopyMenu(false);
          setCopyFeedback(true);
          setTimeout(() => setCopyFeedback(false), 2000);
      } catch (err) {
          console.error('Failed to copy', err);
      }
  };

  // Search Navigation
  const jumpToSearchResult = (index: number) => {
      if (!activeSession) return;
      const { searchResults } = activeSession;
      if (index >= 0 && index < searchResults.length) {
          const res = searchResults[index];
          updateActiveSession({
              currentSearchIndex: index,
              viewOffset: Math.floor(res.offset / 16) * 16,
              selection: { offset: res.offset, size: res.size, region: null }
          });
      }
  };

  const nextResult = () => {
      if (!activeSession || activeSession.searchResults.length === 0) return;
      const next = (activeSession.currentSearchIndex + 1) % activeSession.searchResults.length;
      jumpToSearchResult(next);
  };
  
  const prevResult = () => {
      if (!activeSession || activeSession.searchResults.length === 0) return;
      const prev = (activeSession.currentSearchIndex - 1 + activeSession.searchResults.length) % activeSession.searchResults.length;
      jumpToSearchResult(prev);
  };
  
  // Keyboard Shortcuts
  useEffect(() => {
      const handleKey = async (e: KeyboardEvent) => {
          if (!activeSession) return;

          // Ctrl+G: Go to Offset
          if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
              e.preventDefault();
              const offsetStr = prompt('Jump to Offset (Hex):');
              if(offsetStr) {
                  const off = parseInt(offsetStr, 16);
                  if(!isNaN(off)) {
                      updateActiveSession({ viewOffset: Math.floor(off / 16) * 16 });
                  }
              }
          }
          
          // Ctrl+F: Find
          if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
              e.preventDefault();
              updateActiveSession({ isSearchOpen: !activeSession.isSearchOpen });
          }

          // Ctrl+C: Copy
          if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
              // If we have a Hex/Byte selection, intercept copy
              if (activeSession.selection) {
                  e.preventDefault();
                  await handleCopy(); // Uses current copyMode state
              }
          }

          // F3: Next Match
          if (e.key === 'F3') {
              e.preventDefault();
              if (e.shiftKey) prevResult();
              else nextResult();
          }
      };
      window.addEventListener('keydown', handleKey);
      return () => window.removeEventListener('keydown', handleKey);
  }, [activeSession, copyMode]);

  return (
    <div 
      className={`flex flex-col h-screen w-screen ${dragOver ? 'opacity-50' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onClick={() => setShowCopyMenu(false)} // Close menu on click outside
    >
      {/* Header / Toolbar */}
      <header className="bg-gray-800 border-b border-gray-700 flex items-stretch px-4 shrink-0 z-20 shadow-md h-12 select-none">
        {/* Title - Center Aligned */}
        <div className="flex items-center mr-4 shrink-0">
           <h1 className="text-white font-bold text-lg tracking-tight cursor-pointer" onClick={() => setAppState(s => ({...s, isAboutOpen: true}))}>
             Bin<span className="text-blue-400">Visualizer</span>
           </h1>
        </div>
        
        {/* Tabs Container - Bottom Aligned */}
        <div className="flex-1 flex items-end overflow-x-auto no-scrollbar gap-1 min-w-0">
             {appState.sessions.map(session => (
                 <div 
                    key={session.id}
                    onClick={() => switchSession(session.id)}
                    className={`
                        group relative flex items-center min-w-[100px] max-w-[180px] h-8 px-3 rounded-t-md cursor-pointer border-t border-l border-r transition-colors
                        ${session.id === appState.activeSessionId 
                            ? 'bg-white dark:bg-gray-950 border-gray-300 dark:border-gray-700 text-blue-600 dark:text-blue-400' 
                            : 'bg-gray-700 text-gray-400 border-transparent hover:bg-gray-600 hover:text-gray-200'}
                    `}
                 >
                     <span className="truncate text-xs font-medium mr-4 flex-1">{session.file.name}</span>
                     <button 
                        onClick={(e) => { e.stopPropagation(); closeSession(session.id); }}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded-sm text-gray-500 hover:bg-red-500 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                     >
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                             <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                         </svg>
                     </button>
                 </div>
             ))}
        </div>

        {/* Global Controls - Center Aligned */}
        <div className="flex items-center gap-2 shrink-0 ml-4">
            <label className={`
                cursor-pointer bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs transition-colors font-medium flex items-center gap-1
                ${appState.sessions.length >= 5 ? 'opacity-50 cursor-not-allowed' : ''}
            `}>
                <span>+ Open</span>
                <input 
                    type="file" 
                    disabled={appState.sessions.length >= 5}
                    className="hidden" 
                    onChange={(e) => e.target.files && handleFile(e.target.files[0])} 
                />
            </label>

            {activeSession && (
                <>
                    {/* Copy Dropdown */}
                    <div className="relative ml-2">
                         <button 
                            onClick={(e) => { e.stopPropagation(); setShowCopyMenu(!showCopyMenu); }}
                            disabled={!activeSession.selection}
                            className={`
                                text-xs px-3 py-1 rounded flex items-center gap-2 transition-colors min-w-[140px] justify-between border border-transparent
                                ${copyFeedback 
                                    ? 'bg-green-600 text-white' 
                                    : 'bg-gray-700 hover:bg-gray-600 text-gray-200 hover:text-white'
                                }
                                disabled:opacity-50 disabled:cursor-not-allowed
                            `}
                         >
                             <span>{copyFeedback ? 'Copied!' : `Copy: ${COPY_MODES[copyMode]}`}</span>
                             <span className="text-[10px]">▼</span>
                         </button>
                         
                         {showCopyMenu && activeSession.selection && (
                             <div className="absolute top-full right-0 mt-1 w-52 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-xl overflow-hidden z-50 py-1">
                                 {(Object.keys(COPY_MODES) as CopyMode[]).map((mode) => (
                                     <button
                                        key={mode}
                                        onClick={() => handleCopy(mode)}
                                        className={`
                                            w-full text-left px-4 py-2 text-xs flex justify-between items-center
                                            ${copyMode === mode ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'}
                                        `}
                                     >
                                         {COPY_MODES[mode]}
                                         {copyMode === mode && <span className="text-blue-500">✓</span>}
                                     </button>
                                 ))}
                             </div>
                         )}
                    </div>

                    {/* Search Toggle */}
                    <button 
                        onClick={() => updateActiveSession({ isSearchOpen: !activeSession.isSearchOpen })} 
                        className={`text-gray-300 hover:text-white p-1.5 rounded hover:bg-gray-700 ml-1 ${activeSession.isSearchOpen ? 'text-blue-400 bg-gray-900' : ''}`} 
                        title="Find (Ctrl+F)"
                    >
                        🔍
                    </button>

                    <button onClick={exportPNG} className="text-gray-300 hover:text-white text-xs px-2 py-1.5 bg-gray-700 rounded hover:bg-gray-600 ml-1" title="Export View as PNG">PNG</button>
                </>
            )}
            <button onClick={toggleTheme} className="text-gray-400 hover:text-white p-1.5 rounded ml-1" title="Toggle Theme">
                {appState.theme === 'dark' ? '🌙' : '☀️'}
            </button>
            <button onClick={() => setAppState(s => ({...s, isAboutOpen: true}))} className="text-gray-400 hover:text-white p-1.5 rounded ml-1" title="About / Roadmap">
                ℹ️
            </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden relative">
        
        <AboutModal isOpen={appState.isAboutOpen} onClose={() => setAppState(s => ({...s, isAboutOpen: false}))} />

        {/* Search Dialog */}
        {activeSession && (
            <SearchDialog 
                file={activeSession.file}
                isOpen={activeSession.isSearchOpen}
                onClose={() => updateActiveSession({ isSearchOpen: false })}
                onResults={(results) => {
                    updateActiveSession({
                        searchResults: results,
                        currentSearchIndex: results.length > 0 ? 0 : -1
                    });
                    // Auto-jump to first
                    if(results.length > 0) {
                        updateActiveSession({
                            viewOffset: Math.floor(results[0].offset / 16) * 16,
                            currentSearchIndex: 0
                        });
                    }
                }}
                onJumpToResult={jumpToSearchResult}
            />
        )}

        {/* Error Overlay */}
        {errorMsg && (
            <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center backdrop-blur-sm">
                <div className="bg-white dark:bg-gray-800 p-6 rounded shadow-xl max-w-md text-center border border-red-500/20">
                    <h3 className="text-red-500 font-bold text-xl mb-2">Notice</h3>
                    <p className="text-gray-700 dark:text-gray-300 mb-4">{errorMsg}</p>
                    <button onClick={() => setErrorMsg(null)} className="bg-gray-200 dark:bg-gray-700 px-4 py-2 rounded hover:bg-gray-300 dark:hover:bg-gray-600 text-sm font-medium">Close</button>
                </div>
            </div>
        )}

        {!activeSession && !errorMsg && (
             <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 pointer-events-none select-none">
                 <div className="text-6xl mb-4 opacity-20">📂</div>
                 <p className="font-medium">Drag & Drop a file here</p>
                 <p className="text-sm opacity-60 mt-2">Supported: PE (.exe), Mach-O, ELF</p>
                 <p className="text-xs opacity-40 mt-4 bg-gray-800 p-2 rounded">
                    Analysis Tool | Reverse Engineering
                 </p>
             </div>
        )}

        {/* Render Active Session Content */}
        {activeSession && (
            <div className="flex w-full h-full">
                {/* Left Sidebar */}
                <div className="w-64 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 shrink-0 flex flex-col">
                    <div className="p-2 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center">
                        <span className="font-semibold text-xs uppercase text-gray-500 tracking-wider">Structure</span>
                        <span className="text-[10px] px-1.5 py-0.5 bg-gray-200 dark:bg-gray-800 rounded text-gray-500 uppercase">{activeSession.file.format}</span>
                    </div>
                    <Sidebar 
                        file={activeSession.file} 
                        selectedRegion={activeSession.selection?.region || null} 
                        onSelect={handleRegionSelect} 
                    />
                </div>

                {/* Main Canvas Area */}
                <div className="flex-1 bg-white dark:bg-gray-950 relative flex flex-col min-w-0">
                    <div className="flex-1 relative overflow-hidden">
                        <HexViewer 
                            session={activeSession}
                            theme={appState.theme}
                            hoverOffset={appState.hoverOffset}
                            onScroll={(off) => updateActiveSession({ viewOffset: off })}
                            onSelectionChange={(offset, size) => {
                                // Find the deepest region that contains this offset
                                let foundRegion = null;
                                const search = (regions: PERegion[]) => {
                                     for(const r of regions) {
                                         if(offset >= r.offset && offset < r.offset + r.size) {
                                             foundRegion = r;
                                             if(r.children) search(r.children);
                                         }
                                     }
                                };
                                search(activeSession.file.regions);

                                updateActiveSession({
                                    selection: { offset, size, region: foundRegion }
                                });
                            }}
                            onHover={(offset) => setAppState(s => ({ ...s, hoverOffset: offset }))}
                        />
                    </div>
                    
                    {/* Bottom Inspector Panel */}
                    <div className="h-36 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 shrink-0 z-10 shadow-lg">
                        <Inspector session={activeSession} hoverOffset={appState.hoverOffset} />
                    </div>
                </div>
            </div>
        )}

      </div>
    </div>
  );
};

export default App;
