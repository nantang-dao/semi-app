/**
 * Minimal 1-bit-per-module bitmap. Backed by a Uint8ClampedArray so it can be
 * handed around cheaply; `true` means "dark module".
 */
export class BitMatrix {
    readonly width: number
    readonly height: number
    readonly data: Uint8ClampedArray

    constructor(data: Uint8ClampedArray, width: number, height: number) {
        this.data = data
        this.width = width
        this.height = height
    }

    static createEmpty(width: number, height: number): BitMatrix {
        return new BitMatrix(new Uint8ClampedArray(width * height), width, height)
    }

    get(x: number, y: number): boolean {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false
        return this.data[y * this.width + x] === 1
    }

    set(x: number, y: number, value: boolean): void {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) return
        this.data[y * this.width + x] = value ? 1 : 0
    }

    /** Fill an axis-aligned rectangle. Used to mark function-pattern regions. */
    setRegion(left: number, top: number, width: number, height: number, value: boolean): void {
        for (let y = top; y < top + height; y++) {
            for (let x = left; x < left + width; x++) {
                this.set(x, y, value)
            }
        }
    }

    copy(): BitMatrix {
        return new BitMatrix(this.data.slice(), this.width, this.height)
    }
}
