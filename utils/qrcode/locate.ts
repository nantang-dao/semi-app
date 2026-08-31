import {BitMatrix} from './bitmatrix'

export interface Point {
    x: number
    y: number
}

export interface FinderPattern extends Point {
    /** Estimated module size, in pixels, at this pattern. */
    size: number
    /** How many independent scan lines confirmed this centre. */
    count: number
}

export interface LocatedSymbol {
    topLeft: FinderPattern
    topRight: FinderPattern
    bottomLeft: FinderPattern
    /** Centre of the bottom-right alignment pattern, when one was found. */
    alignment: Point | null
    /** Modules per side. */
    dimension: number
}

/**
 * Locate the three finder patterns and derive the symbol's module grid size.
 *
 * Rows are scanned for the 1:1:3:1:1 dark/light run ratio that a finder pattern
 * produces along any line through its centre; each hit is confirmed by
 * re-scanning vertically and horizontally through the candidate centre before
 * being merged into the candidate list.
 */
export function locate(matrix: BitMatrix): LocatedSymbol | null {
    const candidates = findCandidates(matrix)
    if (candidates.length < 3) return null

    const triple = selectBestTriple(candidates)
    if (triple === null) return null

    const {topLeft, topRight, bottomLeft} = orderPatterns(triple)

    // Measured along the symbol's own axes rather than from the row scan's
    // `size`. A finder pattern's 1:1:3:1:1 ratio survives rotation, but the
    // horizontal run through a rotated pattern spans its diagonal — up to
    // sqrt(2) too wide at 45°, which scales the dimension estimate below into
    // the wrong version and loses every tilted symbol.
    const moduleSize = calculateModuleSize(matrix, topLeft, topRight, bottomLeft)
    if (!(moduleSize > 0)) return null

    const dimension = estimateDimension(topLeft, topRight, bottomLeft, moduleSize)
    if (dimension === null) return null

    const alignment = dimension >= 25 ? findAlignment(matrix, topLeft, topRight, bottomLeft, dimension, moduleSize) : null

    return {topLeft, topRight, bottomLeft, alignment, dimension}
}

function distance(a: Point, b: Point): number {
    return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Do the five runs match 1:1:3:1:1 within half a module? */
function foundPatternCross(stateCount: number[]): boolean {
    let total = 0
    for (let i = 0; i < 5; i++) {
        if (stateCount[i] === 0) return false
        total += stateCount[i]
    }
    if (total < 7) return false
    const moduleSize = total / 7
    const maxVariance = moduleSize / 2
    return (
        Math.abs(moduleSize - stateCount[0]) < maxVariance &&
        Math.abs(moduleSize - stateCount[1]) < maxVariance &&
        Math.abs(3 * moduleSize - stateCount[2]) < 3 * maxVariance &&
        Math.abs(moduleSize - stateCount[3]) < maxVariance &&
        Math.abs(moduleSize - stateCount[4]) < maxVariance
    )
}

/** Centre of the middle run, measured back from the end of the fifth run. */
function centerFromEnd(stateCount: number[], end: number): number {
    return end - stateCount[4] - stateCount[3] - stateCount[2] / 2
}

function findCandidates(matrix: BitMatrix): FinderPattern[] {
    const {width, height} = matrix
    const centers: FinderPattern[] = []
    const stateCount = [0, 0, 0, 0, 0]

    for (let y = 0; y < height; y++) {
        stateCount[0] = 0
        stateCount[1] = 0
        stateCount[2] = 0
        stateCount[3] = 0
        stateCount[4] = 0
        let currentState = 0

        for (let x = 0; x < width; x++) {
            if (matrix.get(x, y)) {
                // Dark. Odd states are light runs, so a transition bumps the state.
                if ((currentState & 1) === 1) currentState++
                stateCount[currentState]++
            } else {
                if ((currentState & 1) === 0) {
                    if (currentState === 4) {
                        if (foundPatternCross(stateCount)) {
                            handlePossibleCenter(matrix, stateCount, y, x, centers)
                        }
                        // Shift the window: runs 2..4 become the new 0..2.
                        stateCount[0] = stateCount[2]
                        stateCount[1] = stateCount[3]
                        stateCount[2] = stateCount[4]
                        stateCount[3] = 1
                        stateCount[4] = 0
                        currentState = 3
                    } else {
                        currentState++
                        stateCount[currentState]++
                    }
                } else {
                    stateCount[currentState]++
                }
            }
        }

        if (currentState === 4 && foundPatternCross(stateCount)) {
            handlePossibleCenter(matrix, stateCount, y, width, centers)
        }
    }

    return centers
}

function handlePossibleCenter(
    matrix: BitMatrix,
    stateCount: number[],
    row: number,
    end: number,
    centers: FinderPattern[]
): void {
    const stateCountTotal = stateCount[0] + stateCount[1] + stateCount[2] + stateCount[3] + stateCount[4]
    let centerX = centerFromEnd(stateCount, end)
    const centerY = crossCheckVertical(matrix, row, Math.floor(centerX), stateCount[2], stateCountTotal)
    if (centerY === null) return
    const refinedX = crossCheckHorizontal(matrix, Math.floor(centerY), Math.floor(centerX), stateCount[2], stateCountTotal)
    if (refinedX === null) return
    centerX = refinedX

    const estimatedModuleSize = stateCountTotal / 7
    for (const center of centers) {
        if (aboutEquals(center, estimatedModuleSize, centerY, centerX)) {
            // Running average, weighted by the number of confirmations so far.
            const n = center.count + 1
            center.x = (center.count * center.x + centerX) / n
            center.y = (center.count * center.y + centerY) / n
            center.size = (center.count * center.size + estimatedModuleSize) / n
            center.count = n
            return
        }
    }
    centers.push({x: centerX, y: centerY, size: estimatedModuleSize, count: 1})
}

function aboutEquals(center: FinderPattern, moduleSize: number, y: number, x: number): boolean {
    if (Math.abs(y - center.y) > moduleSize || Math.abs(x - center.x) > moduleSize) return false
    const diff = Math.abs(moduleSize - center.size)
    return diff <= 1 || diff <= center.size
}

function crossCheckVertical(
    matrix: BitMatrix,
    startY: number,
    centerX: number,
    maxCount: number,
    originalTotal: number
): number | null {
    const {height} = matrix
    const stateCount = [0, 0, 0, 0, 0]

    let y = startY
    while (y >= 0 && matrix.get(centerX, y)) {
        stateCount[2]++
        y--
    }
    if (y < 0) return null
    while (y >= 0 && !matrix.get(centerX, y) && stateCount[1] <= maxCount) {
        stateCount[1]++
        y--
    }
    if (y < 0 || stateCount[1] > maxCount) return null
    while (y >= 0 && matrix.get(centerX, y) && stateCount[0] <= maxCount) {
        stateCount[0]++
        y--
    }
    if (stateCount[0] > maxCount) return null

    y = startY + 1
    while (y < height && matrix.get(centerX, y)) {
        stateCount[2]++
        y++
    }
    if (y === height) return null
    while (y < height && !matrix.get(centerX, y) && stateCount[3] < maxCount) {
        stateCount[3]++
        y++
    }
    if (y === height || stateCount[3] >= maxCount) return null
    while (y < height && matrix.get(centerX, y) && stateCount[4] < maxCount) {
        stateCount[4]++
        y++
    }
    if (stateCount[4] >= maxCount) return null

    const total = stateCount[0] + stateCount[1] + stateCount[2] + stateCount[3] + stateCount[4]
    if (5 * Math.abs(total - originalTotal) >= 2 * originalTotal) return null

    return foundPatternCross(stateCount) ? centerFromEnd(stateCount, y) : null
}

function crossCheckHorizontal(
    matrix: BitMatrix,
    centerY: number,
    startX: number,
    maxCount: number,
    originalTotal: number
): number | null {
    const {width} = matrix
    const stateCount = [0, 0, 0, 0, 0]

    let x = startX
    while (x >= 0 && matrix.get(x, centerY)) {
        stateCount[2]++
        x--
    }
    if (x < 0) return null
    while (x >= 0 && !matrix.get(x, centerY) && stateCount[1] <= maxCount) {
        stateCount[1]++
        x--
    }
    if (x < 0 || stateCount[1] > maxCount) return null
    while (x >= 0 && matrix.get(x, centerY) && stateCount[0] <= maxCount) {
        stateCount[0]++
        x--
    }
    if (stateCount[0] > maxCount) return null

    x = startX + 1
    while (x < width && matrix.get(x, centerY)) {
        stateCount[2]++
        x++
    }
    if (x === width) return null
    while (x < width && !matrix.get(x, centerY) && stateCount[3] < maxCount) {
        stateCount[3]++
        x++
    }
    if (x === width || stateCount[3] >= maxCount) return null
    while (x < width && matrix.get(x, centerY) && stateCount[4] < maxCount) {
        stateCount[4]++
        x++
    }
    if (stateCount[4] >= maxCount) return null

    const total = stateCount[0] + stateCount[1] + stateCount[2] + stateCount[3] + stateCount[4]
    if (5 * Math.abs(total - originalTotal) >= originalTotal) return null

    return foundPatternCross(stateCount) ? centerFromEnd(stateCount, x) : null
}

/**
 * Pick the three candidates that best form the corner triangle of a QR symbol:
 * a right isosceles triangle with consistent module sizes.
 */
function selectBestTriple(candidates: FinderPattern[]): [FinderPattern, FinderPattern, FinderPattern] | null {
    const pool = candidates.slice().sort((a, b) => b.count - a.count).slice(0, 8)
    if (pool.length < 3) return null

    let best: [FinderPattern, FinderPattern, FinderPattern] | null = null
    let bestScore = Infinity

    for (let i = 0; i < pool.length; i++) {
        for (let j = i + 1; j < pool.length; j++) {
            for (let k = j + 1; k < pool.length; k++) {
                const trio: [FinderPattern, FinderPattern, FinderPattern] = [pool[i], pool[j], pool[k]]
                const score = scoreTriple(trio)
                if (score < bestScore) {
                    bestScore = score
                    best = trio
                }
            }
        }
    }

    return bestScore < 1 ? best : null
}

function scoreTriple(trio: [FinderPattern, FinderPattern, FinderPattern]): number {
    const [a, b, c] = trio
    const sides = [
        {d: distance(a, b), opposite: c},
        {d: distance(b, c), opposite: a},
        {d: distance(a, c), opposite: b}
    ].sort((p, q) => p.d - q.d)

    const [leg1, leg2, hyp] = sides
    if (leg1.d === 0 || hyp.d === 0) return Infinity

    // Legs should be equal, and the hypotenuse should be sqrt(2) times a leg.
    const legError = Math.abs(leg1.d - leg2.d) / leg2.d
    const rightAngleError = Math.abs(hyp.d - Math.SQRT2 * ((leg1.d + leg2.d) / 2)) / hyp.d

    const sizes = [a.size, b.size, c.size]
    const meanSize = (sizes[0] + sizes[1] + sizes[2]) / 3
    const sizeError = Math.max(...sizes.map((s) => Math.abs(s - meanSize))) / meanSize

    return legError + rightAngleError + sizeError
}

/**
 * The corner shared by the two legs is the top-left pattern; a cross product
 * then tells top-right from bottom-left (image y grows downwards).
 */
function orderPatterns(trio: [FinderPattern, FinderPattern, FinderPattern]): {
    topLeft: FinderPattern
    topRight: FinderPattern
    bottomLeft: FinderPattern
} {
    const [a, b, c] = trio
    const dAB = distance(a, b)
    const dBC = distance(b, c)
    const dAC = distance(a, c)

    let corner: FinderPattern
    let p: FinderPattern
    let q: FinderPattern
    if (dBC >= dAB && dBC >= dAC) {
        corner = a
        p = b
        q = c
    } else if (dAC >= dAB && dAC >= dBC) {
        corner = b
        p = a
        q = c
    } else {
        corner = c
        p = a
        q = b
    }

    const cross = (q.x - corner.x) * (p.y - corner.y) - (q.y - corner.y) * (p.x - corner.x)
    if (cross < 0) {
        const t = p
        p = q
        q = t
    }

    return {topLeft: corner, bottomLeft: p, topRight: q}
}

/**
 * Module size in pixels, averaged over the two axes the symbol actually lies
 * along (top-left→top-right and top-left→bottom-left).
 */
function calculateModuleSize(
    matrix: BitMatrix,
    topLeft: FinderPattern,
    topRight: FinderPattern,
    bottomLeft: FinderPattern
): number {
    const across = moduleSizeOneWay(matrix, topLeft, topRight)
    const down = moduleSizeOneWay(matrix, topLeft, bottomLeft)
    if (Number.isNaN(across) && Number.isNaN(down)) {
        // Both traces ran off the image: fall back to the row-scan estimate.
        return (topLeft.size + topRight.size + bottomLeft.size) / 3
    }
    if (Number.isNaN(across)) return down
    if (Number.isNaN(down)) return across
    return (across + down) / 2
}

/**
 * A finder pattern is 7 modules wide, so the black-white-black run measured
 * through its centre in the direction of another pattern is 7 modules long.
 */
function moduleSizeOneWay(matrix: BitMatrix, pattern: FinderPattern, other: FinderPattern): number {
    const a = blackWhiteBlackRunBothWays(matrix, Math.round(pattern.x), Math.round(pattern.y), Math.round(other.x), Math.round(other.y))
    const b = blackWhiteBlackRunBothWays(matrix, Math.round(other.x), Math.round(other.y), Math.round(pattern.x), Math.round(pattern.y))
    if (Number.isNaN(a)) return b / 7
    if (Number.isNaN(b)) return a / 7
    return (a + b) / 14
}

function blackWhiteBlackRunBothWays(matrix: BitMatrix, fromX: number, fromY: number, toX: number, toY: number): number {
    const forward = blackWhiteBlackRun(matrix, fromX, fromY, toX, toY)
    // Mirror the far point through the origin to trace the opposite direction.
    const backward = blackWhiteBlackRun(matrix, fromX, fromY, fromX - (toX - fromX), fromY - (toY - fromY))
    if (Number.isNaN(forward) || Number.isNaN(backward)) return NaN
    // The centre pixel is counted by both halves.
    return forward + backward - 1
}

/**
 * Walk from (fromX, fromY) towards (toX, toY) with a Bresenham traversal,
 * returning the pixel distance covered by the black→white→black run that starts
 * at the origin. NaN when the run does not complete inside the image.
 */
function blackWhiteBlackRun(matrix: BitMatrix, fromX: number, fromY: number, toX: number, toY: number): number {
    const steep = Math.abs(toY - fromY) > Math.abs(toX - fromX)
    let x1 = fromX, y1 = fromY, x2 = toX, y2 = toY
    if (steep) {
        x1 = fromY; y1 = fromX; x2 = toY; y2 = toX
    }

    const dx = Math.abs(x2 - x1)
    const dy = Math.abs(y2 - y1)
    let error = -dx / 2
    const xStep = x1 < x2 ? 1 : -1
    const yStep = y1 < y2 ? 1 : -1

    // state 0 and 2 expect dark, state 1 expects light.
    let state = 0
    const xLimit = x2 + xStep
    for (let x = x1, y = y1; x !== xLimit; x += xStep) {
        const realX = steep ? y : x
        const realY = steep ? x : y
        if (realX < 0 || realY < 0 || realX >= matrix.width || realY >= matrix.height) return NaN

        // States 0 and 2 run through dark, state 1 through light: seeing the
        // other colour ends the current run.
        if ((state === 1) === matrix.get(realX, realY)) {
            if (state === 2) return Math.hypot(x - x1, y - y1)
            state++
        }

        error += dy
        if (error > 0) {
            if (y === y2) break
            y += yStep
            error -= dx
        }
    }

    // Ran to the endpoint mid-run: only usable if the third region had started.
    if (state === 2) return Math.hypot(x2 + xStep - x1, y2 - y1)
    return NaN
}

function estimateDimension(
    topLeft: FinderPattern,
    topRight: FinderPattern,
    bottomLeft: FinderPattern,
    moduleSize: number
): number | null {
    const widthModules = distance(topLeft, topRight) / moduleSize
    const heightModules = distance(topLeft, bottomLeft) / moduleSize
    // Finder centres sit 3.5 modules in from each edge, so the span between two
    // of them is (dimension - 7) modules.
    let dimension = Math.round((widthModules + heightModules) / 2) + 7

    // Every valid dimension is 4v+17, i.e. 1 mod 4.
    switch (dimension & 0x03) {
        case 0:
            dimension++
            break
        case 2:
            dimension--
            break
        case 3:
            dimension += 2
            break
        default:
            break
    }

    if (dimension < 21 || dimension > 177) return null
    return dimension
}

/**
 * The bottom-right alignment pattern sits at module (dimension-7, dimension-7).
 * Extrapolate the fourth corner of the symbol, walk back towards the top-left
 * by 3/(dimension-7) of the diagonal, and search a small window for the
 * light/dark/light 1:1:1 run through its centre module.
 */
function findAlignment(
    matrix: BitMatrix,
    topLeft: FinderPattern,
    topRight: FinderPattern,
    bottomLeft: FinderPattern,
    dimension: number,
    moduleSize: number
): Point | null {
    const bottomRightX = topRight.x - topLeft.x + bottomLeft.x
    const bottomRightY = topRight.y - topLeft.y + bottomLeft.y
    const correction = 1 - 3 / (dimension - 7)
    const estimateX = topLeft.x + correction * (bottomRightX - topLeft.x)
    const estimateY = topLeft.y + correction * (bottomRightY - topLeft.y)

    for (const factor of [4, 8, 12]) {
        const allowance = Math.floor(factor * moduleSize)
        const found = searchAlignment(matrix, estimateX, estimateY, allowance, moduleSize)
        if (found !== null) return found
    }
    return null
}

function searchAlignment(
    matrix: BitMatrix,
    estimateX: number,
    estimateY: number,
    allowance: number,
    moduleSize: number
): Point | null {
    const left = Math.max(0, Math.floor(estimateX - allowance))
    const right = Math.min(matrix.width - 1, Math.ceil(estimateX + allowance))
    const top = Math.max(0, Math.floor(estimateY - allowance))
    const bottom = Math.min(matrix.height - 1, Math.ceil(estimateY + allowance))
    if (right - left < 3 * moduleSize || bottom - top < 3 * moduleSize) return null

    const candidates: Point[] = []
    const stateCount = [0, 0, 0]

    // Scan outwards from the middle row so the nearest match wins.
    const middle = (top + bottom) >> 1
    for (let i = 0; i <= bottom - top; i++) {
        const y = middle + (i % 2 === 0 ? i >> 1 : -((i + 1) >> 1))
        if (y < top || y > bottom) continue

        stateCount[0] = 0
        stateCount[1] = 0
        stateCount[2] = 0
        let currentState = 0
        let x = left
        // Skip any dark run at the very start of the window — a partial pattern.
        while (x < right && matrix.get(x, y)) x++

        for (; x <= right; x++) {
            if (matrix.get(x, y)) {
                if (currentState === 1) {
                    stateCount[1]++
                } else if (currentState === 2) {
                    if (alignmentCrossCheck(stateCount, moduleSize)) {
                        const centerX = x - stateCount[2] - stateCount[1] / 2
                        const centerY = alignmentCrossCheckVertical(matrix, y, Math.floor(centerX), 2 * stateCount[1], moduleSize)
                        if (centerY !== null) candidates.push({x: centerX, y: centerY})
                    }
                    stateCount[0] = stateCount[2]
                    stateCount[1] = 1
                    stateCount[2] = 0
                    currentState = 1
                } else {
                    currentState = 1
                    stateCount[1]++
                }
            } else {
                if (currentState === 1) {
                    currentState = 2
                }
                stateCount[currentState]++
            }
        }

        if (candidates.length > 0) return candidates[0]
    }

    return null
}

function alignmentCrossCheck(stateCount: number[], moduleSize: number): boolean {
    const maxVariance = moduleSize / 2
    return (
        Math.abs(moduleSize - stateCount[0]) < maxVariance &&
        Math.abs(moduleSize - stateCount[1]) < maxVariance &&
        Math.abs(moduleSize - stateCount[2]) < maxVariance
    )
}

function alignmentCrossCheckVertical(
    matrix: BitMatrix,
    startY: number,
    centerX: number,
    maxCount: number,
    moduleSize: number
): number | null {
    const {height} = matrix
    const stateCount = [0, 0, 0]

    let y = startY
    while (y >= 0 && matrix.get(centerX, y) && stateCount[1] <= maxCount) {
        stateCount[1]++
        y--
    }
    if (y < 0 || stateCount[1] > maxCount) return null
    while (y >= 0 && !matrix.get(centerX, y) && stateCount[0] <= maxCount) {
        stateCount[0]++
        y--
    }
    if (stateCount[0] > maxCount) return null

    y = startY + 1
    while (y < height && matrix.get(centerX, y) && stateCount[1] <= maxCount) {
        stateCount[1]++
        y++
    }
    if (y === height || stateCount[1] > maxCount) return null
    while (y < height && !matrix.get(centerX, y) && stateCount[2] <= maxCount) {
        stateCount[2]++
        y++
    }
    if (stateCount[2] > maxCount) return null

    if (!alignmentCrossCheck(stateCount, moduleSize)) return null
    return y - stateCount[2] - stateCount[1] / 2
}
