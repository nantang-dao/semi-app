/**
 * ISO/IEC 18004 structural tables and helpers shared by the decoder and the
 * encoder: capacity tables, block structure, function-pattern geometry, the
 * eight data masks, and the BCH-protected format/version information words.
 *
 * Everything here is symbol *structure* — nothing in this file knows about
 * pixels, bitstreams or text.
 */

import {BitMatrix} from './bitmatrix'

export type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H'

/** Index into the four-wide per-version tables below. */
export const EC_LEVEL_ORDER: ErrorCorrectionLevel[] = ['L', 'M', 'Q', 'H']

/** Total codewords (data + EC) per version, index 1..40. ISO/IEC 18004 table 1. */
export const TOTAL_CODEWORDS = [
    0,
    26, 44, 70, 100, 134, 172, 196, 242, 292, 346,
    404, 466, 532, 581, 655, 733, 815, 901, 991, 1085,
    1156, 1258, 1364, 1474, 1588, 1706, 1828, 1921, 2051, 2185,
    2323, 2465, 2611, 2761, 2876, 3034, 3196, 3362, 3532, 3706
]

/** Number of EC blocks, four entries (L, M, Q, H) per version. */
export const EC_BLOCKS = [
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 1, 2, 2, 4,
    1, 2, 4, 4, 2, 4, 4, 4, 2, 4, 6, 5, 2, 4, 6, 6,
    2, 5, 8, 8, 4, 5, 8, 8, 4, 5, 8, 11, 4, 8, 10, 11,
    4, 9, 12, 16, 4, 9, 16, 16, 6, 10, 12, 18, 6, 10, 17, 16,
    6, 11, 16, 19, 6, 13, 18, 21, 7, 14, 21, 25, 8, 16, 20, 25,
    8, 17, 23, 25, 9, 17, 23, 34, 9, 18, 25, 30, 10, 20, 27, 32,
    12, 21, 29, 35, 12, 23, 34, 37, 12, 25, 34, 40, 13, 26, 35, 42,
    14, 28, 38, 45, 15, 29, 40, 48, 16, 31, 43, 51, 17, 33, 45, 54,
    18, 35, 48, 57, 19, 37, 51, 60, 19, 38, 53, 63, 20, 40, 56, 66,
    21, 43, 59, 70, 22, 45, 62, 74, 24, 47, 65, 77, 25, 49, 68, 81
]

/** Total EC codewords, four entries (L, M, Q, H) per version. */
export const EC_CODEWORDS = [
    7, 10, 13, 17, 10, 16, 22, 28, 15, 26, 36, 44, 20, 36, 52, 64,
    26, 48, 72, 88, 36, 64, 96, 112, 40, 72, 108, 130, 48, 88, 132, 156,
    60, 110, 160, 192, 72, 130, 192, 224, 80, 150, 224, 264, 96, 176, 260, 308,
    104, 198, 288, 352, 120, 216, 320, 384, 132, 240, 360, 432, 144, 280, 408, 480,
    168, 308, 448, 532, 180, 338, 504, 588, 196, 364, 546, 650, 224, 416, 600, 700,
    224, 442, 644, 750, 252, 476, 690, 816, 270, 504, 750, 900, 300, 560, 810, 960,
    312, 588, 870, 1050, 336, 644, 952, 1110, 360, 700, 1020, 1200, 390, 728, 1050, 1260,
    420, 784, 1140, 1350, 450, 812, 1200, 1440, 480, 868, 1290, 1530, 510, 924, 1350, 1620,
    540, 980, 1440, 1710, 570, 1036, 1530, 1800, 570, 1064, 1590, 1890, 600, 1120, 1680, 1980,
    630, 1204, 1770, 2100, 660, 1260, 1860, 2220, 720, 1316, 1950, 2310, 750, 1372, 2040, 2430
]

/** Module count along one edge of a version's symbol. */
export function symbolSize(version: number): number {
    return version * 4 + 17
}

function tableOffset(version: number, level: ErrorCorrectionLevel): number {
    return (version - 1) * 4 + EC_LEVEL_ORDER.indexOf(level)
}

/** Total EC codewords for a version and level. */
export function ecCodewordCount(version: number, level: ErrorCorrectionLevel): number {
    return EC_CODEWORDS[tableOffset(version, level)]
}

/** Number of EC blocks for a version and level. */
export function ecBlockCount(version: number, level: ErrorCorrectionLevel): number {
    return EC_BLOCKS[tableOffset(version, level)]
}

/** Data codewords available for a version and level. */
export function dataCodewordCount(version: number, level: ErrorCorrectionLevel): number {
    return TOTAL_CODEWORDS[version] - ecCodewordCount(version, level)
}

export interface BlockSpec {
    dataCodewords: number
    ecCodewords: number
}

/**
 * The spec tabulates only the block count and the total EC codewords; the
 * per-block split follows from them. Data codewords divide as evenly as
 * possible, with the remainder going to the trailing (longer) blocks.
 */
export function getBlockSpecs(version: number, level: ErrorCorrectionLevel): BlockSpec[] | null {
    if (version < 1 || version > 40 || EC_LEVEL_ORDER.indexOf(level) < 0) return null

    const total = TOTAL_CODEWORDS[version]
    const ecTotal = ecCodewordCount(version, level)
    const blockCount = ecBlockCount(version, level)
    const dataTotal = total - ecTotal
    const ecPerBlock = ecTotal / blockCount
    if (!Number.isInteger(ecPerBlock)) return null

    const shortLength = Math.floor(dataTotal / blockCount)
    const longBlocks = dataTotal % blockCount

    const specs: BlockSpec[] = []
    for (let i = 0; i < blockCount; i++) {
        specs.push({
            dataCodewords: i < blockCount - longBlocks ? shortLength : shortLength + 1,
            ecCodewords: ecPerBlock
        })
    }
    return specs
}

/** Alignment pattern centre coordinates for a version (empty for version 1). */
export function alignmentPatternPositions(version: number): number[] {
    if (version === 1) return []
    const posCount = Math.floor(version / 7) + 2
    const size = symbolSize(version)
    const intervals = size === 145 ? 26 : Math.ceil((size - 13) / (2 * posCount - 2)) * 2
    const positions = [size - 7]
    for (let i = 1; i < posCount - 1; i++) {
        positions.push(positions[i - 1] - intervals)
    }
    positions.push(6)
    return positions.reverse()
}

/** Alignment pattern centres, minus the three taken by finder patterns. */
export function alignmentCoordinates(version: number): Array<[number, number]> {
    const positions = alignmentPatternPositions(version)
    const coords: Array<[number, number]> = []
    for (let i = 0; i < positions.length; i++) {
        for (let j = 0; j < positions.length; j++) {
            // The three corners are taken by finder patterns.
            if ((i === 0 && j === 0) || (i === 0 && j === positions.length - 1) || (i === positions.length - 1 && j === 0)) {
                continue
            }
            coords.push([positions[i], positions[j]])
        }
    }
    return coords
}

/**
 * Modules occupied by function patterns, which carry no codeword bits. This is
 * also exactly the set of modules the data mask must leave alone.
 */
export function buildFunctionPatternMask(version: number): BitMatrix {
    const size = symbolSize(version)
    const mask = BitMatrix.createEmpty(size, size)

    // Finder patterns, separators and the format information areas.
    mask.setRegion(0, 0, 9, 9, true)
    mask.setRegion(size - 8, 0, 8, 9, true)
    mask.setRegion(0, size - 8, 9, 8, true)

    for (const [ax, ay] of alignmentCoordinates(version)) {
        mask.setRegion(ax - 2, ay - 2, 5, 5, true)
    }

    // Timing patterns.
    mask.setRegion(6, 9, 1, size - 17, true)
    mask.setRegion(9, 6, size - 17, 1, true)

    if (version > 6) {
        // Version information blocks, 6x3 and 3x6.
        mask.setRegion(size - 11, 0, 3, 6, true)
        mask.setRegion(0, size - 11, 6, 3, true)
    }

    return mask
}

/** The eight data mask conditions; `true` means the module is inverted. */
export const MASK_FUNCTIONS: Array<(row: number, column: number) => boolean> = [
    (i, j) => (i + j) % 2 === 0,
    (i) => i % 2 === 0,
    (_i, j) => j % 3 === 0,
    (i, j) => (i + j) % 3 === 0,
    (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0,
    (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
    (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0,
    (i, j) => (((i + j) % 2) + ((i * j) % 3)) % 2 === 0
]

/**
 * Format information: 5 data bits (2 EC level + 3 mask) expanded to 15 by a
 * BCH(15,5) code with generator 0x537, then XORed with 0x5412 so an all-zero
 * format is impossible. All 32 words are precomputed: the encoder indexes the
 * table, the decoder scans it for the nearest by Hamming distance.
 */
export const FORMAT_INFO_MASK = 0x5412

export const VALID_FORMAT_WORDS: number[] = (() => {
    const words: number[] = []
    for (let data = 0; data < 32; data++) {
        let bch = data << 10
        for (let i = 4; i >= 0; i--) {
            if (bch & (1 << (i + 10))) bch ^= 0x537 << i
        }
        words.push(((data << 10) | bch) ^ FORMAT_INFO_MASK)
    }
    return words
})()

/** Version information: BCH(18,6) with generator 0x1f25, no XOR mask. */
export const VALID_VERSION_WORDS: number[] = (() => {
    const words: number[] = []
    for (let version = 7; version <= 40; version++) {
        let bch = version << 12
        for (let i = 5; i >= 0; i--) {
            if (bch & (1 << (i + 12))) bch ^= 0x1f25 << i
        }
        words.push((version << 12) | bch)
    }
    return words
})()

/** EC level as it appears in the format information: L=01, M=00, Q=11, H=10. */
export const FORMAT_LEVEL_BITS: Record<ErrorCorrectionLevel, number> = {L: 1, M: 0, Q: 3, H: 2}

export function levelFromFormatBits(bits: number): ErrorCorrectionLevel {
    return bits === 1 ? 'L' : bits === 0 ? 'M' : bits === 3 ? 'Q' : 'H'
}

/** The 15-bit format word for a level and mask. */
export function formatInfoBits(level: ErrorCorrectionLevel, mask: number): number {
    return VALID_FORMAT_WORDS[(FORMAT_LEVEL_BITS[level] << 3) | mask]
}

/** The 18-bit version word, defined only for versions 7 and up. */
export function versionInfoBits(version: number): number {
    return VALID_VERSION_WORDS[version - 7]
}

export function hammingDistance(a: number, b: number): number {
    let x = a ^ b
    let count = 0
    while (x !== 0) {
        count += x & 1
        x >>>= 1
    }
    return count
}

/** Mode indicators. Kanji (8) is recognised by the decoder but never emitted. */
export const MODE_NUMERIC = 1
export const MODE_ALPHANUMERIC = 2
export const MODE_BYTE = 4

export const ALPHANUMERIC_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:'

/** Character-count field widths by mode, for the three version groups. */
export function characterCountBits(mode: number, version: number): number {
    const group = version <= 9 ? 0 : version <= 26 ? 1 : 2
    switch (mode) {
        case MODE_NUMERIC:
            return [10, 12, 14][group]
        case MODE_ALPHANUMERIC:
            return [9, 11, 13][group]
        case MODE_BYTE:
            return [8, 16, 16][group]
        case 8:
            return [8, 10, 12][group]
        default:
            return 0
    }
}
