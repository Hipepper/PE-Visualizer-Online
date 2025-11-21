
import { ParsedFile, PERegion, RegionType, COLORS, DARK_COLORS, SectionMetadata } from '../types';

// --- Constants ---

const MAGIC_32_LE = 0xFEEDFACE;
const MAGIC_32_BE = 0xCEFAEDFE;
const MAGIC_64_LE = 0xFEEDFACF;
const MAGIC_64_BE = 0xCFFAEDFE;

const FAT_MAGIC_BE = 0xCAFEBABE;
const FAT_CIGAM_LE = 0xBEBAFECA;
const FAT_MAGIC_64_BE = 0xCAFEBABF;
const FAT_CIGAM_64_LE = 0xBFBAFECA;

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

// --- Helper: Parse a single Mach-O slice ---
// This returns regions and metadata to be appended to the main list or nested
const parseMachOAtOffset = (
    view: DataView, 
    offset: number, 
    sizeLimit: number,
    palette: any,
    prefix: string = ""
): { regions: PERegion[], sectionsMetadata: SectionMetadata[] } => {
    const regions: PERegion[] = [];
    const sectionsMetadata: SectionMetadata[] = [];

    // Check bounds
    if (offset + 4 > view.byteLength) return { regions, sectionsMetadata };

    // 1. Determine Endianness and Arch
    const magic = view.getUint32(offset, false); // Read Big Endian first
    let isLE = false;
    let is64 = false;

    if (magic === MAGIC_32_LE) { isLE = false; is64 = false; }
    else if (magic === MAGIC_32_BE) { isLE = true; is64 = false; }
    else if (magic === MAGIC_64_LE) { isLE = false; is64 = true; }
    else if (magic === MAGIC_64_BE) { isLE = true; is64 = true; }
    else {
        // Not a valid Mach-O header at this offset
        return { regions, sectionsMetadata };
    }

    // 2. Header
    const headerSize = is64 ? 32 : 28;
    if (offset + headerSize > view.byteLength) return { regions, sectionsMetadata };

    const cpuType = view.getInt32(offset + 4, isLE);
    const cpuSubtype = view.getInt32(offset + 8, isLE);
    const fileType = view.getUint32(offset + 12, isLE);
    const nCmds = view.getUint32(offset + 16, isLE);
    const sizeofCmds = view.getUint32(offset + 20, isLE);
    const flags = view.getUint32(offset + 24, isLE);

    const cpuName = CPU_TYPES[cpuType] || formatHex(cpuType);

    regions.push({
        name: `${prefix}Mach-O Header`,
        offset: offset,
        size: headerSize,
        type: RegionType.MACHO_HEADER,
        color: palette.MACHO_HEADER,
        description: `${is64 ? '64-bit' : '32-bit'} Mach-O (${cpuName}, ${isLE ? 'LE' : 'BE'})`,
        details: {
            Magic: formatHex(magic, 8),
            CpuType: cpuName,
            FileType: formatHex(fileType),
            NCmds: nCmds,
            SizeOfCmds: sizeofCmds,
            Flags: formatHex(flags)
        }
    });

    // 3. Load Commands
    let currentCmdOffset = offset + headerSize;
    const loadCommandsRegion: PERegion = {
        name: `${prefix}Load Commands`,
        offset: currentCmdOffset,
        size: sizeofCmds,
        type: RegionType.LOAD_COMMAND,
        color: palette.LOAD_COMMAND,
        children: []
    };

    for (let i = 0; i < nCmds; i++) {
        if (currentCmdOffset + 8 > view.byteLength) break;
        
        const cmd = view.getUint32(currentCmdOffset, isLE);
        const cmdSize = view.getUint32(currentCmdOffset + 4, isLE);
        const cmdName = LC_TYPES[cmd] || formatHex(cmd);

        const cmdRegion: PERegion = {
            name: cmdName,
            offset: currentCmdOffset,
            size: cmdSize,
            type: RegionType.LOAD_COMMAND,
            color: palette.LOAD_COMMAND,
            details: {
                Command: formatHex(cmd),
                Size: cmdSize
            },
            children: [
                { name: 'Command', offset: currentCmdOffset, size: 4, type: RegionType.FIELD, color: palette.FIELD, value: formatHex(cmd), description: cmdName },
                { name: 'CmdSize', offset: currentCmdOffset + 4, size: 4, type: RegionType.FIELD, color: palette.FIELD, value: cmdSize }
            ]
        };

        // Parse Segments to find sections (LC_SEGMENT or LC_SEGMENT_64)
        if (cmd === 0x1 || cmd === 0x19) {
            const isSeg64 = cmd === 0x19;
            // Bounds check for segment structure
            if (currentCmdOffset + (isSeg64 ? 72 : 56) <= view.byteLength) {
                const segName = readString(view, currentCmdOffset + 8, 16);
                const vmAddr = isSeg64 ? view.getBigUint64(currentCmdOffset + 24, isLE) : BigInt(view.getUint32(currentCmdOffset + 24, isLE));
                const vmSize = isSeg64 ? view.getBigUint64(currentCmdOffset + 32, isLE) : BigInt(view.getUint32(currentCmdOffset + 28, isLE));
                const fileOff = isSeg64 ? view.getBigUint64(currentCmdOffset + 40, isLE) : BigInt(view.getUint32(currentCmdOffset + 32, isLE));
                const fileSize = isSeg64 ? view.getBigUint64(currentCmdOffset + 48, isLE) : BigInt(view.getUint32(currentCmdOffset + 36, isLE));
                
                // Number of sections
                const nSectsOffset = currentCmdOffset + (isSeg64 ? 64 : 48);
                const nSects = view.getUint32(nSectsOffset, isLE);

                if (cmdRegion.details) {
                    cmdRegion.details.SegmentName = segName;
                    cmdRegion.details.NSects = nSects;
                    cmdRegion.details.VMAddr = formatHex(vmAddr);
                    cmdRegion.details.FileOff = formatHex(fileOff);
                }

                // Add Section Headers
                const sectionHeaderSize = isSeg64 ? 80 : 68;
                let sectOffset = currentCmdOffset + (isSeg64 ? 72 : 56);
                
                for(let s=0; s<nSects; s++) {
                    if (sectOffset + sectionHeaderSize > view.byteLength) break;
                    const sName = readString(view, sectOffset, 16);
                    const segNameRef = readString(view, sectOffset + 16, 16);
                    
                    // Offsets for Addr/Size vary by arch
                    const sAddr = isSeg64 ? view.getBigUint64(sectOffset + 32, isLE) : BigInt(view.getUint32(sectOffset + 32, isLE));
                    const sSize = isSeg64 ? view.getBigUint64(sectOffset + 40, isLE) : BigInt(view.getUint32(sectOffset + 36, isLE));
                    const sOffset = view.getUint32(sectOffset + (isSeg64 ? 48 : 40), isLE);
                    
                    const sSizeNum = Number(sSize);
                    const sOffsetNum = Number(sOffset);
                    const sAddrNum = Number(sAddr);

                    // Since this slice might be inside a fat binary, the sOffset is absolute from file start.
                    // Mach-O internal offsets are absolute file offsets, unless it's a library or object file where things get complex.
                    // For standard executables in Fat binaries, offsets are from start of file (not start of slice), 
                    // BUT sometimes they are relative if it's an archive.
                    // In Mach-O Fat binaries (Universal), the `offset` in `fat_arch` points to the start of the Mach-O.
                    // Inside that Mach-O, the `fileoff` in LC_SEGMENT is often 0-based from the start of that Mach-O slice?
                    // Actually, usually `fileoff` in LC_SEGMENT is 0 if it includes the header.
                    // Let's interpret `fileOff` relative to the Slice Start if it's a fat binary?
                    // NO: In standard Apple Universal binaries, the offsets in LC_SEGMENT are relative to the beginning of the file containing the architecture (the slice start). 
                    // However, since we pass the DataView of the whole file, we need to adjust if we want to read data.
                    
                    // WAIT: In a Fat Binary, the offsets in the Mach-O headers inside the slices are typically relative to the start of the FAT file?
                    // Actually, NO. The Mach-O headers inside a FAT binary are self-contained.
                    // The `fileoff` in `LC_SEGMENT` is typically 0 for the `__TEXT` segment which includes the Mach-O header.
                    // BUT, physically in the file, that header is at `slice_offset`.
                    // So, `Absolute Offset = Slice Offset + Segment File Offset`.
                    // Since we are parsing at `offset` (which is Slice Offset), we need to add it.
                    
                    const absoluteSectionOffset = offset + sOffsetNum;

                    cmdRegion.children?.push({
                        name: `Section: ${sName}`,
                        offset: sectOffset,
                        size: sectionHeaderSize,
                        type: RegionType.SECTION_HEADER,
                        color: palette.SECTION_HEADER,
                        details: {
                            Name: sName,
                            Segment: segNameRef,
                            Address: formatHex(sAddr),
                            Size: formatHex(sSize),
                            Offset: formatHex(sOffset),
                            RealOffset: formatHex(absoluteSectionOffset)
                        }
                    });

                    sectionsMetadata.push({
                        name: `${prefix}${segNameRef}.${sName}`,
                        virtualAddress: sAddrNum,
                        virtualSize: sSizeNum,
                        pointerToRawData: absoluteSectionOffset,
                        sizeOfRawData: sSizeNum
                    });

                    sectOffset += sectionHeaderSize;
                }

                // Add Segment Data Region
                const fileOffNum = Number(fileOff);
                const fileSizeNum = Number(fileSize);
                const absoluteSegmentOffset = offset + fileOffNum;

                if (fileSizeNum > 0 && absoluteSegmentOffset + fileSizeNum <= view.byteLength) {
                     // For Text segment, it usually overlaps headers. We only add it if it doesn't obscure everything,
                     // or we rely on the tree view handling overlaps.
                     // Let's add it to the root regions list for this slice.
                     if (fileOffNum >= headerSize + sizeofCmds) { // Heuristic: only add data if it's after commands
                        regions.push({
                            name: `${prefix}Segment: ${segName}`,
                            offset: absoluteSegmentOffset,
                            size: fileSizeNum,
                            type: RegionType.SEGMENT,
                            color: palette.SEGMENT,
                            description: `Data for ${segName} (${cpuName})`
                        });
                     }
                }
            }
        }
        
        // Handle LC_MAIN (Entry Point)
        if (cmd === 0x80000028) { // LC_MAIN
             const entryOffset = view.getBigUint64(currentCmdOffset + 8, isLE);
             if (cmdRegion.details) cmdRegion.details.EntryOffset = formatHex(entryOffset);
        }

        loadCommandsRegion.children?.push(cmdRegion);
        currentCmdOffset += cmdSize;
    }
    
    regions.push(loadCommandsRegion);
    
    return { regions, sectionsMetadata };
};


export const parseMachO = (buffer: ArrayBuffer, fileName: string, isDarkMode: boolean = true): ParsedFile => {
    const view = new DataView(buffer);
    const regions: PERegion[] = [];
    const sectionsMetadata: SectionMetadata[] = [];
    const palette = isDarkMode ? DARK_COLORS : COLORS;

    if (view.byteLength < 28) {
        return { name: fileName, size: buffer.byteLength, data: view, regions: [], sectionsMetadata: [], isValid: false, error: 'File too small', format: 'Mach-O' };
    }

    const magic = view.getUint32(0, false); // Check BE first

    // Detect Fat Binary
    if (magic === FAT_MAGIC_BE || magic === FAT_CIGAM_LE || magic === FAT_MAGIC_64_BE || magic === FAT_CIGAM_64_LE) {
        const isLE = (magic === FAT_CIGAM_LE || magic === FAT_CIGAM_64_LE);
        const nFatArch = view.getUint32(4, isLE);
        
        regions.push({
            name: 'Fat Header',
            offset: 0,
            size: 8,
            type: RegionType.FAT_HEADER,
            color: palette.FAT_HEADER,
            details: {
                Magic: formatHex(magic, 8),
                NumArchs: nFatArch
            }
        });

        // Parse Arch Definitions
        let offset = 8;
        for (let i = 0; i < nFatArch; i++) {
            // struct fat_arch {
            //    cpu_type_t  cputype;
            //    cpu_subtype_t cpusubtype;
            //    uint32_t    offset;
            //    uint32_t    size;
            //    uint32_t    align;
            // };
            const archStructSize = 20; // standard fat_arch is 20 bytes
            if (offset + archStructSize > view.byteLength) break;

            const cputype = view.getInt32(offset, isLE);
            const cpusubtype = view.getInt32(offset + 4, isLE);
            const sliceOffset = view.getUint32(offset + 8, isLE);
            const sliceSize = view.getUint32(offset + 12, isLE);
            const align = view.getUint32(offset + 16, isLE);

            const cpuName = CPU_TYPES[cputype] || formatHex(cputype);

            regions.push({
                name: `Arch Def: ${cpuName}`,
                offset: offset,
                size: archStructSize,
                type: RegionType.FAT_HEADER,
                color: palette.FAT_HEADER,
                details: {
                    CpuType: cpuName,
                    Offset: formatHex(sliceOffset),
                    Size: formatHex(sliceSize),
                    Align: align
                }
            });

            // Recursively parse the slice
            if (sliceOffset > 0 && sliceOffset + sliceSize <= view.byteLength) {
                const sliceParse = parseMachOAtOffset(view, sliceOffset, sliceSize, palette, `[${cpuName}] `);
                
                // Create a container region for the slice for better visualization
                regions.push({
                    name: `Slice: ${cpuName}`,
                    offset: sliceOffset,
                    size: sliceSize,
                    type: RegionType.SEGMENT,
                    color: palette.OVERLAY,
                    description: `Full binary for ${cpuName}`,
                    // Don't nest children too deep, just push them to main regions list or as children?
                    // Since offsets are global, pushing to main list is fine, but nesting keeps sidebar clean.
                    children: sliceParse.regions
                });

                // Add metadata
                sectionsMetadata.push(...sliceParse.sectionsMetadata);
            }

            offset += archStructSize;
        }

    } else {
        // Standard Single Arch
        const result = parseMachOAtOffset(view, 0, view.byteLength, palette);
        regions.push(...result.regions);
        sectionsMetadata.push(...result.sectionsMetadata);
    }

    // Final sort
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
