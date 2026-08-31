import {BitMatrix} from './bitmatrix'

/** Side of a block, in pixels, for the local threshold estimate. */
const REGION_SIZE = 8
/** Below this luminance spread a block is assumed to be all one colour. */
const MIN_DYNAMIC_RANGE = 24

/**
 * Grayscale + block-based local adaptive threshold.
 *
 * The image is divided into 8x8 blocks; each block gets a black point (its mean
 * luminance). A block whose dynamic range is too small holds no edge, so its
 * black point is inferred from already-computed neighbours instead — otherwise a
 * uniformly white block would threshold its own noise into modules. Each pixel
 * is finally compared against the average black point of the 5x5 block
 * neighbourhood, which smooths the transition across block borders.
 */
export function binarize(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    invert = false
): BitMatrix | null {
    if (data.length !== width * height * 4) return null
    if (width < 21 || height < 21) return null

    const grey = new Uint8ClampedArray(width * height)
    for (let i = 0; i < width * height; i++) {
        const r = data[i * 4]
        const g = data[i * 4 + 1]
        const b = data[i * 4 + 2]
        // Rec. 709 luma; good enough and matches what most decoders assume.
        grey[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b
    }

    // Number of whole-ish blocks; the last block is stretched to cover the edge.
    const blocksWide = Math.max(1, Math.ceil(width / REGION_SIZE))
    const blocksHigh = Math.max(1, Math.ceil(height / REGION_SIZE))
    const blackPoints = new Float64Array(blocksWide * blocksHigh)

    for (let by = 0; by < blocksHigh; by++) {
        for (let bx = 0; bx < blocksWide; bx++) {
            // Clamp so the trailing partial block still reads REGION_SIZE pixels.
            const x0 = Math.min(bx * REGION_SIZE, width - REGION_SIZE < 0 ? 0 : width - REGION_SIZE)
            const y0 = Math.min(by * REGION_SIZE, height - REGION_SIZE < 0 ? 0 : height - REGION_SIZE)
            const x1 = Math.min(x0 + REGION_SIZE, width)
            const y1 = Math.min(y0 + REGION_SIZE, height)

            let min = Infinity
            let max = 0
            let sum = 0
            let count = 0
            for (let y = y0; y < y1; y++) {
                for (let x = x0; x < x1; x++) {
                    const px = grey[y * width + x]
                    sum += px
                    count++
                    if (px < min) min = px
                    if (px > max) max = px
                }
            }

            let average = sum / count
            if (max - min <= MIN_DYNAMIC_RANGE) {
                // Assume the block is entirely light; bias the threshold low so
                // nothing in it is called dark.
                average = min / 2
                if (by > 0 && bx > 0) {
                    const neighbourAverage =
                        (blackPoints[(by - 1) * blocksWide + bx] +
                            2 * blackPoints[by * blocksWide + bx - 1] +
                            blackPoints[(by - 1) * blocksWide + bx - 1]) /
                        4
                    if (min < neighbourAverage) average = neighbourAverage
                }
            }
            blackPoints[by * blocksWide + bx] = average
        }
    }

    const matrix = BitMatrix.createEmpty(width, height)
    for (let by = 0; by < blocksHigh; by++) {
        for (let bx = 0; bx < blocksWide; bx++) {
            let sum = 0
            for (let dy = -2; dy <= 2; dy++) {
                const ny = clamp(by + dy, 0, blocksHigh - 1)
                for (let dx = -2; dx <= 2; dx++) {
                    const nx = clamp(bx + dx, 0, blocksWide - 1)
                    sum += blackPoints[ny * blocksWide + nx]
                }
            }
            const threshold = sum / 25

            const x0 = bx * REGION_SIZE
            const y0 = by * REGION_SIZE
            const x1 = Math.min(x0 + REGION_SIZE, width)
            const y1 = Math.min(y0 + REGION_SIZE, height)
            for (let y = y0; y < y1; y++) {
                for (let x = x0; x < x1; x++) {
                    const dark = grey[y * width + x] <= threshold
                    matrix.set(x, y, invert ? !dark : dark)
                }
            }
        }
    }

    return matrix
}

function clamp(value: number, low: number, high: number): number {
    if (high < low) return low
    return Math.max(low, Math.min(high, value))
}
