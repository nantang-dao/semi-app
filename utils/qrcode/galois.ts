/**
 * GF(256) arithmetic for QR codes: primitive polynomial x^8+x^4+x^3+x^2+1
 * (0x11D), generator element alpha = 2.
 *
 * Polynomials are plain number[] indexed by degree — `p[i]` is the coefficient
 * of x^i. Addition and subtraction are both XOR.
 */

const PRIMITIVE = 0x11d

/** EXP is doubled in length so `EXP[a + b]` needs no modulo. */
const EXP = new Uint8Array(512)
const LOG = new Uint8Array(256)

;(() => {
    let x = 1
    for (let i = 0; i < 255; i++) {
        EXP[i] = x
        LOG[x] = i
        x <<= 1
        if (x & 0x100) x ^= PRIMITIVE
    }
    for (let i = 255; i < 512; i++) {
        EXP[i] = EXP[i - 255]
    }
})()

export function gfMul(a: number, b: number): number {
    if (a === 0 || b === 0) return 0
    return EXP[LOG[a] + LOG[b]]
}

export function gfDiv(a: number, b: number): number {
    if (b === 0) throw new Error('GF(256) division by zero')
    if (a === 0) return 0
    return EXP[LOG[a] + 255 - LOG[b]]
}

export function gfInverse(a: number): number {
    if (a === 0) throw new Error('GF(256) inverse of zero')
    return EXP[255 - LOG[a]]
}

/** alpha^n, for any integer n >= 0. */
export function gfExp(n: number): number {
    return EXP[n % 255]
}

export function gfLog(a: number): number {
    return LOG[a]
}

export function polyAdd(a: number[], b: number[]): number[] {
    const out = new Array<number>(Math.max(a.length, b.length)).fill(0)
    for (let i = 0; i < a.length; i++) out[i] = a[i]
    for (let i = 0; i < b.length; i++) out[i] ^= b[i]
    return trimPoly(out)
}

export function polyMul(a: number[], b: number[]): number[] {
    if (a.length === 0 || b.length === 0) return []
    const out = new Array<number>(a.length + b.length - 1).fill(0)
    for (let i = 0; i < a.length; i++) {
        if (a[i] === 0) continue
        for (let j = 0; j < b.length; j++) {
            if (b[j] === 0) continue
            out[i + j] ^= gfMul(a[i], b[j])
        }
    }
    return trimPoly(out)
}

export function polyScale(a: number[], scalar: number): number[] {
    if (scalar === 0) return []
    return trimPoly(a.map((c) => gfMul(c, scalar)))
}

/** Multiply by x^shift. */
export function polyShift(a: number[], shift: number): number[] {
    if (a.length === 0) return []
    return new Array<number>(shift).fill(0).concat(a)
}

/** Horner evaluation at `x`. */
export function polyEval(a: number[], x: number): number {
    let result = 0
    for (let i = a.length - 1; i >= 0; i--) {
        result = gfMul(result, x) ^ a[i]
    }
    return result
}

/** Formal derivative. In characteristic 2 the even-degree terms vanish. */
export function polyDerivative(a: number[]): number[] {
    const out = new Array<number>(Math.max(0, a.length - 1)).fill(0)
    for (let i = 1; i < a.length; i++) {
        out[i - 1] = i % 2 === 1 ? a[i] : 0
    }
    return trimPoly(out)
}

/** Drop leading (highest-degree) zero coefficients. */
export function trimPoly(a: number[]): number[] {
    let end = a.length
    while (end > 0 && a[end - 1] === 0) end--
    return end === a.length ? a : a.slice(0, end)
}

export function polyDegree(a: number[]): number {
    return trimPoly(a).length - 1
}
