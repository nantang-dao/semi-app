import {gfDiv, gfExp, gfInverse, gfMul, polyAdd, polyDerivative, polyEval, polyMul, polyShift, polyScale, trimPoly} from './galois'

/**
 * Reed-Solomon decoder for the QR code field, generator base alpha^0 —
 * i.e. the encoder's generator is prod(x - alpha^i) for i in [0, ecCount).
 *
 * Berlekamp-Massey for the error locator, Chien search for the roots, Forney
 * for the magnitudes.
 *
 * `received` is in transmission order (highest-degree coefficient first), which
 * is how codewords come off the symbol. Internally we work with the reversed
 * array so that index == degree.
 */
export function rsDecode(received: number[], ecCount: number): number[] | null {
    const n = received.length
    if (ecCount <= 0 || n <= ecCount || n > 255) return null

    // coeff[k] is the codeword at transmission position n-1-k.
    const coeff = received.slice().reverse()

    const syndromes = new Array<number>(ecCount)
    let hasError = false
    for (let i = 0; i < ecCount; i++) {
        const s = polyEval(coeff, gfExp(i))
        syndromes[i] = s
        if (s !== 0) hasError = true
    }
    if (!hasError) return received.slice()

    const locator = berlekampMassey(syndromes, ecCount)
    if (locator === null) return null

    const errorCount = locator.length - 1
    if (errorCount <= 0 || errorCount * 2 > ecCount) return null

    // Chien search: position k is in error iff Lambda(alpha^-k) == 0.
    const positions: number[] = []
    for (let k = 0; k < n; k++) {
        if (polyEval(locator, gfInverse(gfExp(k))) === 0) positions.push(k)
    }
    if (positions.length !== errorCount) return null

    // Omega(x) = S(x) * Lambda(x) mod x^ecCount
    const omega = trimPoly(polyMul(syndromes, locator).slice(0, ecCount))
    const derivative = polyDerivative(locator)
    if (derivative.length === 0) return null

    for (const k of positions) {
        const xInv = gfInverse(gfExp(k)) // alpha^-k
        const denominator = polyEval(derivative, xInv)
        if (denominator === 0) return null
        // Generator base 0, so the magnitude is X_k * Omega(X_k^-1) / Lambda'(X_k^-1).
        const magnitude = gfMul(gfExp(k), gfDiv(polyEval(omega, xInv), denominator))
        coeff[k] ^= magnitude
    }

    // Re-check: a mis-corrected block must not be handed back as valid data.
    for (let i = 0; i < ecCount; i++) {
        if (polyEval(coeff, gfExp(i)) !== 0) return null
    }

    return coeff.reverse()
}

/** Returns the error locator polynomial Lambda, or null if it is inconsistent. */
function berlekampMassey(syndromes: number[], ecCount: number): number[] | null {
    let locator: number[] = [1]
    let previous: number[] = [1]
    let degree = 0
    let shift = 1
    let discrepancyPrev = 1

    for (let i = 0; i < ecCount; i++) {
        let discrepancy = syndromes[i]
        for (let j = 1; j <= degree; j++) {
            if (j < locator.length) discrepancy ^= gfMul(locator[j], syndromes[i - j])
        }

        if (discrepancy === 0) {
            shift++
            continue
        }

        const correction = polyShift(polyScale(previous, gfDiv(discrepancy, discrepancyPrev)), shift)
        if (2 * degree <= i) {
            const saved = locator
            locator = polyAdd(locator, correction)
            previous = saved
            degree = i + 1 - degree
            discrepancyPrev = discrepancy
            shift = 1
        } else {
            locator = polyAdd(locator, correction)
            shift++
        }
    }

    locator = trimPoly(locator)
    if (locator.length === 0 || locator[0] !== 1) return null
    return locator
}
