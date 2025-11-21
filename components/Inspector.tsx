
import React from 'react';
import { FileSession, RegionType } from '../types';

export const Inspector: React.FC<{ session: FileSession | null; hoverOffset: number | null }> = ({ session, hoverOffset }) => {
  if (!session || !session.file) return null;

  const { file, selection } = session;

  // Determine what to show: Selection takes precedence for region details, but we update hex values on hover
  const effectiveOffset = hoverOffset !== null ? hoverOffset : (selection ? selection.offset : null);
  
  if (effectiveOffset === null) {
      return (
        <div className="h-full flex items-center justify-center text-gray-400 text-sm">
            Hover or click bytes/regions to inspect
        </div>
      );
  }

  const byteVal = file.data.getUint8(effectiveOffset);
  // Attempt to read different values
  let uint16 = 0, uint32 = 0;
  try { uint16 = file.data.getUint16(effectiveOffset, true); } catch {}
  try { uint32 = file.data.getUint32(effectiveOffset, true); } catch {}

  const activeRegion = selection?.region;
  const isField = activeRegion?.type === RegionType.FIELD;

  const renderDescription = (desc: string) => {
      if (!desc) return null;
      // Check if it's a comma separated list of flags
      if (desc.includes(',') && desc.includes(' ')) {
          const flags = desc.split(',').map(s => s.trim()).filter(s => s);
          if (flags.length > 1) {
              return (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                      {flags.map((flag, i) => (
                          <span key={i} className="px-2 py-0.5 bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300 rounded text-xs border border-teal-200 dark:border-teal-800 font-medium">
                              {flag}
                          </span>
                      ))}
                  </div>
              );
          }
      }
      return <div className="mt-1 text-gray-600 dark:text-gray-400 leading-relaxed">{desc}</div>;
  };

  return (
    <div className="h-full grid grid-cols-1 md:grid-cols-3 gap-4 p-3 overflow-y-auto text-xs font-mono bg-gray-50 dark:bg-gray-900">
      {/* Column 1: Location & Basic Types */}
      <div className="space-y-2">
         <div className="font-semibold text-gray-700 dark:text-gray-200 border-b border-gray-200 dark:border-gray-700 pb-1 mb-2">
             Byte Inspector
         </div>
         <div className="grid grid-cols-2 gap-x-2 gap-y-1">
             <span className="text-gray-500">Offset (Hex)</span>
             <span className="text-right">0x{effectiveOffset.toString(16).toUpperCase()}</span>
             
             <span className="text-gray-500">Offset (Dec)</span>
             <span className="text-right">{effectiveOffset}</span>
             
             <span className="text-gray-500">Byte (8)</span>
             <span className="text-right">0x{byteVal.toString(16).padStart(2,'0').toUpperCase()}</span>
             
             <span className="text-gray-500">Word (16)</span>
             <span className="text-right">0x{uint16.toString(16).toUpperCase()}</span>
             
             <span className="text-gray-500">DWord (32)</span>
             <span className="text-right">0x{uint32.toString(16).toUpperCase()}</span>
         </div>
      </div>

      {/* Column 2: Context/Structure Info */}
      <div className="border-l md:border-l-2 border-gray-200 dark:border-gray-700 pl-4">
          <div className="font-semibold text-gray-700 dark:text-gray-200 border-b border-gray-200 dark:border-gray-700 pb-1 mb-2">
              Structure Context
          </div>
          {activeRegion ? (
              <div className="space-y-2">
                  <div className="flex justify-between items-baseline">
                      <span className="text-gray-500">Name</span>
                      <span className="font-semibold text-blue-600 dark:text-blue-400 truncate ml-2">{activeRegion.name}</span>
                  </div>
                  <div className="flex justify-between">
                      <span className="text-gray-500">Size</span>
                      <span>{activeRegion.size} bytes</span>
                  </div>
                  <div className="flex justify-between">
                      <span className="text-gray-500">Start</span>
                      <span>0x{activeRegion.offset.toString(16).toUpperCase()}</span>
                  </div>
              </div>
          ) : (
              <div className="text-gray-400 italic py-2">Select a region to view details</div>
          )}
      </div>

      {/* Column 3: Detailed Field Analysis */}
       <div className="border-l md:border-l-2 border-gray-200 dark:border-gray-700 pl-4 flex flex-col">
          <div className="font-semibold text-gray-700 dark:text-gray-200 border-b border-gray-200 dark:border-gray-700 pb-1 mb-2 flex justify-between">
              <span>Field Analysis</span>
              {isField && <span className="text-[10px] bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 px-1.5 rounded">FIELD</span>}
          </div>
          
          {isField && activeRegion ? (
               <div className="flex-1 overflow-y-auto">
                   <div className="mb-2">
                       <span className="text-gray-500 block mb-0.5">Value</span>
                       <span className="text-sm font-bold text-gray-900 dark:text-gray-100 select-all">
                           {activeRegion.value !== undefined ? activeRegion.value : 'N/A'}
                       </span>
                   </div>
                   
                   {activeRegion.description && (
                       <div className="mt-2">
                           <span className="text-gray-500 block">Meaning / Flags</span>
                           {renderDescription(activeRegion.description)}
                       </div>
                   )}
               </div>
          ) : activeRegion?.details ? (
              <div className="space-y-1 overflow-y-auto max-h-24 custom-scrollbar">
                  {Object.entries(activeRegion.details).map(([key, val]) => (
                      <div key={key} className="flex justify-between text-xs">
                          <span className="text-gray-500">{key}:</span>
                          <span className="font-mono text-blue-600 dark:text-blue-400 truncate ml-2">{val}</span>
                      </div>
                  ))}
              </div>
          ) : (
              <div className="text-gray-400 italic py-2">No detailed field info</div>
          )}
       </div>
    </div>
  );
};
