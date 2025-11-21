
import React from 'react';

interface AboutModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white dark:bg-gray-900 rounded-lg shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col border border-gray-200 dark:border-gray-700" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-900">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                        Bin<span className="text-blue-500">Visualizer</span> Roadmap
                    </h2>
                    <button 
                        onClick={onClose} 
                        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-xl"
                    >
                        &times;
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto custom-scrollbar">
                    <p className="mb-4 text-gray-600 dark:text-gray-300">
                        A web-based structural analyzer for binary files, designed to aid in malware analysis and reverse engineering.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Current Support */}
                        <div>
                            <h3 className="text-sm font-bold uppercase tracking-wider text-green-600 dark:text-green-400 mb-3">
                                Supported Formats
                            </h3>
                            <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                                <li className="flex items-center">
                                    <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                                    PE / PE32+ (Windows Executables)
                                </li>
                                <li className="flex items-center">
                                    <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                                    Mach-O (macOS, including Fat binaries)
                                </li>
                                <li className="flex items-center">
                                    <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                                    ELF (Linux/Unix 32/64-bit)
                                </li>
                            </ul>
                        </div>

                        {/* Dev Roadmap */}
                        <div>
                            <h3 className="text-sm font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-3">
                                Todo: Analysis Support
                            </h3>
                            <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                                <li className="flex items-start">
                                    <span className="w-2 h-2 bg-gray-400 rounded-full mr-2 mt-1.5"></span>
                                    <div>
                                        <strong className="block">Android DEX (.dex)</strong>
                                        <span className="text-xs opacity-70">Dalvik bytecode, Header, String/Type IDs.</span>
                                    </div>
                                </li>
                                <li className="flex items-start">
                                    <span className="w-2 h-2 bg-gray-400 rounded-full mr-2 mt-1.5"></span>
                                    <div>
                                        <strong className="block">WebAssembly (.wasm)</strong>
                                        <span className="text-xs opacity-70">Binary module sections (Type, Import, Code).</span>
                                    </div>
                                </li>
                                <li className="flex items-start">
                                    <span className="w-2 h-2 bg-gray-400 rounded-full mr-2 mt-1.5"></span>
                                    <div>
                                        <strong className="block">PDF (.pdf)</strong>
                                        <span className="text-xs opacity-70">Document structure, Body Objects, XRef table.</span>
                                    </div>
                                </li>
                                <li className="flex items-start">
                                    <span className="w-2 h-2 bg-gray-400 rounded-full mr-2 mt-1.5"></span>
                                    <div>
                                        <strong className="block">ZIP / APK / JAR</strong>
                                        <span className="text-xs opacity-70">Local file headers vs Central Directory analysis.</span>
                                    </div>
                                </li>
                                <li className="flex items-start">
                                    <span className="w-2 h-2 bg-gray-400 rounded-full mr-2 mt-1.5"></span>
                                    <div>
                                        <strong className="block">Java Class (.class)</strong>
                                        <span className="text-xs opacity-70">CAFEBABE header, Constant Pool, Method tables.</span>
                                    </div>
                                </li>
                                <li className="flex items-start">
                                    <span className="w-2 h-2 bg-gray-400 rounded-full mr-2 mt-1.5"></span>
                                    <div>
                                        <strong className="block">PNG / BMP</strong>
                                        <span className="text-xs opacity-70">Chunk header analysis for steganography.</span>
                                    </div>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
                
                <div className="bg-gray-50 dark:bg-gray-900 p-4 border-t border-gray-200 dark:border-gray-800 text-center">
                    <button 
                        onClick={onClose}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};
