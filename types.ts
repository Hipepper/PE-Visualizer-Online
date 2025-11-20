export enum RegionType {
  DOS_HEADER = 'DOS Header',
  NT_HEADERS = 'NT Headers',
  FILE_HEADER = 'File Header',
  OPTIONAL_HEADER = 'Optional Header',
  SECTION_HEADER = 'Section Header',
  SECTION_DATA = 'Section Data',
  DATA_DIRECTORY = 'Data Directory',
  OVERLAY = 'Overlay',
  FIELD = 'Field',
  UNKNOWN = 'Unknown'
}

export interface PERegion {
  name: string;
  offset: number; // File offset
  size: number;
  type: RegionType;
  description?: string;
  value?: string | number;
  color: string; // Hex color code
  children?: PERegion[];
  details?: Record<string, string | number>;
}

export interface SectionMetadata {
  name: string;
  virtualAddress: number;
  virtualSize: number;
  pointerToRawData: number;
  sizeOfRawData: number;
}

export interface PEFile {
  name: string;
  size: number;
  data: DataView;
  regions: PERegion[];
  sectionsMetadata: SectionMetadata[];
  isValid: boolean;
  error?: string;
}

export interface SearchResult {
  offset: number;
  size: number;
  rva?: number;
  matchVal?: string;
}

export interface FileSession {
  id: string;
  file: PEFile;
  selection: {
    offset: number;
    size: number;
    region: PERegion | null;
  } | null;
  viewOffset: number; // Scroll position for this file
  searchResults: SearchResult[];
  currentSearchIndex: number;
  isSearchOpen: boolean;
}

export interface AppState {
  sessions: FileSession[];
  activeSessionId: string | null;
  hoverOffset: number | null; // Transient UI state
  theme: 'dark' | 'light';
  isAnimating: boolean;
}

export const COLORS = {
  DOS: '#4682B4', // Steel Blue
  NT: '#228B22',  // Forest Green
  OPTIONAL: '#FFA500', // Orange
  SECTION_HEADER: '#800080', // Purple
  DATA_DIR: '#DAA520', // Gold
  SECTION_DATA: '#D3D3D3', // Light Gray (handled dynamically for dark mode)
  OVERLAY: '#696969', // Dark Gray
  FIELD: '#00CED1',   // Dark Turquoise for Fields
  DEFAULT: '#A0A0A0',
  SEARCH_HIGHLIGHT: '#FFFF00', // Yellow
  SEARCH_CURRENT: '#FF4500'    // Orange Red
};

export const DARK_COLORS = {
  ...COLORS,
  SECTION_DATA: '#4A5568', // Darker gray for dark mode
  FIELD: '#20B2AA',        // Light Sea Green for Fields
  SEARCH_HIGHLIGHT: '#B7950B', // Darker Yellow
  SEARCH_CURRENT: '#E53E3E'    // Red
};
