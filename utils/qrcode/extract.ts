import {BitMatrix} from './bitmatrix'
import type {LocatedSymbol, Point} from './locate'

/**
 * A 3x3 homogeneous transform, stored column-wise as in the classic
 * "Fundamentals of Texture Mapping and Image Warping" formulation:
 *
 *   x' = (a11*x + a21*y + a31) / (a13*x + a23*y + a33)
 *   y' = (a12*x + a22*y + a32) / (a13*x + a23*y + a33)
 */
class PerspectiveTransform {
    constructor(
        private readonly a11: number,
        private readonly a21: number,
        private readonly a31: number,
        private readonly a12: number,
        private readonly a22: number,
        private readonly a32: number,
        private readonly a13: number,
        private readonly a23: number,
        private readonly a33: number
    ) {}

    transform(x: number, y: number): Point {
        const denominator = this.a13 * x + this.a23 * y + this.a33
        return {
            x: (this.a11 * x + this.a21 * y + this.a31) / denominator,
            y: (this.a12 * x + this.a22 * y + this.a32) / denominator
        }
    }

    times(other: PerspectiveTransform): PerspectiveTransform {
        return new PerspectiveTransform(
            this.a11 * other.a11 + this.a21 * other.a12 + this.a31 * other.a13,
            this.a11 * other.a21 + this.a21 * other.a22 + this.a31 * other.a23,
            this.a11 * other.a31 + this.a21 * other.a32 + this.a31 * other.a33,
            this.a12 * other.a11 + this.a22 * other.a12 + this.a32 * other.a13,
            this.a12 * other.a21 + this.a22 * other.a22 + this.a32 * other.a23,
            this.a12 * other.a31 + this.a22 * other.a32 + this.a32 * other.a33,
            this.a13 * other.a11 + this.a23 * other.a12 + this.a33 * other.a13,
            this.a13 * other.a21 + this.a23 * other.a22 + this.a33 * other.a23,
            this.a13 * other.a31 + this.a23 * other.a32 + this.a33 * other.a33
        )
    }

    /** Inverse up to scale — enough, since the result is used projectively. */
    adjoint(): PerspectiveTransform {
        return new PerspectiveTransform(
            this.a22 * this.a33 - this.a23 * this.a32,
            this.a23 * this.a31 - this.a21 * this.a33,
            this.a21 * this.a32 - this.a22 * this.a31,
            this.a13 * this.a32 - this.a12 * this.a33,
            this.a11 * this.a33 - this.a13 * this.a31,
            this.a12 * this.a31 - this.a11 * this.a32,
            this.a12 * this.a23 - this.a13 * this.a22,
            this.a13 * this.a21 - this.a11 * this.a23,
            this.a11 * this.a22 - this.a12 * this.a21
        )
    }
}

/** Unit square corners (0,0), (1,0), (1,1), (0,1) map to p0..p3. */
function squareToQuad(
    x0: number, y0: number,
    x1: number, y1: number,
    x2: number, y2: number,
    x3: number, y3: number
): PerspectiveTransform {
    const dx3 = x0 - x1 + x2 - x3
    const dy3 = y0 - y1 + y2 - y3
    if (dx3 === 0 && dy3 === 0) {
        // The quad is a parallelogram, so the mapping is affine.
        return new PerspectiveTransform(x1 - x0, x2 - x1, x0, y1 - y0, y2 - y1, y0, 0, 0, 1)
    }
    const dx1 = x1 - x2
    const dx2 = x3 - x2
    const dy1 = y1 - y2
    const dy2 = y3 - y2
    const denominator = dx1 * dy2 - dx2 * dy1
    const a13 = (dx3 * dy2 - dx2 * dy3) / denominator
    const a23 = (dx1 * dy3 - dx3 * dy1) / denominator
    return new PerspectiveTransform(
        x1 - x0 + a13 * x1,
        x3 - x0 + a23 * x3,
        x0,
        y1 - y0 + a13 * y1,
        y3 - y0 + a23 * y3,
        y0,
        a13,
        a23,
        1
    )
}

function quadToQuad(
    src: readonly number[],
    dst: readonly number[]
): PerspectiveTransform {
    const toSquare = squareToQuad(src[0], src[1], src[2], src[3], src[4], src[5], src[6], src[7]).adjoint()
    const fromSquare = squareToQuad(dst[0], dst[1], dst[2], dst[3], dst[4], dst[5], dst[6], dst[7])
    return fromSquare.times(toSquare)
}

/**
 * Sample the binarized image on the symbol's module grid, producing a
 * `dimension x dimension` BitMatrix of modules.
 *
 * Finder centres are 3.5 modules from each edge. When an alignment pattern was
 * found its centre is used as the fourth reference point (3 modules further in
 * from the bottom-right corner, hence dimension-6.5); otherwise the fourth
 * corner is extrapolated as a parallelogram, which is only safe for a roughly
 * flat image.
 */
export function extract(image: BitMatrix, located: LocatedSymbol): BitMatrix | null {
    const {topLeft, topRight, bottomLeft, alignment, dimension} = located

    let bottomRight: Point
    let srcBottomRight: number
    if (alignment !== null) {
        bottomRight = alignment
        srcBottomRight = dimension - 6.5
    } else {
        bottomRight = {
            x: topRight.x - topLeft.x + bottomLeft.x,
            y: topRight.y - topLeft.y + bottomLeft.y
        }
        srcBottomRight = dimension - 3.5
    }

    const transform = quadToQuad(
        [3.5, 3.5, dimension - 3.5, 3.5, srcBottomRight, srcBottomRight, 3.5, dimension - 3.5],
        [topLeft.x, topLeft.y, topRight.x, topRight.y, bottomRight.x, bottomRight.y, bottomLeft.x, bottomLeft.y]
    )

    const out = BitMatrix.createEmpty(dimension, dimension)
    for (let y = 0; y < dimension; y++) {
        for (let x = 0; x < dimension; x++) {
            const p = transform.transform(x + 0.5, y + 0.5)
            if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null
            const px = Math.round(p.x)
            const py = Math.round(p.y)
            if (px < 0 || px >= image.width || py < 0 || py >= image.height) return null
            out.set(x, y, image.get(px, py))
        }
    }

    return out
}
