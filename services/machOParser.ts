
import { ParsedFile, PERegion, RegionType, COLORS, DARK_COLORS, SectionMetadata } from '../types';

// --- Constants ---

const MAGIC_32_LE = 0xFEEDFACE;
const MAGIC_32_BE = 0xCEFAEDFE;
const MAGIC_64_LE = 0xFEEDFACF;
const MAGIC_64_BE = 0xCFFAEDFE;
// Note: In JS DataView, we check the raw bytes. 
// 0xFEEDFACE (Big Endian) reads as 0xFEEDFACE with big-endian read, 0xCEFAEDFE with little-endian read.

const LC_REQ_DYLD = 0x80000000;

const LC_TYPES: Record<number, string> = {
    0x1: 'LC_SEGMENT',
    0x2: 'LC_SYMTAB',
    0x3: 'LC_SYMSEG',
    0x4: 'LC_THREAD',
    0x5: 'LC_UNIXTHREAD',
    0x6: 'LC_LOADFVMLIB',
    0x7: 'LC_IDFVMLIB',
    0x8: 'LC_IDENT',
    0x9: 'LC_FVMFILE',
    0xa: 'LC_PREPAGE',
    0xb: 'LC_DYSYMTAB',
    0xc: 'LC_LOAD_DYLIB',
    0xd: 'LC_ID_DYLIB',
    0xe: 'LC_LOAD_DYLINKER',
    0xf: 'LC_ID_DYLINKER',
    0x10: 'LC_PREBOUND_DYLIB',
    0x11: 'LC_ROUTINES',
    0x12: 'LC_SUB_FRAMEWORK',
    0x13: 'LC_SUB_UMBRELLA',
    0x14: 'LC_SUB_CLIENT',
    0x15: 'LC_SUB_LIBRARY',
    0x16: 'LC_TWOLEVEL_HINTS',
    0x17: 'LC_PREBIND_CKSUM',
    0x18: 'LC_LOAD_WEAK_DYLIB',
    0x19: 'LC_SEGMENT_64',
    0x1a: 'LC_ROUTINES_64',
    0x1b: 'LC_UUID',
    0x1c: 'LC_RPATH',
    0x1d: 'LC_CODE_SIGNATURE',
    0x1e: 'LC_SEGMENT_SPLIT_INFO',
    0x1f: 'LC_REEXPORT_DYLIB',
    0x20: 'LC_LAZY_LOAD_DYLIB',
    0x21: 'LC_ENCRYPTION_INFO',
    0x22: 'LC_DYLD_INFO',
    [0x22 | LC_REQ_DYLD]: 'LC_DYLD_INFO_ONLY',
    0x23: 'LC_LOAD_UPWARD_DYLIB',
    0x24: 'LC_VERSION_MIN_MACOSX',
    0x25: 'LC_VERSION_MIN_IPHONEOS',
    0x26: 'LC_FUNCTION_STARTS',
    0x27: 'LC_DYLD_ENVIRONMENT',
    0x28: 'LC_MAIN',
    0x29: 'LC_DATA_IN_CODE',
    0x2A: 'LC_SOURCE_VERSION',
    0x2B: 'LC_DYLIB_CODE_SIGN_DRS',
    0x2C: 'LC_ENCRYPTION_INFO_64',
    0x2D: 'LC_LINKER_OPTION',
    0x2E: 'LC_LINKER_OPTIMIZATION_HINT',
    0x32: 'LC_BUILD_VERSION'
};

const CPU_TYPES: Record<number, string> = {
    7: 'x86',
    0x1000007: 'x86_64',
    12: 'ARM',
    0x100000C: 'ARM64'
};

const formatHex = (val: number | bigint, pad: number = 0) => '0x' + val.toString(16).toUpperCase().padStart(pad, '0');
const readString = (view: DataView, offset: number, length: number): string => {
    let str = '';
    for (let i = 0; i < length; i++) {
      const charCode = view.getUint8(offset + i);
      if (charCode === 0) break;
      str += String.fromCharCode(charCode);
    }
    return str;
  };

export const parseMachO = (buffer: ArrayBuffer, fileName: string, isDarkMode: boolean = true): ParsedFile => {
    const view = new DataView(buffer);
    const regions: PERegion[] = [];
    const sectionsMetadata: SectionMetadata[] = [];
    const palette = isDarkMode ? DARK_COLORS : COLORS;

    if (view.byteLength < 28) {
        return { name: fileName, size: buffer.byteLength, data: view, regions: [], sectionsMetadata: [], isValid: false, error: 'File too small', format: 'Mach-O' };
    }

    // 1. Determine Endianness and Arch
    const magic = view.getUint32(0, false); // Read Big Endian first
    let isLE = false;
    let is64 = false;

    if (magic === 0xFEEDFACE) { isLE = false; is64 = false; }
    else if (magic === 0xCEFAEDFE) { isLE = true; is64 = false; }
    else if (magic === 0xFEEDFACF) { isLE = false; is64 = true; }
    else if (magic === 0xCFFAEDFE) { isLE = true; is64 = true; }
    else {
        return { name: fileName, size: buffer.byteLength, data: view, regions: [], sectionsMetadata: [], isValid: false, error: 'Invalid Mach-O Magic', format: 'Unknown' };
    }

    // 2. Header
    const headerSize = is64 ? 32 : 28;
    const cpuType = view.getInt32(4, isLE);
    const cpuSubtype = view.getInt32(8, isLE);
    const fileType = view.getUint32(12, isLE);
    const nCmds = view.getUint32(16, isLE);
    const sizeofCmds = view.getUint32(20, isLE);
    const flags = view.getUint32(24, isLE);

    regions.push({
        name: 'Mach-O Header',
        offset: 0,
        size: headerSize,
        type: RegionType.MACHO_HEADER,
        color: palette.MACHO_HEADER,
        description: `${is64 ? '64-bit' : '32-bit'} Mach-O Header (${isLE ? 'Little-Endian' : 'Big-Endian'})`,
        details: {
            Magic: formatHex(magic, 8),
            CpuType: CPU_TYPES[cpuType] || formatHex(cpuType),
            FileType: formatHex(fileType),
            NCmds: nCmds,
            SizeOfCmds: sizeofCmds,
            Flags: formatHex(flags)
        }
    });

    // 3. Load Commands
    let offset = headerSize;
    const loadCommandsRegion: PERegion = {
        name: 'Load Commands',
        offset: offset,
        size: sizeofCmds,
        type: RegionType.LOAD_COMMAND,
        color: palette.LOAD_COMMAND,
        children: []
    };

    for (let i = 0; i < nCmds; i++) {
        if (offset + 8 > buffer.byteLength) break;
        
        const cmd = view.getUint32(offset, isLE);
        const cmdSize = view.getUint32(offset + 4, isLE);
        const cmdName = LC_TYPES[cmd] || formatHex(cmd);

        const cmdRegion: PERegion = {
            name: cmdName,
            offset: offset,
            size: cmdSize,
            type: RegionType.LOAD_COMMAND,
            color: palette.LOAD_COMMAND,
            details: {
                Command: formatHex(cmd),
                Size: cmdSize
            },
            children: [
                { name: 'Command', offset, size: 4, type: RegionType.FIELD, color: palette.FIELD, value: formatHex(cmd), description: cmdName },
                { name: 'CmdSize', offset: offset + 4, size: 4, type: RegionType.FIELD, color: palette.FIELD, value: cmdSize }
            ]
        };

        // Parse Segments to find sections (LC_SEGMENT or LC_SEGMENT_64)
        if (cmd === 0x1 || cmd === 0x19) {
            const isSeg64 = cmd === 0x19;
            const segName = readString(view, offset + 8, 16);
            const vmAddr = isSeg64 ? view.getBigUint64(offset + 24, isLE) : BigInt(view.getUint32(offset + 24, isLE));
            const vmSize = isSeg64 ? view.getBigUint64(offset + 32, isLE) : BigInt(view.getUint32(offset + 28, isLE));
            const fileOff = isSeg64 ? view.getBigUint64(offset + 40, isLE) : BigInt(view.getUint32(offset + 32, isLE));
            const fileSize = isSeg64 ? view.getBigUint64(offset + 48, isLE) : BigInt(view.getUint32(offset + 36, isLE));
            
            // Number of sections is at specific offset
            // 32-bit: 48 (vm+8, vmsize+4, off+4, fsize+4, max+4, init+4, nsects+4)
            // 64-bit: 64 (vm+8, vmsize+8, off+8, fsize+8, max+4, init+4, nsects+4)
            const nSectsOffset = offset + (isSeg64 ? 64 : 48);
            const nSects = view.getUint32(nSectsOffset, isLE);

            if (cmdRegion.details) {
                cmdRegion.details.SegmentName = segName;
                cmdRegion.details.NSects = nSects;
                cmdRegion.details.VMAddr = formatHex(vmAddr);
                cmdRegion.details.FileOff = formatHex(fileOff);
            }

            // Add Section Headers within the Load Command
            const sectionHeaderSize = isSeg64 ? 80 : 68;
            let sectOffset = offset + (isSeg64 ? 72 : 56);
            
            for(let s=0; s<nSects; s++) {
                const sName = readString(view, sectOffset, 16);
                const segNameRef = readString(view, sectOffset + 16, 16);
                
                // Offsets for Addr/Size vary by arch
                const sAddr = isSeg64 ? view.getBigUint64(sectOffset + 32, isLE) : BigInt(view.getUint32(sectOffset + 32, isLE));
                const sSize = isSeg64 ? view.getBigUint64(sectOffset + 40, isLE) : BigInt(view.getUint32(sectOffset + 36, isLE));
                const sOffset = view.getUint32(sectOffset + (isSeg64 ? 48 : 40), isLE);
                
                const sSizeNum = Number(sSize);
                const sOffsetNum = Number(sOffset);
                const sAddrNum = Number(sAddr);

                cmdRegion.children?.push({
                    name: `Section Header: ${sName}`,
                    offset: sectOffset,
                    size: sectionHeaderSize,
                    type: RegionType.SECTION_HEADER,
                    color: palette.SECTION_HEADER,
                    details: {
                        Name: sName,
                        Segment: segNameRef,
                        Address: formatHex(sAddr),
                        Size: formatHex(sSize),
                        Offset: formatHex(sOffset)
                    }
                });

                // Register Section Metadata for navigation
                sectionsMetadata.push({
                    name: `${segNameRef}.${sName}`,
                    virtualAddress: sAddrNum,
                    virtualSize: sSizeNum,
                    pointerToRawData: sOffsetNum,
                    sizeOfRawData: sSizeNum
                });

                // Add actual Data Region if it exists in file
                if (sSizeNum > 0 && sOffsetNum > 0 && sOffsetNum + sSizeNum <= buffer.byteLength) {
                    // Note: We don't push to regions immediately to avoid cluttering root, 
                    // or we can push to root regions list. 
                    // Standard practice in this app is to push major data chunks to root regions list.
                    
                    // However, Segments in Mach-O define the layout. 
                    // Since LC_SEGMENT defines the blob, we should probably add the whole segment data as a region
                }

                sectOffset += sectionHeaderSize;
            }

             // Add the actual Segment Data as a root region
             const fileOffNum = Number(fileOff);
             const fileSizeNum = Number(fileSize);
             if (fileSizeNum > 0 && fileOffNum >= 0 && fileOffNum + fileSizeNum <= buffer.byteLength) {
                 // Check if we already have this region covered (e.g. __TEXT usually includes Header)
                 // For visualization, it's better to show the distinct data segments
                 if (fileOffNum >= offset + cmdSize) { // Don't overlap the header/load commands
                    regions.push({
                        name: `Segment: ${segName}`,
                        offset: fileOffNum,
                        size: fileSizeNum,
                        type: RegionType.SEGMENT,
                        color: palette.SEGMENT,
                        description: `Data for segment ${segName}`
                    });
                 }
             }
        }
        
        // Handle LC_MAIN (Entry Point)
        if (cmd === 0x80000028) { // LC_MAIN
             const entryOffset = view.getBigUint64(offset + 8, isLE);
             if (cmdRegion.details) cmdRegion.details.EntryOffset = formatHex(entryOffset);
        }

        loadCommandsRegion.children?.push(cmdRegion);
        offset += cmdSize;
    }
    
    regions.push(loadCommandsRegion);

    // Sort regions by offset for better sidebar ordering, though standard order is usually fine
    regions.sort((a, b) => a.offset - b.offset);

    return {
        name: fileName,
        size: buffer.byteLength,
        data: view,
        regions,
        sectionsMetadata,
        isValid: true,
        format: 'Mach-O'
    };
};
