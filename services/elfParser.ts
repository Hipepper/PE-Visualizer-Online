
import { ParsedFile, PERegion, RegionType, COLORS, DARK_COLORS, SectionMetadata } from '../types';

// --- Constants ---

const EI_MAG0 = 0x7F;
const EI_MAG1 = 0x45; // 'E'
const EI_MAG2 = 0x4C; // 'L'
const EI_MAG3 = 0x46; // 'F'

const EI_CLASS = 4;
const EI_DATA = 5;
const EI_VERSION = 6;
const EI_OSABI = 7;
const EI_ABIVERSION = 8;

const ELFCLASS32 = 1;
const ELFCLASS64 = 2;

const ELFDATA2LSB = 1; // Little Endian
const ELFDATA2MSB = 2; // Big Endian

const ET_NONE = 0;
const ET_REL = 1;
const ET_EXEC = 2;
const ET_DYN = 3;
const ET_CORE = 4;

const E_TYPES: Record<number, string> = {
    0: 'ET_NONE',
    1: 'ET_REL (Relocatable)',
    2: 'ET_EXEC (Executable)',
    3: 'ET_DYN (Shared Object)',
    4: 'ET_CORE (Core File)'
};

const MACHINE_TYPES: Record<number, string> = {
    0: 'No Machine',
    3: 'x86',
    8: 'MIPS',
    0x14: 'PowerPC',
    0x28: 'ARM',
    0x32: 'IA-64',
    0x3E: 'x86-64',
    0xB7: 'AArch64',
    0xF3: 'RISC-V'
};

const PT_TYPES: Record<number, string> = {
    0: 'PT_NULL',
    1: 'PT_LOAD',
    2: 'PT_DYNAMIC',
    3: 'PT_INTERP',
    4: 'PT_NOTE',
    5: 'PT_SHLIB',
    6: 'PT_PHDR',
    7: 'PT_TLS'
};

const SH_TYPES: Record<number, string> = {
    0: 'SHT_NULL',
    1: 'SHT_PROGBITS',
    2: 'SHT_SYMTAB',
    3: 'SHT_STRTAB',
    4: 'SHT_RELA',
    5: 'SHT_HASH',
    6: 'SHT_DYNAMIC',
    7: 'SHT_NOTE',
    8: 'SHT_NOBITS',
    9: 'SHT_REL',
    10: 'SHT_SHLIB',
    11: 'SHT_DYNSYM'
};

const formatHex = (val: number | bigint, pad: number = 0) => {
    return '0x' + val.toString(16).toUpperCase().padStart(pad, '0');
};

// Helper to read a string from the buffer safely
const readString = (view: DataView, offset: number): string => {
    let str = '';
    const maxLen = view.byteLength - offset;
    if (maxLen <= 0) return '';
    
    // Cap string read at reasonable length to avoid freeze on bad offsets
    const limit = Math.min(maxLen, 256); 

    for (let i = 0; i < limit; i++) {
      const charCode = view.getUint8(offset + i);
      if (charCode === 0) break;
      str += String.fromCharCode(charCode);
    }
    return str;
};

export const parseELF = (buffer: ArrayBuffer, fileName: string, isDarkMode: boolean = true): ParsedFile => {
    const view = new DataView(buffer);
    const regions: PERegion[] = [];
    const sectionsMetadata: SectionMetadata[] = [];
    const palette = isDarkMode ? DARK_COLORS : COLORS;

    // Basic Validation
    if (view.byteLength < 16) {
        return { name: fileName, size: buffer.byteLength, data: view, regions: [], sectionsMetadata: [], isValid: false, error: 'File too small', format: 'ELF' };
    }

    // 1. Check Magic
    if (view.getUint8(0) !== EI_MAG0 || view.getUint8(1) !== EI_MAG1 || 
        view.getUint8(2) !== EI_MAG2 || view.getUint8(3) !== EI_MAG3) {
        return { name: fileName, size: buffer.byteLength, data: view, regions: [], sectionsMetadata: [], isValid: false, error: 'Invalid ELF magic', format: 'ELF' };
    }

    // 2. Determine Class (32/64) and Endianness
    const classByte = view.getUint8(EI_CLASS);
    const dataByte = view.getUint8(EI_DATA);

    const is64 = classByte === ELFCLASS64;
    const isLE = dataByte === ELFDATA2LSB;

    // Header Sizes
    const headerSize = is64 ? 64 : 52;

    // Parse ELF Header
    // e_type (16), e_machine (16), e_version (32)
    const e_type = view.getUint16(16, isLE);
    const e_machine = view.getUint16(18, isLE);
    const e_version = view.getUint32(20, isLE);
    
    let off = 24;
    const e_entry = is64 ? view.getBigUint64(off, isLE) : BigInt(view.getUint32(off, isLE)); off += is64 ? 8 : 4;
    const e_phoff = is64 ? view.getBigUint64(off, isLE) : BigInt(view.getUint32(off, isLE)); off += is64 ? 8 : 4;
    const e_shoff = is64 ? view.getBigUint64(off, isLE) : BigInt(view.getUint32(off, isLE)); off += is64 ? 8 : 4;
    
    const e_flags = view.getUint32(off, isLE); off += 4;
    const e_ehsize = view.getUint16(off, isLE); off += 2;
    const e_phentsize = view.getUint16(off, isLE); off += 2;
    const e_phnum = view.getUint16(off, isLE); off += 2;
    const e_shentsize = view.getUint16(off, isLE); off += 2;
    const e_shnum = view.getUint16(off, isLE); off += 2;
    const e_shstrndx = view.getUint16(off, isLE); off += 2;

    const machineName = MACHINE_TYPES[e_machine] || `Unknown (${formatHex(e_machine)})`;
    const typeName = E_TYPES[e_type] || 'Unknown';

    regions.push({
        name: 'ELF Header',
        offset: 0,
        size: headerSize,
        type: RegionType.ELF_HEADER,
        color: palette.ELF_HEADER,
        description: `ELF ${is64 ? '64-bit' : '32-bit'} ${isLE ? 'LSB' : 'MSB'} ${typeName}`,
        details: {
            Class: is64 ? '64-bit' : '32-bit',
            Data: isLE ? 'Little Endian' : 'Big Endian',
            Type: typeName,
            Machine: machineName,
            Entry: formatHex(e_entry),
            Flags: formatHex(e_flags),
            PHOffset: formatHex(e_phoff),
            SHOffset: formatHex(e_shoff),
            SHStringIdx: e_shstrndx
        },
        children: [
            { name: 'Magic', offset: 0, size: 4, type: RegionType.FIELD, color: palette.FIELD, value: '\\x7FELF' },
            { name: 'Class', offset: 4, size: 1, type: RegionType.FIELD, color: palette.FIELD, value: classByte, description: is64 ? '64-bit' : '32-bit' },
            { name: 'Data', offset: 5, size: 1, type: RegionType.FIELD, color: palette.FIELD, value: dataByte, description: isLE ? 'Little Endian' : 'Big Endian' },
            { name: 'Type', offset: 16, size: 2, type: RegionType.FIELD, color: palette.FIELD, value: formatHex(e_type), description: typeName },
            { name: 'Machine', offset: 18, size: 2, type: RegionType.FIELD, color: palette.FIELD, value: formatHex(e_machine), description: machineName },
            { name: 'Entry', offset: 24, size: is64 ? 8 : 4, type: RegionType.FIELD, color: palette.FIELD, value: formatHex(e_entry) }
        ]
    });

    // 3. Parse Program Headers
    if (e_phnum > 0 && e_phoff > 0) {
        const phOffset = Number(e_phoff);
        const phSize = e_phnum * e_phentsize;
        
        // Bounds check
        if (phOffset + phSize <= buffer.byteLength) {
            const phRegion: PERegion = {
                name: 'Program Headers',
                offset: phOffset,
                size: phSize,
                type: RegionType.PROGRAM_HEADER,
                color: palette.PROGRAM_HEADER,
                children: []
            };

            for (let i = 0; i < e_phnum; i++) {
                const currOff = phOffset + (i * e_phentsize);
                
                // Parse PH Entry
                let p_type, p_flags, p_offset, p_vaddr, p_paddr, p_filesz, p_memsz, p_align;
                
                if (is64) {
                    p_type = view.getUint32(currOff, isLE);
                    p_flags = view.getUint32(currOff + 4, isLE);
                    p_offset = view.getBigUint64(currOff + 8, isLE);
                    p_vaddr = view.getBigUint64(currOff + 16, isLE);
                    p_paddr = view.getBigUint64(currOff + 24, isLE);
                    p_filesz = view.getBigUint64(currOff + 32, isLE);
                    p_memsz = view.getBigUint64(currOff + 40, isLE);
                    p_align = view.getBigUint64(currOff + 48, isLE);
                } else {
                    p_type = view.getUint32(currOff, isLE);
                    p_offset = BigInt(view.getUint32(currOff + 4, isLE));
                    p_vaddr = BigInt(view.getUint32(currOff + 8, isLE));
                    p_paddr = BigInt(view.getUint32(currOff + 12, isLE));
                    p_filesz = BigInt(view.getUint32(currOff + 16, isLE));
                    p_memsz = BigInt(view.getUint32(currOff + 20, isLE));
                    p_flags = view.getUint32(currOff + 24, isLE);
                    p_align = BigInt(view.getUint32(currOff + 28, isLE));
                }

                const typeStr = PT_TYPES[p_type] || formatHex(p_type);

                phRegion.children?.push({
                    name: `PH ${i}: ${typeStr}`,
                    offset: currOff,
                    size: e_phentsize,
                    type: RegionType.PROGRAM_HEADER,
                    color: palette.PROGRAM_HEADER,
                    details: {
                        Type: typeStr,
                        Offset: formatHex(p_offset),
                        VAddr: formatHex(p_vaddr),
                        FileSz: formatHex(p_filesz),
                        MemSz: formatHex(p_memsz),
                        Flags: formatHex(p_flags)
                    }
                });
            }
            regions.push(phRegion);
        }
    }

    // 4. Parse Section Headers
    let stringTableOffset = -1;

    // We need to read headers first to find the string table, then resolve names
    interface TempSection {
        index: number;
        nameIdx: number;
        type: number;
        flags: bigint | number;
        addr: bigint;
        offset: bigint;
        size: bigint;
        link: number;
        info: number;
        addralign: bigint;
        entsize: bigint;
        headerOffset: number;
    }

    const tempSections: TempSection[] = [];

    if (e_shnum > 0 && e_shoff > 0) {
        const shOffset = Number(e_shoff);
        const shTotalSize = e_shnum * e_shentsize;

        if (shOffset + shTotalSize <= buffer.byteLength) {
            for (let i = 0; i < e_shnum; i++) {
                const currOff = shOffset + (i * e_shentsize);
                
                let sh_name, sh_type, sh_flags, sh_addr, sh_offset, sh_size, sh_link, sh_info, sh_addralign, sh_entsize;

                if (is64) {
                    sh_name = view.getUint32(currOff, isLE);
                    sh_type = view.getUint32(currOff + 4, isLE);
                    sh_flags = view.getBigUint64(currOff + 8, isLE);
                    sh_addr = view.getBigUint64(currOff + 16, isLE);
                    sh_offset = view.getBigUint64(currOff + 24, isLE);
                    sh_size = view.getBigUint64(currOff + 32, isLE);
                    sh_link = view.getUint32(currOff + 40, isLE);
                    sh_info = view.getUint32(currOff + 44, isLE);
                    sh_addralign = view.getBigUint64(currOff + 48, isLE);
                    sh_entsize = view.getBigUint64(currOff + 56, isLE);
                } else {
                    sh_name = view.getUint32(currOff, isLE);
                    sh_type = view.getUint32(currOff + 4, isLE);
                    sh_flags = view.getUint32(currOff + 8, isLE);
                    sh_addr = BigInt(view.getUint32(currOff + 12, isLE));
                    sh_offset = BigInt(view.getUint32(currOff + 16, isLE));
                    sh_size = BigInt(view.getUint32(currOff + 20, isLE));
                    sh_link = view.getUint32(currOff + 24, isLE);
                    sh_info = view.getUint32(currOff + 28, isLE);
                    sh_addralign = BigInt(view.getUint32(currOff + 32, isLE));
                    sh_entsize = BigInt(view.getUint32(currOff + 36, isLE));
                }

                tempSections.push({
                    index: i,
                    nameIdx: sh_name,
                    type: sh_type,
                    flags: sh_flags,
                    addr: sh_addr,
                    offset: sh_offset,
                    size: sh_size,
                    link: sh_link,
                    info: sh_info,
                    addralign: sh_addralign,
                    entsize: sh_entsize,
                    headerOffset: currOff
                });
            }

            // Identify String Table
            if (e_shstrndx !== 0 && e_shstrndx < tempSections.length) {
                const strTabSection = tempSections[e_shstrndx];
                if (strTabSection.type === 3) { // SHT_STRTAB
                    stringTableOffset = Number(strTabSection.offset);
                }
            }

            // Build Section Regions
            const sectionsRegion: PERegion = {
                name: 'Section Headers',
                offset: shOffset,
                size: shTotalSize,
                type: RegionType.SECTION_HEADER,
                color: palette.SECTION_HEADER,
                children: []
            };

            const dataRegions: PERegion[] = [];

            tempSections.forEach(sec => {
                let name = `Section ${sec.index}`;
                
                // Resolve Name
                if (stringTableOffset > 0 && sec.nameIdx > 0) {
                    const nameOff = stringTableOffset + sec.nameIdx;
                    if (nameOff < buffer.byteLength) {
                        name = readString(view, nameOff);
                    }
                }

                const typeStr = SH_TYPES[sec.type] || formatHex(sec.type);
                const offsetNum = Number(sec.offset);
                const sizeNum = Number(sec.size);

                // Add to Section Header container
                sectionsRegion.children?.push({
                    name: `SH: ${name || typeStr}`,
                    offset: sec.headerOffset,
                    size: e_shentsize,
                    type: RegionType.SECTION_HEADER,
                    color: palette.SECTION_HEADER,
                    details: {
                        Name: name,
                        Type: typeStr,
                        Addr: formatHex(sec.addr),
                        Offset: formatHex(sec.offset),
                        Size: formatHex(sec.size),
                        EntSize: formatHex(sec.entsize),
                        Flags: formatHex(sec.flags)
                    }
                });

                // Add to Metadata
                sectionsMetadata.push({
                    name: name,
                    virtualAddress: Number(sec.addr),
                    virtualSize: sizeNum,
                    pointerToRawData: offsetNum,
                    sizeOfRawData: sizeNum
                });

                // Add Data Region (SHT_NOBITS = 8 has no file presence)
                if (sec.type !== 8 && sizeNum > 0 && offsetNum + sizeNum <= buffer.byteLength) {
                    // Filter out the ELF header itself if a section (like .text) covers it? 
                    // Usually sections don't overlap header but just in case.
                    
                    dataRegions.push({
                        name: `Section: ${name}`,
                        offset: offsetNum,
                        size: sizeNum,
                        type: RegionType.SECTION_DATA,
                        color: palette.SECTION_DATA,
                        description: `${typeStr} - ${name}`
                    });
                }
            });

            regions.push(sectionsRegion);
            regions.push(...dataRegions);
        }
    }

    // Sort regions by offset for display
    regions.sort((a, b) => a.offset - b.offset);

    return {
        name: fileName,
        size: buffer.byteLength,
        data: view,
        regions,
        sectionsMetadata,
        isValid: true,
        format: 'ELF'
    };
};
