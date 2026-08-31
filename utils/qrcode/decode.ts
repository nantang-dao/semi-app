import {BitMatrix} from './bitmatrix'
import {rsDecode} from './reedsolomon'
import {
    ALPHANUMERIC_CHARS,
    buildFunctionPatternMask,
    characterCountBits,
    getBlockSpecs,
    hammingDistance,
    levelFromFormatBits,
    MASK_FUNCTIONS,
    VALID_FORMAT_WORDS,
    VALID_VERSION_WORDS
} from './spec'
import type {BlockSpec, ErrorCorrectionLevel} from './spec'

export type {ErrorCorrectionLevel} from './spec'

export interface DecodedSymbol {
    text: string
    version: number
    errorCorrectionLevel: ErrorCorrectionLevel
    mask: number
}

interface FormatInformation {
    level: ErrorCorrectionLevel
    mask: number
}

function decodeFormatWord(raw: number): FormatInformation | null {
    let bestDistance = Infinity
    let bestData = -1
    for (let data = 0; data < 32; data++) {
        const distance = hammingDistance(raw, VALID_FORMAT_WORDS[data])
        if (distance < bestDistance) {
            bestDistance = distance
            bestData = data
        }
    }
    if (bestDistance > 3 || bestData < 0) return null

    // EC level bits: 01 = L, 00 = M, 11 = Q, 10 = H.
    return {level: levelFromFormatBits((bestData >> 3) & 0x03), mask: bestData & 0x07}
}

function readFormatInformation(matrix: BitMatrix): FormatInformation | null {
    const size = matrix.width

    // Copy 1 wraps the top-left finder, MSB first, skipping the timing row/column.
    let word1 = 0
    for (let x = 0; x <= 5; x++) word1 = (word1 << 1) | (matrix.get(x, 8) ? 1 : 0)
    word1 = (word1 << 1) | (matrix.get(7, 8) ? 1 : 0)
    word1 = (word1 << 1) | (matrix.get(8, 8) ? 1 : 0)
    word1 = (word1 << 1) | (matrix.get(8, 7) ? 1 : 0)
    for (let y = 5; y >= 0; y--) word1 = (word1 << 1) | (matrix.get(8, y) ? 1 : 0)

    const format1 = decodeFormatWord(word1)
    if (format1 !== null) return format1

    // Copy 2 is split: below the top-right finder, then right of the bottom-left.
    let word2 = 0
    for (let y = size - 1; y >= size - 7; y--) word2 = (word2 << 1) | (matrix.get(8, y) ? 1 : 0)
    for (let x = size - 8; x < size; x++) word2 = (word2 << 1) | (matrix.get(x, 8) ? 1 : 0)

    return decodeFormatWord(word2)
}

function readVersionInformation(matrix: BitMatrix): number | null {
    const size = matrix.width
    if (size < 45) return null // versions below 7 carry no version block

    // Top-right block, 3 columns wide by 6 rows tall; bit 17 first.
    let word1 = 0
    for (let y = 5; y >= 0; y--) {
        for (let x = size - 9; x >= size - 11; x--) {
            word1 = (word1 << 1) | (matrix.get(x, y) ? 1 : 0)
        }
    }
    // Bottom-left block: the transpose of the same layout.
    let word2 = 0
    for (let x = 5; x >= 0; x--) {
        for (let y = size - 9; y >= size - 11; y--) {
            word2 = (word2 << 1) | (matrix.get(x, y) ? 1 : 0)
        }
    }

    for (const word of [word1, word2]) {
        let bestDistance = Infinity
        let bestVersion = -1
        for (let i = 0; i < VALID_VERSION_WORDS.length; i++) {
            const distance = hammingDistance(word, VALID_VERSION_WORDS[i])
            if (distance < bestDistance) {
                bestDistance = distance
                bestVersion = i + 7
            }
        }
        if (bestDistance <= 3) return bestVersion
    }
    return null
}

/**
 * Read codewords in the standard order: two-module-wide columns walked from the
 * right edge leftwards, alternating upwards and downwards, right module of the
 * pair before the left, skipping function patterns. Column 6 is the vertical
 * timing pattern and is not part of any pair.
 */
function readCodewords(matrix: BitMatrix, version: number, mask: number): number[] {
    const size = matrix.width
    const functionPattern = buildFunctionPatternMask(version)
    const maskFn = MASK_FUNCTIONS[mask]

    const codewords: number[] = []
    let currentByte = 0
    let bitsRead = 0
    let readingUp = true

    for (let x = size - 1; x > 0; x -= 2) {
        if (x === 6) x--
        for (let i = 0; i < size; i++) {
            const y = readingUp ? size - 1 - i : i
            for (let dx = 0; dx < 2; dx++) {
                const xx = x - dx
                if (functionPattern.get(xx, y)) continue
                let bit = matrix.get(xx, y)
                if (maskFn(y, xx)) bit = !bit
                currentByte = (currentByte << 1) | (bit ? 1 : 0)
                bitsRead++
                if (bitsRead === 8) {
                    codewords.push(currentByte)
                    currentByte = 0
                    bitsRead = 0
                }
            }
        }
        readingUp = !readingUp
    }

    return codewords
}

/**
 * Undo the interleaving: data codewords are transmitted one per block in
 * round-robin order (short blocks dropping out once exhausted), then all EC
 * codewords in the same round-robin order.
 */
function deinterleave(codewords: number[], specs: BlockSpec[]): Array<{data: number[]; ec: number[]}> | null {
    const totalExpected = specs.reduce((sum, s) => sum + s.dataCodewords + s.ecCodewords, 0)
    if (codewords.length < totalExpected) return null

    const blocks = specs.map(() => ({data: [] as number[], ec: [] as number[]}))
    const maxData = Math.max(...specs.map((s) => s.dataCodewords))
    const maxEc = Math.max(...specs.map((s) => s.ecCodewords))

    let index = 0
    for (let i = 0; i < maxData; i++) {
        for (let b = 0; b < specs.length; b++) {
            if (i < specs[b].dataCodewords) blocks[b].data.push(codewords[index++])
        }
    }
    for (let i = 0; i < maxEc; i++) {
        for (let b = 0; b < specs.length; b++) {
            if (i < specs[b].ecCodewords) blocks[b].ec.push(codewords[index++])
        }
    }

    return blocks
}

class BitReader {
    private bitIndex = 0

    constructor(private readonly bytes: number[]) {}

    get available(): number {
        return this.bytes.length * 8 - this.bitIndex
    }

    read(count: number): number {
        if (count > this.available) throw new RangeError('QR bitstream exhausted')
        let value = 0
        for (let i = 0; i < count; i++) {
            const byte = this.bytes[this.bitIndex >> 3]
            const bit = (byte >> (7 - (this.bitIndex & 7))) & 1
            value = (value << 1) | bit
            this.bitIndex++
        }
        return value
    }
}

/** Strict UTF-8 decode; returns null on any malformed sequence. */
function decodeUtf8(bytes: number[]): string | null {
    let out = ''
    let i = 0
    while (i < bytes.length) {
        const b0 = bytes[i]
        let codePoint: number
        let extra: number
        if (b0 < 0x80) {
            codePoint = b0
            extra = 0
        } else if ((b0 & 0xe0) === 0xc0) {
            codePoint = b0 & 0x1f
            extra = 1
        } else if ((b0 & 0xf0) === 0xe0) {
            codePoint = b0 & 0x0f
            extra = 2
        } else if ((b0 & 0xf8) === 0xf0) {
            codePoint = b0 & 0x07
            extra = 3
        } else {
            return null
        }
        if (i + extra >= bytes.length) return null
        for (let k = 1; k <= extra; k++) {
            const b = bytes[i + k]
            if ((b & 0xc0) !== 0x80) return null
            codePoint = (codePoint << 6) | (b & 0x3f)
        }
        // Reject overlong forms, surrogates and out-of-range code points.
        if (extra === 1 && codePoint < 0x80) return null
        if (extra === 2 && codePoint < 0x800) return null
        if (extra === 3 && codePoint < 0x10000) return null
        if (codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) return null
        out += String.fromCodePoint(codePoint)
        i += extra + 1
    }
    return out
}

function decodeLatin1(bytes: number[]): string {
    let out = ''
    for (const b of bytes) out += String.fromCharCode(b)
    return out
}

/**
 * Parse the data bitstream into text. ECI designators are read (so the bit
 * offsets stay correct) and used only to choose between UTF-8 and Latin-1.
 * Kanji mode is not supported and aborts the decode rather than crashing.
 */
function parseBitstream(bytes: number[], version: number): string | null {
    const reader = new BitReader(bytes)
    let result = ''
    let latin1 = false

    try {
        while (reader.available >= 4) {
            const mode = reader.read(4)
            if (mode === 0) break // terminator

            if (mode === 7) {
                // ECI: 1, 2 or 3 bytes, flagged by the leading bits.
                const first = reader.read(8)
                let assignment: number
                if ((first & 0x80) === 0) {
                    assignment = first & 0x7f
                } else if ((first & 0xc0) === 0x80) {
                    assignment = ((first & 0x3f) << 8) | reader.read(8)
                } else if ((first & 0xe0) === 0xc0) {
                    assignment = ((first & 0x1f) << 16) | reader.read(16)
                } else {
                    return null
                }
                // 1..2 and 4..24 are single-byte charsets; 26 is UTF-8.
                latin1 = assignment !== 26 && assignment <= 24
                continue
            }

            if (mode === 5 || mode === 9) continue // FNC1, no payload of its own
            if (mode === 3) {
                reader.read(16) // structured append header
                continue
            }
            if (mode === 8) return null // Kanji: unsupported, bail out cleanly

            const countBits = characterCountBits(mode, version)
            if (countBits === 0) return null
            const count = reader.read(countBits)

            if (mode === 1) {
                let remaining = count
                while (remaining >= 3) {
                    const triple = reader.read(10)
                    if (triple > 999) return null
                    result += String(triple).padStart(3, '0')
                    remaining -= 3
                }
                if (remaining === 2) {
                    const pair = reader.read(7)
                    if (pair > 99) return null
                    result += String(pair).padStart(2, '0')
                } else if (remaining === 1) {
                    const single = reader.read(4)
                    if (single > 9) return null
                    result += String(single)
                }
            } else if (mode === 2) {
                let remaining = count
                while (remaining >= 2) {
                    const pair = reader.read(11)
                    if (pair >= 45 * 45) return null
                    result += ALPHANUMERIC_CHARS[Math.floor(pair / 45)] + ALPHANUMERIC_CHARS[pair % 45]
                    remaining -= 2
                }
                if (remaining === 1) {
                    const single = reader.read(6)
                    if (single >= 45) return null
                    result += ALPHANUMERIC_CHARS[single]
                }
            } else if (mode === 4) {
                const chunk: number[] = []
                for (let i = 0; i < count; i++) chunk.push(reader.read(8))
                const text = latin1 ? null : decodeUtf8(chunk)
                result += text ?? decodeLatin1(chunk)
            } else {
                return null
            }
        }
    } catch {
        // A truncated stream means we mis-read the symbol somewhere.
        return null
    }

    return result
}

/**
 * Decode an already-extracted module grid.
 */
export function decodeMatrix(matrix: BitMatrix): DecodedSymbol | null {
    const size = matrix.width
    if (size !== matrix.height) return null
    if (size < 21 || size > 177 || (size - 17) % 4 !== 0) return null

    let version = (size - 17) / 4
    if (version >= 7) {
        const declared = readVersionInformation(matrix)
        // Geometry is authoritative — only trust the version block if it agrees.
        if (declared !== null && declared * 4 + 17 === size) version = declared
    }

    const format = readFormatInformation(matrix)
    if (format === null) return null

    const specs = getBlockSpecs(version, format.level)
    if (specs === null) return null

    const codewords = readCodewords(matrix, version, format.mask)
    const blocks = deinterleave(codewords, specs)
    if (blocks === null) return null

    const data: number[] = []
    for (const block of blocks) {
        const corrected = rsDecode(block.data.concat(block.ec), block.ec.length)
        if (corrected === null) return null
        for (let i = 0; i < block.data.length; i++) data.push(corrected[i])
    }

    const text = parseBitstream(data, version)
    if (text === null) return null

    return {text, version, errorCorrectionLevel: format.level, mask: format.mask}
}
