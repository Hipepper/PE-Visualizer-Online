
import { ParsedFile, SearchResult } from '../types';
import { offsetToRva } from './peParser';

export type SearchMode = 'hex' | 'ascii' | 'unicode';

export const searchPE = (
    file: ParsedFile,
    query: string,
    mode: SearchMode,
    useRegex: boolean
): SearchResult[] => {
    const results: SearchResult[] = [];
    const { data, sectionsMetadata } = file;
    const buffer = new Uint8Array(data.buffer);
    const len = buffer.length;

    if (!query) return [];

    try {
        if (mode === 'hex') {
            // 1. Hex Search
            // Clean query: remove spaces, 0x prefix
            const cleanQuery = query.replace(/\s+/g, '').replace(/0x/gi, '');
            if (cleanQuery.length % 2 !== 0 || !/^[0-9A-Fa-f]+$/.test(cleanQuery)) {
                throw new Error("Invalid Hex String");
            }
            
            const searchBytes: number[] = [];
            for (let i = 0; i < cleanQuery.length; i += 2) {
                searchBytes.push(parseInt(cleanQuery.substr(i, 2), 16));
            }

            const sLen = searchBytes.length;
            // Naive byte search
            for (let i = 0; i <= len - sLen; i++) {
                let match = true;
                for (let j = 0; j < sLen; j++) {
                    if (buffer[i + j] !== searchBytes[j]) {
                        match = false;
                        break;
                    }
                }
                if (match) {
                    results.push({
                        offset: i,
                        size: sLen,
                        rva: offsetToRva(i, sectionsMetadata),
                        matchVal: cleanQuery
                    });
                    // Limit results
                    if(results.length >= 2000) break;
                }
            }

        } else if (mode === 'ascii') {
            // 2. ASCII Search
            if (useRegex) {
                // Convert entire buffer to Latin1 string to preserve 1-byte mapping
                // Note: Large files might OOM. Catch error.
                if(len > 50 * 1024 * 1024) {
                    throw new Error("File too large for Regex search (max 50MB)");
                }
                
                const textDecoder = new TextDecoder('latin1');
                const str = textDecoder.decode(buffer);
                const regex = new RegExp(query, 'g'); // user responsible for validity
                
                let match;
                while ((match = regex.exec(str)) !== null) {
                    results.push({
                        offset: match.index,
                        size: match[0].length,
                        rva: offsetToRva(match.index, sectionsMetadata),
                        matchVal: match[0]
                    });
                    if(results.length >= 2000) break;
                }

            } else {
                // Standard string search (byte match)
                const searchBytes: number[] = [];
                for(let i=0; i<query.length; i++) searchBytes.push(query.charCodeAt(i));
                
                const sLen = searchBytes.length;
                for (let i = 0; i <= len - sLen; i++) {
                    let match = true;
                    for (let j = 0; j < sLen; j++) {
                        if (buffer[i + j] !== searchBytes[j]) {
                            match = false;
                            break;
                        }
                    }
                    if (match) {
                        results.push({
                            offset: i,
                            size: sLen,
                            rva: offsetToRva(i, sectionsMetadata),
                            matchVal: query
                        });
                        if(results.length >= 2000) break;
                    }
                }
            }
        } else if (mode === 'unicode') {
            // 3. Unicode (UTF-16LE) Search
            // Regex on raw binary for unicode is hard. We will only support simple string match for Unicode for now.
            // If user really wants Regex, they usually mean on the decoded chars.
            
            if (useRegex) {
                 throw new Error("Regex not supported for Unicode (Raw) search in this version.");
            } else {
                const searchBytes: number[] = [];
                for(let i=0; i<query.length; i++) {
                    const code = query.charCodeAt(i);
                    searchBytes.push(code & 0xFF);
                    searchBytes.push((code >> 8) & 0xFF);
                }

                const sLen = searchBytes.length;
                for (let i = 0; i <= len - sLen; i++) {
                    let match = true;
                    for (let j = 0; j < sLen; j++) {
                        if (buffer[i + j] !== searchBytes[j]) {
                            match = false;
                            break;
                        }
                    }
                    if (match) {
                        results.push({
                            offset: i,
                            size: sLen,
                            rva: offsetToRva(i, sectionsMetadata),
                            matchVal: query
                        });
                        if(results.length >= 2000) break;
                    }
                }
            }
        }
    } catch (e: any) {
        console.error("Search Error", e);
        throw e;
    }

    return results;
};
