
import React, { useState } from 'react';
import { PERegion, ParsedFile } from '../types';

interface SidebarProps {
  file: ParsedFile | null;
  selectedRegion: PERegion | null;
  onSelect: (region: PERegion) => void;
}

const TreeNode: React.FC<{ 
  region: PERegion; 
  depth: number; 
  selected: boolean; 
  onSelect: (r: PERegion) => void;
}> = ({ region, depth, selected, onSelect }) => {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = region.children && region.children.length > 0;

  const handleSelect = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(region);
  };

  const toggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(!expanded);
  };

  return (
    <div className="select-none">
      <div 
        className={`
          flex items-center py-1 px-2 cursor-pointer border-l-2 transition-colors
          ${selected ? 'bg-blue-100 dark:bg-blue-900 border-blue-500' : 'border-transparent hover:bg-gray-100 dark:hover:bg-gray-800'}
        `}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={handleSelect}
      >
        {hasChildren && (
          <span 
            onClick={toggleExpand}
            className="mr-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 w-4 text-center font-mono text-xs"
          >
            {expanded ? '▼' : '▶'}
          </span>
        )}
        {!hasChildren && <span className="w-6"></span>}
        
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: region.color }}></div>
          <span className="text-sm font-medium truncate">{region.name}</span>
        </div>
      </div>
      
      {hasChildren && expanded && (
        <div>
          {region.children!.map((child, idx) => (
            <TreeNode 
              key={idx} 
              region={child} 
              depth={depth + 1} 
              selected={selected} 
              onSelect={onSelect} 
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const Sidebar: React.FC<SidebarProps> = ({ file, selectedRegion, onSelect }) => {
  if (!file) {
    return (
      <div className="p-4 text-gray-500 text-sm text-center italic">
        No file loaded
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      {file.regions.map((region, idx) => (
        <TreeNode 
          key={idx} 
          region={region} 
          depth={0} 
          selected={selectedRegion === region} 
          onSelect={onSelect}
        />
      ))}
    </div>
  );
};
