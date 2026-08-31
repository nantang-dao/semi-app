import {binarize} from './binarize'
import {decodeMatrix} from './decode'
import type {DecodedSymbol} from './decode'
import {extract} from './extract'
import {locate} from './locate'

export {BitMatrix} from './bitmatrix'
export {binarize} from './binarize'
export {decodeMatrix} from './decode'
export {extract} from './extract'
export {locate} from './locate'
export type {DecodedSymbol, ErrorCorrectionLevel} from './decode'
export type {FinderPattern, LocatedSymbol, Point} from './locate'

/**
 * Decode a QR code from an ImageData-like RGBA buffer.
 *
 * Returns the decoded text, or null if no readable symbol was found. The image
 * is tried as-is first and then inverted, so light-on-dark codes work too.
 */
export function decodeQR(data: Uint8ClampedArray, width: number, height: number): string | null {
    return decodeQRDetailed(data, width, height)?.text ?? null
}

/** As `decodeQR`, but also reports the symbol's version, EC level and mask. */
export function decodeQRDetailed(
    data: Uint8ClampedArray,
    width: number,
    height: number
): DecodedSymbol | null {
    for (const invert of [false, true]) {
        const image = binarize(data, width, height, invert)
        if (image === null) continue
        const located = locate(image)
        if (located === null) continue
        const matrix = extract(image, located)
        if (matrix === null) continue
        const decoded = decodeMatrix(matrix)
        if (decoded !== null) return decoded
    }
    return null
}
