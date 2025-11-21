
import { ParsedFile, PERegion, RegionType, COLORS, DARK_COLORS, SectionMetadata } from '../types';

// --- Constants & Enums ---

const MACHINE_TYPES: Record<number, string> = {
  0x014c: 'Intel 386 (x86)',
  0x8664: 'AMD64 (x64)',
  0x0200: 'Intel Itanium',
  0xaa64: 'ARM64',
  0x01c0: 'ARM Thumb-2'
};

const FILE_CHARACTERISTICS: Record<number, string> = {
  0x0001: 'RELOCS_STRIPPED',
  0x0002: 'EXECUTABLE_IMAGE',
  0x0004: 'LINE_NUMS_STRIPPED',
  0x0008: 'LOCAL_SYMS_STRIPPED',
  0x0010: 'AGGRESSIVE_WS_TRIM',
  0x0020: 'LARGE_ADDRESS_AWARE',
  0x0080: 'BYTES_REVERSED_LO',
  0x0100: '32BIT_MACHINE',
  0x0200: 'DEBUG_STRIPPED',
  0x0400: 'REMOVABLE_RUN_FROM_SWAP',
  0x0800: 'NET_RUN_FROM_SWAP',
  0x1000: 'SYSTEM',
  0x2000: 'DLL',
  0x4000: 'UP_SYSTEM_ONLY',
  0x8000: 'BYTES_REVERSED_HI'
};

const DLL_CHARACTERISTICS: Record<number, string> = {
  0x0020: 'HIGH_ENTROPY_VA',
  0x0040: 'DYNAMIC_BASE',
  0x0080: 'FORCE_INTEGRITY',
  0x0100: 'NX_COMPAT',
  0x0200: 'NO_ISOLATION',
  0x0400: 'NO_SEH',
  0x0800: 'NO_BIND',
  0x1000: 'APPCONTAINER',
  0x2000: 'WDM_DRIVER',
  0x4000: 'GUARD_CF',
  0x8000: 'TERMINAL_SERVER_AWARE'
};

const SUBSYSTEMS: Record<number, string> = {
    1: 'NATIVE',
    2: 'WINDOWS_GUI',
    3: 'WINDOWS_CUI',
    5: 'OS2_CUI',
    7: 'POSIX_CUI',
    9: 'WINDOWS_CE_GUI',
    10: 'EFI_APPLICATION',
    11: 'EFI_BOOT_SERVICE_DRIVER',
    12: 'EFI_RUNTIME_DRIVER',
    13: 'EFI_ROM',
    14: 'XBOX',
    16: 'WINDOWS_BOOT_APPLICATION'
};

// --- Helpers ---

const readString = (view: DataView, offset: number, length: number): string => {
  let str = '';
  for (let i = 0; i < length; i++) {
    const charCode = view.getUint8(offset + i);
    if (charCode === 0) break;
    str += String.fromCharCode(charCode);
  }
  return str;
};

const getFlags = (val: number, map: Record<number, string>): string => {
    const flags: string[] = [];
    Object.keys(map).forEach(k => {
        const key = parseInt(k);
        if ((val & key) === key) flags.push(map[key]);
    });
    return flags.length > 0 ? flags.join(', ') : 'None';
};

const formatHex = (val: number, pad: number = 0) => '0x' + val.toString(16).toUpperCase().padStart(pad, '0');

// --- Main Parser ---

export const parsePE = (buffer: ArrayBuffer, fileName: string, isDarkMode: boolean = true): ParsedFile => {
  const view = new DataView(buffer);
  const regions: PERegion[] = [];
  const sectionsMetadata: SectionMetadata[] = [];
  const palette = isDarkMode ? DARK_COLORS : COLORS;

  // Basic Validation
  if (view.byteLength < 64) {
    return { name: fileName, size: buffer.byteLength, data: view, regions: [], sectionsMetadata: [], isValid: false, error: 'File too small', format: 'PE' };
  }

  // 1. DOS Header
  const e_magic = view.getUint16(0, true);
  if (e_magic !== 0x5A4D) { // 'MZ'
    return { name: fileName, size: buffer.byteLength, data: view, regions: [], sectionsMetadata: [], isValid: false, error: 'Invalid DOS signature (not MZ)', format: 'PE' };
  }

  const e_lfanew = view.getUint32(0x3C, true);
  regions.push({
    name: 'DOS Header',
    offset: 0,
    size: 64,
    type: RegionType.DOS_HEADER,
    color: palette.DOS,
    description: 'Legacy DOS Header',
    details: {
      e_magic: formatHex(e_magic, 4),
      e_lfanew: formatHex(e_lfanew, 8),
    }
  });

  if (e_lfanew + 4 > view.byteLength) {
    return { name: fileName, size: buffer.byteLength, data: view, regions, sectionsMetadata: [], isValid: false, error: 'Invalid PE offset', format: 'PE' };
  }

  // 2. NT Headers (Signature)
  const signature = view.getUint32(e_lfanew, true);
  if (signature !== 0x00004550) { // 'PE\0\0'
    return { name: fileName, size: buffer.byteLength, data: view, regions, sectionsMetadata: [], isValid: false, error: 'Invalid PE signature', format: 'PE' };
  }
  
  const ntHeadersRegion: PERegion = {
    name: 'NT Headers',
    offset: e_lfanew,
    size: 4, // Grows as we add children
    type: RegionType.NT_HEADERS,
    color: palette.NT,
    children: []
  };
  
  ntHeadersRegion.children?.push({
    name: 'Signature',
    offset: e_lfanew,
    size: 4,
    type: RegionType.FIELD,
    color: palette.FIELD,
    value: 'PE\\0\\0'
  });

  // 3. File Header
  const fileHeaderOffset = e_lfanew + 4;
  const machine = view.getUint16(fileHeaderOffset, true);
  const numberOfSections = view.getUint16(fileHeaderOffset + 2, true);
  const timeDateStamp = view.getUint32(fileHeaderOffset + 4, true);
  const pointerToSymbolTable = view.getUint32(fileHeaderOffset + 8, true);
  const numberOfSymbols = view.getUint32(fileHeaderOffset + 12, true);
  const sizeOfOptionalHeader = view.getUint16(fileHeaderOffset + 16, true);
  const characteristics = view.getUint16(fileHeaderOffset + 18, true);

  const fileHeaderRegion: PERegion = {
    name: 'File Header',
    offset: fileHeaderOffset,
    size: 20,
    type: RegionType.FILE_HEADER,
    color: palette.NT,
    details: {
      Machine: formatHex(machine, 4),
      NumberOfSections: numberOfSections,
      Characteristics: formatHex(characteristics, 4)
    },
    children: [
        { name: 'Machine', offset: fileHeaderOffset, size: 2, type: RegionType.FIELD, color: palette.FIELD, value: formatHex(machine, 4), description: MACHINE_TYPES[machine] || 'Unknown' },
        { name: 'NumberOfSections', offset: fileHeaderOffset + 2, size: 2, type: RegionType.FIELD, color: palette.FIELD, value: numberOfSections, description: 'Number of Sections' },
        { name: 'TimeDateStamp', offset: fileHeaderOffset + 4, size: 4, type: RegionType.FIELD, color: palette.FIELD, value: formatHex(timeDateStamp, 8), description: new Date(timeDateStamp * 1000).toISOString() },
        { name: 'PointerToSymbolTable', offset: fileHeaderOffset + 8, size: 4, type: RegionType.FIELD, color: palette.FIELD, value: formatHex(pointerToSymbolTable, 8), description: 'Offset to COFF symbol table' },
        { name: 'NumberOfSymbols', offset: fileHeaderOffset + 12, size: 4, type: RegionType.FIELD, color: palette.FIELD, value: numberOfSymbols, description: 'Number of symbols' },
        { name: 'SizeOfOptionalHeader', offset: fileHeaderOffset + 16, size: 2, type: RegionType.FIELD, color: palette.FIELD, value: sizeOfOptionalHeader, description: 'Size of the Optional Header' },
        { name: 'Characteristics', offset: fileHeaderOffset + 18, size: 2, type: RegionType.FIELD, color: palette.FIELD, value: formatHex(characteristics, 4), description: getFlags(characteristics, FILE_CHARACTERISTICS) }
    ]
  };
  ntHeadersRegion.children?.push(fileHeaderRegion);

  // 4. Optional Header
  const optHeaderOffset = fileHeaderOffset + 20;
  let magic = 0;
  if (sizeOfOptionalHeader > 0) {
     magic = view.getUint16(optHeaderOffset, true);
  }

  const is64Bit = magic === 0x20b;
  
  const optionalHeaderRegion: PERegion = {
    name: 'Optional Header',
    offset: optHeaderOffset,
    size: sizeOfOptionalHeader,
    type: RegionType.OPTIONAL_HEADER,
    color: palette.OPTIONAL,
    children: [],
    details: { Magic: formatHex(magic, 4) }
  };

  // Detailed Optional Header Parsing
  if (sizeOfOptionalHeader > 0) {
      const fields: PERegion[] = [];
      let off = optHeaderOffset;
      
      // Standard Fields
      fields.push({ name: 'Magic', offset: off, size: 2, type: RegionType.FIELD, color: palette.FIELD, value: formatHex(magic, 4), description: is64Bit ? 'PE32+ (64-bit)' : 'PE32 (32-bit)' });
      fields.push({ name: 'MajorLinkerVersion', offset: off + 2, size: 1, type: RegionType.FIELD, color: palette.FIELD, value: view.getUint8(off + 2) });
      fields.push({ name: 'MinorLinkerVersion', offset: off + 3, size: 1, type: RegionType.FIELD, color: palette.FIELD, value: view.getUint8(off + 3) });
      fields.push({ name: 'SizeOfCode', offset: off + 4, size: 4, type: RegionType.FIELD, color: palette.FIELD, value: formatHex(view.getUint32(off + 4, true)) });
      fields.push({ name: 'SizeOfInitializedData', offset: off + 8, size: 4, type: RegionType.FIELD, color: palette.FIELD, value: formatHex(view.getUint32(off + 8, true)) });
      fields.push({ name: 'SizeOfUninitializedData', offset: off + 12, size: 4, type: RegionType.FIELD, color: palette.FIELD, value: formatHex(view.getUint32(off + 12, true)) });
      fields.push({ name: 'AddressOfEntryPoint', offset: off + 16, size: 4, type: RegionType.FIELD, color: palette.FIELD, value: formatHex(view.getUint32(off + 16, true)), description: 'RVA of Entry Point' });
      fields.push({ name: 'BaseOfCode', offset: off + 20, size: 4, type: RegionType.FIELD, color: palette.FIELD, value: formatHex(view.getUint32(off + 20, true)) });
      
      off += 24;

      if (!is64Bit) {
          fields.push({ name: 'BaseOfData', offset: off, size: 4, type: RegionType.FIELD, color: palette.FIELD, value: formatHex(view.getUint32(off, true)) });
          off += 4;
      }

      // Windows Specific Fields
      const imageBase = is64Bit ? view.getBigUint64(off, true) : BigInt(view.getUint32(off, true));
      fields.push({ name: 'ImageBase', offset: off, size: is64Bit ? 8 : 4, type: RegionType.FIELD, color: palette.FIELD, value: '0x' + imageBase.toString(16).toUpperCase(), description: 'Preferred load address' });
      off += is64Bit ? 8 : 4;

      fields.push({ name: 'SectionAlignment', offset: off, size: 4, type: RegionType.FIELD, color: palette.FIELD, value: formatHex(view.getUint32(off, true)), description: 'Alignment in memory' });
      off += 4;
      fields.push({ name: 'FileAlignment', offset: off, size: 4, type: RegionType.FIELD, color: palette.FIELD, value: formatHex(view.getUint32(off, true)), description: 'Alignment on disk' });
      off += 4;

      // Versions
      fields.push({ name: 'MajorOSVersion', offset: off, size: 2, type: RegionType.FIELD, color: palette.FIELD, value: view.getUint16(off, true) }); off+=2;
      fields.push({ name: 'MinorOSVersion', offset: off, size: 2, type: RegionType.FIELD, color: palette.FIELD, value: view.getUint16(off, true) }); off+=2;
      fields.push({ name: 'MajorImageVersion', offset: off, size: 2, type: RegionType.FIELD, color: palette.FIELD, value: view.getUint16(off, true) }); off+=2;
      fields.push({ name: 'MinorImageVersion', offset: off, size: 2, type: RegionType.FIELD, color: palette.FIELD, value: view.getUint16(off, true) }); off+=2;
      fields.push({ name: 'MajorSubsystemVersion', offset: off, size: 2, type: RegionType.FIELD, color: palette.FIELD, value: view.getUint16(off, true) }); off+=2;
      fields.push({ name: 'MinorSubsystemVersion', offset: off, size: 2, type: RegionType.FIELD, color: palette.FIELD, value: view.getUint16(off, true) }); off+=2;
      
      fields.push({ name: 'Win32VersionValue', offset: off, size: 4, type: RegionType.FIELD, color: palette.FIELD, value: view.getUint32(off, true) }); off+=4;
      fields.push({ name: 'SizeOfImage', offset: off, size: 4, type: RegionType.FIELD, color: palette.FIELD, value: formatHex(view.getUint32(off, true)) }); off+=4;
      fields.push({ name: 'SizeOfHeaders', offset: off, size: 4, type: RegionType.FIELD, color: palette.FIELD, value: formatHex(view.getUint32(off, true)) }); off+=4;
      fields.push({ name: 'CheckSum', offset: off, size: 4, type: RegionType.FIELD, color: palette.FIELD, value: formatHex(view.getUint32(off, true)) }); off+=4;

      const subsystem = view.getUint16(off, true);
      fields.push({ name: 'Subsystem', offset: off, size: 2, type: RegionType.FIELD, color: palette.FIELD, value: formatHex(subsystem, 4), description: SUBSYSTEMS[subsystem] || 'Unknown' }); off+=2;

      const dllChar = view.getUint16(off, true);
      fields.push({ name: 'DllCharacteristics', offset: off, size: 2, type: RegionType.FIELD, color: palette.FIELD, value: formatHex(dllChar, 4), description: getFlags(dllChar, DLL_CHARACTERISTICS) }); off+=2;

      const stackRes = is64Bit ? view.getBigUint64(off, true) : BigInt(view.getUint32(off, true));
      fields.push({ name: 'SizeOfStackReserve', offset: off, size: is64Bit ? 8 : 4, type: RegionType.FIELD, color: palette.FIELD, value: '0x' + stackRes.toString(16) }); off += is64Bit ? 8 : 4;
      
      const stackCom = is64Bit ? view.getBigUint64(off, true) : BigInt(view.getUint32(off, true));
      fields.push({ name: 'SizeOfStackCommit', offset: off, size: is64Bit ? 8 : 4, type: RegionType.FIELD, color: palette.FIELD, value: '0x' + stackCom.toString(16) }); off += is64Bit ? 8 : 4;
      
      const heapRes = is64Bit ? view.getBigUint64(off, true) : BigInt(view.getUint32(off, true));
      fields.push({ name: 'SizeOfHeapReserve', offset: off, size: is64Bit ? 8 : 4, type: RegionType.FIELD, color: palette.FIELD, value: '0x' + heapRes.toString(16) }); off += is64Bit ? 8 : 4;
      
      const heapCom = is64Bit ? view.getBigUint64(off, true) : BigInt(view.getUint32(off, true));
      fields.push({ name: 'SizeOfHeapCommit', offset: off, size: is64Bit ? 8 : 4, type: RegionType.FIELD, color: palette.FIELD, value: '0x' + heapCom.toString(16) }); off += is64Bit ? 8 : 4;

      fields.push({ name: 'LoaderFlags', offset: off, size: 4, type: RegionType.FIELD, color: palette.FIELD, value: formatHex(view.getUint32(off, true)) }); off+=4;
      
      const numberOfRvaAndSizes = view.getUint32(off, true);
      fields.push({ name: 'NumberOfRvaAndSizes', offset: off, size: 4, type: RegionType.FIELD, color: palette.FIELD, value: numberOfRvaAndSizes }); off+=4;

      optionalHeaderRegion.children = fields;

      // Data Directories
      const dataDirsOffset = off;
      const safeNumDirs = Math.min(numberOfRvaAndSizes, 16);
      const dirNames = [
        'Export', 'Import', 'Resource', 'Exception', 'Security', 'BaseReloc', 'Debug', 
        'Architecture', 'GlobalPtr', 'TLS', 'LoadConfig', 'BoundImport', 'IAT', 
        'DelayImport', 'COM', 'Reserved'
      ];

      const dataDirsRegion: PERegion = {
        name: 'Data Directories',
        offset: dataDirsOffset,
        size: safeNumDirs * 8,
        type: RegionType.DATA_DIRECTORY,
        color: palette.DATA_DIR,
        children: []
      };

      for (let i = 0; i < safeNumDirs; i++) {
        const currentDirOffset = dataDirsOffset + (i * 8);
        if (currentDirOffset + 8 > optHeaderOffset + sizeOfOptionalHeader) break;
        
        const rva = view.getUint32(currentDirOffset, true);
        const size = view.getUint32(currentDirOffset + 4, true);

        if (size > 0 || rva > 0) {
          dataDirsRegion.children?.push({
            name: `${dirNames[i]} Directory`,
            offset: currentDirOffset,
            size: 8,
            type: RegionType.DATA_DIRECTORY,
            color: palette.DATA_DIR,
            details: { RVA: formatHex(rva, 8), Size: formatHex(size, 8) },
            // Add fields for RVA and Size to allow granular selection
            children: [
                 { name: 'RVA', offset: currentDirOffset, size: 4, type: RegionType.FIELD, color: palette.FIELD, value: formatHex(rva, 8) },
                 { name: 'Size', offset: currentDirOffset + 4, size: 4, type: RegionType.FIELD, color: palette.FIELD, value: formatHex(size, 8) }
            ]
          });
        }
      }
      optionalHeaderRegion.children.push(dataDirsRegion);
  }

  ntHeadersRegion.children?.push(optionalHeaderRegion);
  ntHeadersRegion.size = 4 + 20 + sizeOfOptionalHeader;
  regions.push(ntHeadersRegion);

  // 5. Section Headers
  const sectionHeadersOffset = optHeaderOffset + sizeOfOptionalHeader;
  const sectionHeadersRegion: PERegion = {
    name: 'Section Headers',
    offset: sectionHeadersOffset,
    size: numberOfSections * 40,
    type: RegionType.SECTION_HEADER,
    color: palette.SECTION_HEADER,
    children: []
  };

  const sectionDataRegions: PERegion[] = [];

  for (let i = 0; i < numberOfSections; i++) {
    const offset = sectionHeadersOffset + (i * 40);
    const name = readString(view, offset, 8);
    const virtualSize = view.getUint32(offset + 8, true);
    const virtualAddress = view.getUint32(offset + 12, true);
    const sizeOfRawData = view.getUint32(offset + 16, true);
    const pointerToRawData = view.getUint32(offset + 20, true);

    const meta: SectionMetadata = {
        name,
        virtualAddress,
        virtualSize,
        pointerToRawData,
        sizeOfRawData
    };
    sectionsMetadata.push(meta);

    sectionHeadersRegion.children?.push({
      name: `Header: ${name}`,
      offset: offset,
      size: 40,
      type: RegionType.SECTION_HEADER,
      color: palette.SECTION_HEADER,
      details: {
        Name: name,
        VirtualSize: formatHex(virtualSize, 8),
        VirtualAddress: formatHex(virtualAddress, 8),
        RawSize: formatHex(sizeOfRawData, 8),
        RawPtr: formatHex(pointerToRawData, 8)
      }
    });

    if (sizeOfRawData > 0 && pointerToRawData > 0 && pointerToRawData < buffer.byteLength) {
      const actualSize = Math.min(sizeOfRawData, buffer.byteLength - pointerToRawData);
      sectionDataRegions.push({
        name: `Section: ${name}`,
        offset: pointerToRawData,
        size: actualSize,
        type: RegionType.SECTION_DATA,
        color: palette.SECTION_DATA,
        description: `Raw data for section ${name}`
      });
    }
  }
  regions.push(sectionHeadersRegion);

  sectionDataRegions.sort((a, b) => a.offset - b.offset).forEach(r => regions.push(r));

  const lastRegion = regions[regions.length - 1];
  const endOfLastRegion = lastRegion ? lastRegion.offset + lastRegion.size : 0;
  if (endOfLastRegion < buffer.byteLength) {
    regions.push({
      name: 'Overlay / EOF',
      offset: endOfLastRegion,
      size: buffer.byteLength - endOfLastRegion,
      type: RegionType.OVERLAY,
      color: palette.OVERLAY,
      description: 'Data appended to the end of the PE file (not mapped)'
    });
  }

  return {
    name: fileName,
    size: buffer.byteLength,
    data: view,
    regions,
    sectionsMetadata,
    isValid: true,
    format: 'PE'
  };
};

export const offsetToRva = (offset: number, sections: SectionMetadata[]): number | undefined => {
    for (const sec of sections) {
        if (offset >= sec.pointerToRawData && offset < sec.pointerToRawData + sec.sizeOfRawData) {
            const diff = offset - sec.pointerToRawData;
            if (diff < sec.virtualSize) {
                return sec.virtualAddress + diff;
            }
        }
    }
    if (sections.length > 0 && offset < sections[0].pointerToRawData) {
        return offset;
    }
    return undefined;
};
