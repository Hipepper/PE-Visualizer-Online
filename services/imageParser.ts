

import { ParsedFile, PERegion, RegionType, COLORS, DARK_COLORS, SectionMetadata } from '../types';

const formatHex = (val: number | bigint, pad: number = 0) => '0x' + val.toString(16).toUpperCase().padStart(pad, '0');

const readString = (view: DataView, offset: number, length: number): string => {
  let str = '';
  const maxLen = Math.min(length, view.byteLength - offset);
  for (let i = 0; i < maxLen; i++) {
    const charCode = view.getUint8(offset + i);
    if (charCode === 0) break;
    str += String.fromCharCode(charCode);
  }
  return str;
};

// --- PNG Parser ---
// Ref: https://www.w3.org/TR/PNG-Structure.html

const PNG_SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

const PNG_CHUNK_TYPES: Record<string, string> = {
    'IHDR': 'Image Header',
    'PLTE': 'Palette',
    'IDAT': 'Image Data',
    'IEND': 'Image End',
    'tEXt': 'Textual Data',
    'zTXt': 'Compressed Text',
    'iTXt': 'International Text',
    'bKGD': 'Background Color',
    'cHRM': 'Primary Chromaticities',
    'gAMA': 'Gamma',
    'hIST': 'Histogram',
    'pHYs': 'Physical Pixel Dimensions',
    'sBIT': 'Significant Bits',
    'sRGB': 'Standard RGB Color Space',
    'tIME': 'Image Last-Modification Time',
    'tRNS': 'Transparency'
};

export const parsePNG = (buffer: ArrayBuffer, fileName: string, isDarkMode: boolean = true): ParsedFile => {
    const view = new DataView(buffer);
    const regions: PERegion[] = [];
    const palette = isDarkMode ? DARK_COLORS : COLORS;

    // Signature
    regions.push({
        name: 'PNG Signature',
        offset: 0,
        size: 8,
        type: RegionType.IMAGE_HEADER,
        color: palette.IMAGE_HEADER, // Recycle color or add specific
        value: '89 50 4E 47 0D 0A 1A 0A'
    });

    let offset = 8;
    while (offset < view.byteLength) {
        if (offset + 8 > view.byteLength) break;

        const length = view.getUint32(offset, false); // Big Endian
        const type = readString(view, offset + 4, 4);
        const totalSize = 12 + length; // Len(4) + Type(4) + Data(Len) + CRC(4)

        if (offset + totalSize > view.byteLength) break;

        const desc = PNG_CHUNK_TYPES[type] || 'Unknown Chunk';

        const chunkRegion: PERegion = {
            name: `Chunk: ${type}`,
            offset: offset,
            size: totalSize,
            type: RegionType.PNG_CHUNK,
            color: palette.PNG_CHUNK,
            description: desc,
            details: {
                Length: length,
                Type: type,
                CRC: formatHex(view.getUint32(offset + 8 + length, false), 8)
            },
            children: [
                { name: 'Length', offset: offset, size: 4, type: RegionType.FIELD, color: palette.FIELD, value: length },
                { name: 'Type', offset: offset + 4, size: 4, type: RegionType.FIELD, color: palette.FIELD, value: type, description: desc },
            ]
        };

        // Specific parsing for IHDR
        if (type === 'IHDR' && length >= 13) {
            const w = view.getUint32(offset + 8, false);
            const h = view.getUint32(offset + 12, false);
            const bitDepth = view.getUint8(offset + 16);
            const colorType = view.getUint8(offset + 17);
            const compression = view.getUint8(offset + 18);
            const filter = view.getUint8(offset + 19);
            const interlace = view.getUint8(offset + 20);

            chunkRegion.details = {
                ...chunkRegion.details,
                Width: w,
                Height: h,
                BitDepth: bitDepth,
                ColorType: colorType
            };

            chunkRegion.children?.push({ name: 'Width', offset: offset + 8, size: 4, type: RegionType.FIELD, color: palette.FIELD, value: w });
            chunkRegion.children?.push({ name: 'Height', offset: offset + 12, size: 4, type: RegionType.FIELD, color: palette.FIELD, value: h });
            chunkRegion.children?.push({ name: 'BitDepth', offset: offset + 16, size: 1, type: RegionType.FIELD, color: palette.FIELD, value: bitDepth });
            chunkRegion.children?.push({ name: 'ColorType', offset: offset + 17, size: 1, type: RegionType.FIELD, color: palette.FIELD, value: colorType });
        }

        // Data Region
        if (length > 0) {
            chunkRegion.children?.push({
                name: 'Data',
                offset: offset + 8,
                size: length,
                type: RegionType.IMAGE_DATA,
                color: palette.IMAGE_DATA,
                description: type === 'IDAT' ? 'Compressed Image Data' : 'Chunk Data'
            });
        }
        
        // CRC
        chunkRegion.children?.push({ name: 'CRC', offset: offset + 8 + length, size: 4, type: RegionType.FIELD, color: palette.FIELD, value: formatHex(view.getUint32(offset + 8 + length, false), 8) });

        regions.push(chunkRegion);
        offset += totalSize;
        
        if (type === 'IEND') break;
    }

    return {
        name: fileName,
        size: buffer.byteLength,
        data: view,
        regions,
        sectionsMetadata: [],
        isValid: true,
        format: 'PNG'
    };
};


// --- JPEG Parser ---
// Ref: https://en.wikipedia.org/wiki/JPEG#Syntax_and_structure

const JPEG_MARKERS: Record<number, string> = {
    0xD8: 'SOI (Start of Image)',
    0xE0: 'APP0 (JFIF)',
    0xE1: 'APP1 (EXIF)',
    0xE2: 'APP2', 0xE3: 'APP3', 0xE4: 'APP4', 0xE5: 'APP5', 0xE6: 'APP6', 0xE7: 'APP7',
    0xE8: 'APP8', 0xE9: 'APP9', 0xEA: 'APP10', 0xEB: 'APP11', 0xEC: 'APP12', 0xED: 'APP13', 0xEE: 'APP14', 0xEF: 'APP15',
    0xDB: 'DQT (Define Quantization Table)',
    0xC0: 'SOF0 (Baseline DCT)',
    0xC2: 'SOF2 (Progressive DCT)',
    0xC4: 'DHT (Define Huffman Table)',
    0xDA: 'SOS (Start of Scan)',
    0xFE: 'COM (Comment)',
    0xD9: 'EOI (End of Image)',
    0xDD: 'DRI (Define Restart Interval)',
    // RSTn
    0xD0: 'RST0', 0xD1: 'RST1', 0xD2: 'RST2', 0xD3: 'RST3', 0xD4: 'RST4', 0xD5: 'RST5', 0xD6: 'RST6', 0xD7: 'RST7'
};

export const parseJPEG = (buffer: ArrayBuffer, fileName: string, isDarkMode: boolean = true): ParsedFile => {
    const view = new DataView(buffer);
    const regions: PERegion[] = [];
    const palette = isDarkMode ? DARK_COLORS : COLORS;

    let offset = 0;
    while (offset < view.byteLength - 1) {
        // Search for 0xFF
        if (view.getUint8(offset) !== 0xFF) {
            offset++;
            continue;
        }

        const markerByte = view.getUint8(offset + 1);
        // Skip padding 0xFF
        if (markerByte === 0xFF) {
            offset++;
            continue;
        }
        // 0x00 is byte stuffing in entropy data, not a marker
        if (markerByte === 0x00) {
            offset += 2;
            continue;
        }

        const markerName = JPEG_MARKERS[markerByte] || `Unknown Marker (0xFF${markerByte.toString(16).toUpperCase()})`;
        
        // Standalone markers (no length)
        const isStandalone = (markerByte >= 0xD0 && markerByte <= 0xD9) || markerByte === 0x01; 

        if (isStandalone) {
            regions.push({
                name: markerName.split(' ')[0],
                offset: offset,
                size: 2,
                type: RegionType.JPEG_SEGMENT,
                color: palette.JPEG_SEGMENT,
                description: markerName,
                value: `FF ${markerByte.toString(16).toUpperCase()}`
            });

            if (markerByte === 0xDA) { // SOS (Start of Scan)
                 // Technically SOS has a header, then data. But in many simplified parsers SOS is treated as header then data follows.
                 // Wait, standard says SOS *does* have a length field for its header components.
                 // However, isStandalone above includes D9 (EOI) and D8 (SOI). SOS (DA) is NOT standalone in terms of header, 
                 // but it initiates the entropy coded stream which has no length.
                 // Let's handle SOS specifically below.
            }
            
            offset += 2;
            
            if (markerByte === 0xD9) break; // EOI
        } else {
            // Marker with length
            if (offset + 4 > view.byteLength) break;
            
            const length = view.getUint16(offset + 2, false); // Big Endian, includes length bytes
            const totalSize = 2 + length;
            
            if (offset + totalSize > view.byteLength) break; // truncate?

            const segmentRegion: PERegion = {
                name: markerName.split(' ')[0],
                offset: offset,
                size: totalSize,
                type: RegionType.JPEG_SEGMENT,
                color: palette.JPEG_SEGMENT,
                description: markerName,
                details: { Length: length },
                children: [
                    { name: 'Marker', offset: offset, size: 2, type: RegionType.FIELD, color: palette.FIELD, value: `FF ${markerByte.toString(16).toUpperCase()}` },
                    { name: 'Length', offset: offset + 2, size: 2, type: RegionType.FIELD, color: palette.FIELD, value: length },
                    { name: 'Data', offset: offset + 4, size: length - 2, type: RegionType.IMAGE_DATA, color: palette.IMAGE_DATA }
                ]
            };
            
            // SOF0 parsing for dimensions
            if (markerByte === 0xC0 && length > 5) {
                const precision = view.getUint8(offset + 4);
                const height = view.getUint16(offset + 5, false);
                const width = view.getUint16(offset + 7, false);
                segmentRegion.details = { ...segmentRegion.details, Width: width, Height: height, Precision: precision };
                
                segmentRegion.children?.push({ name: 'Precision', offset: offset + 4, size: 1, type: RegionType.FIELD, color: palette.FIELD, value: precision });
                segmentRegion.children?.push({ name: 'Height', offset: offset + 5, size: 2, type: RegionType.FIELD, color: palette.FIELD, value: height });
                segmentRegion.children?.push({ name: 'Width', offset: offset + 7, size: 2, type: RegionType.FIELD, color: palette.FIELD, value: width });
            }
            
            regions.push(segmentRegion);
            offset += totalSize;
            
            // If SOS, we have entropy data following it immediately until the next marker.
            if (markerByte === 0xDA) {
                // Scan forward for next FF xx that is NOT 00 and NOT within RST range if we wanted to be precise, 
                // but usually just next valid marker.
                const scanStart = offset;
                let scanEnd = scanStart;
                while (scanEnd < view.byteLength - 1) {
                    if (view.getUint8(scanEnd) === 0xFF) {
                        const nextByte = view.getUint8(scanEnd + 1);
                        if (nextByte !== 0x00 && !(nextByte >= 0xD0 && nextByte <= 0xD7)) {
                            // Found a marker (likely EOI D9)
                            break;
                        }
                        scanEnd++; // Skip the stuffed byte or RST
                    }
                    scanEnd++;
                }
                
                if (scanEnd > scanStart) {
                    regions.push({
                        name: 'Entropy Data',
                        offset: scanStart,
                        size: scanEnd - scanStart,
                        type: RegionType.IMAGE_DATA,
                        color: palette.IMAGE_DATA,
                        description: 'Huffman coded image data'
                    });
                    offset = scanEnd;
                }
            }
        }
    }

    return {
        name: fileName,
        size: buffer.byteLength,
        data: view,
        regions,
        sectionsMetadata: [],
        isValid: true,
        format: 'JPEG'
    };
};

// --- HEIC/HEIF Parser (ISOBMFF) ---
// Ref: ISO/IEC 14496-12

const BOX_CONTAINERS = new Set([
    'moov', 'trak', 'edts', 'mdia', 'minf', 'dinf', 'stbl', 'mvex', 
    'moof', 'traf', 'mfra', 'skip', 'udta', 'meta', 'ipro', 'sinf', 
    'fiin', 'paen', 'strk'
]);

export const parseHEIC = (buffer: ArrayBuffer, fileName: string, isDarkMode: boolean = true): ParsedFile => {
    const view = new DataView(buffer);
    const regions: PERegion[] = [];
    const palette = isDarkMode ? DARK_COLORS : COLORS;

    const parseBoxes = (start: number, end: number, parentType?: string): PERegion[] => {
        const boxes: PERegion[] = [];
        let offset = start;
        
        while (offset < end) {
            if (offset + 8 > end) break;
            
            const size32 = view.getUint32(offset, false);
            const type = readString(view, offset + 4, 4);
            
            let boxSize = size32;
            let headerSize = 8;
            
            if (size32 === 1) {
                if (offset + 16 > end) break;
                const size64 = view.getBigUint64(offset + 8, false);
                boxSize = Number(size64); // Hopefully < 2^53
                headerSize = 16;
            } else if (size32 === 0) {
                boxSize = end - offset;
            }

            if (boxSize < headerSize || offset + boxSize > end + 100) { // lax check for truncation
                break; 
            }
            
            // Cap at end of file/parent
            const effectiveEnd = Math.min(offset + boxSize, end);
            
            const boxRegion: PERegion = {
                name: `Box: ${type}`,
                offset: offset,
                size: effectiveEnd - offset,
                type: RegionType.HEIC_BOX,
                color: palette.HEIC_BOX,
                details: { Type: type, Size: boxSize },
                children: [
                    { name: 'Size', offset: offset, size: 4, type: RegionType.FIELD, color: palette.FIELD, value: size32 },
                    { name: 'Type', offset: offset + 4, size: 4, type: RegionType.FIELD, color: palette.FIELD, value: type }
                ]
            };

            if (type === 'ftyp') {
                const majorBrand = readString(view, offset + 8, 4);
                const minorVersion = view.getUint32(offset + 12, false);
                boxRegion.details = { ...boxRegion.details, MajorBrand: majorBrand, MinorVer: minorVersion };
                boxRegion.description = `File Type: ${majorBrand}`;
            }

            // Recurse for containers
            if (BOX_CONTAINERS.has(type)) {
                 let contentOffset = offset + headerSize;
                 
                 // Special handling for 'meta' box: In ISOBMFF/HEIF it is usually a FullBox (Ver+Flags)
                 if (type === 'meta') {
                     // Check for FullBox version/flags (4 bytes)
                     contentOffset += 4;
                     boxRegion.children?.push({ name: 'Ver/Flags', offset: offset + headerSize, size: 4, type: RegionType.FIELD, color: palette.FIELD, value: formatHex(view.getUint32(offset + headerSize, false)) });
                 }
                 
                 const children = parseBoxes(contentOffset, effectiveEnd, type);
                 if (children.length > 0) {
                     boxRegion.children = [...(boxRegion.children || []), ...children];
                 }
            } else {
                // For mdat or leaf atoms, mark data
                 if (effectiveEnd > offset + headerSize) {
                     // Don't add huge children arrays for mdat, just mark it
                     if (type !== 'mdat') {
                        boxRegion.children?.push({
                            name: 'Data',
                            offset: offset + headerSize,
                            size: effectiveEnd - (offset + headerSize),
                            type: RegionType.IMAGE_DATA,
                            color: palette.IMAGE_DATA
                        });
                     }
                 }
            }

            boxes.push(boxRegion);
            offset += boxSize;
        }
        return boxes;
    };
    
    regions.push(...parseBoxes(0, view.byteLength));

    return {
        name: fileName,
        size: buffer.byteLength,
        data: view,
        regions,
        sectionsMetadata: [],
        isValid: true,
        format: 'HEIC'
    };
};