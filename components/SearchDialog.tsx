import React, { useState, useEffect, useRef } from 'react';
import { PEFile, SearchResult } from '../types';
import { searchPE, SearchMode } from '../services/searchService';

interface SearchDialogProps {
    file: PEFile;
    isOpen: boolean;
    onClose: () => void;
    onResults: (results: SearchResult[]) => void;
}

export const SearchDialog: React.FC<SearchDialogProps> = ({ file, isOpen, onClose, onResults }) => {
    const [query, setQuery] = useState('');
    const [mode, setMode] = useState<SearchMode>('ascii');
    const [useRegex, setUseRegex] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [localResults, setLocalResults] = useState<SearchResult[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    const handleSearch = async () => {
        if (!query) return;
        setIsSearching(true);
        setError(null);
        
        // Run in timeout to allow UI to update
        setTimeout(() => {
            try {
                const res = searchPE(file, query, mode, useRegex);
                setLocalResults(res);
                onResults(res);
                if (res.length === 0) setError("No matches found.");
            } catch (e: any) {
                setError(e.message || "Search failed");
            } finally {
                setIsSearching(false);
            }
        }, 50);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleSearch();
        if (e.key === 'Escape') onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="absolute top-16 right-4 w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-2xl rounded-lg z-50 flex flex-col">
            <div className="flex justify-between items-center px-4 py-2 bg-gray-100 dark:bg-gray-750 border-b border-gray-200 dark:border-gray-700 rounded-t-lg">
                <span className="font-semibold text-sm">Find in File</span>
                <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white">×</button>
            </div>
            
            <div className="p-4 space-y-3">
                <div>
                    <input 
                        ref={inputRef}
                        type="text" 
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={mode === 'hex' ? "e.g. 4D 5A" : "Search term..."}
                        className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
                    />
                </div>
                
                <div className="flex items-center gap-2 text-xs">
                     <select 
                        value={mode} 
                        onChange={(e) => setMode(e.target.value as SearchMode)}
                        className="bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded px-2 py-1"
                     >
                         <option value="ascii">ASCII</option>
                         <option value="unicode">Unicode</option>
                         <option value="hex">Hex</option>
                     </select>
                     
                     <label className={`flex items-center gap-1 cursor-pointer ${mode === 'hex' ? 'opacity-50 cursor-not-allowed' : ''}`}>
                         <input 
                            type="checkbox" 
                            checked={useRegex} 
                            onChange={(e) => setUseRegex(e.target.checked)}
                            disabled={mode === 'hex' || (mode === 'unicode')}
                            className="rounded border-gray-300"
                         />
                         <span>Regex</span>
                     </label>
                </div>

                {error && <div className="text-red-500 text-xs">{error}</div>}

                <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500">
                        {localResults.length > 0 ? `${localResults.length} matches` : ''}
                    </span>
                    <button 
                        onClick={handleSearch}
                        disabled={isSearching}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm disabled:opacity-50"
                    >
                        {isSearching ? 'Searching...' : 'Find All'}
                    </button>
                </div>
            </div>
            
            {/* Mini Result List if results exist */}
            {localResults.length > 0 && (
                <div className="border-t border-gray-200 dark:border-gray-700 max-h-48 overflow-y-auto text-xs">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0">
                            <tr>
                                <th className="px-2 py-1 font-medium">Offset</th>
                                <th className="px-2 py-1 font-medium">RVA</th>
                                <th className="px-2 py-1 font-medium">Match</th>
                            </tr>
                        </thead>
                        <tbody className="font-mono">
                             {localResults.slice(0, 100).map((res, idx) => (
                                 <tr 
                                    key={idx} 
                                    className="hover:bg-blue-50 dark:hover:bg-blue-900/30 cursor-pointer border-b border-gray-100 dark:border-gray-800 last:border-0"
                                    onClick={() => {
                                        // Notify App to jump (handled by passing updated results array logic in App usually, but here we might want a direct jump)
                                        // For now, the user has to use the main navigation arrows, 
                                        // BUT a click here should ideally jump.
                                        // Since SearchDialog is a child of App, we can add a jump callback or just rely on 'onResults' updates.
                                        // Actually, let's just keep it simple: navigation is done via main UI arrows for now, or we add a jump prop.
                                        // We'll rely on the main App 'next/prev' logic, but clicking here is nice. 
                                        // Implementation constraint: App.tsx manages selection. We can't easily reach up without a prop.
                                        // We will leave this as a list for viewing.
                                    }}
                                 >
                                     <td className="px-2 py-1">0x{res.offset.toString(16).toUpperCase()}</td>
                                     <td className="px-2 py-1">{res.rva ? `0x${res.rva.toString(16).toUpperCase()}` : '-'}</td>
                                     <td className="px-2 py-1 truncate max-w-[100px]">{res.matchVal}</td>
                                 </tr>
                             ))}
                             {localResults.length > 100 && (
                                 <tr><td colSpan={3} className="px-2 py-1 text-center text-gray-500 italic">... {localResults.length - 100} more ...</td></tr>
                             )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};
