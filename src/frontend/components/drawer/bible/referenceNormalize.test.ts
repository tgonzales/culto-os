import { describe, expect, it } from "vitest"
import { normalizeReference } from "./referenceNormalize"

const books = [
    { name: "Gênesis", abbreviation: "Gn" },
    { name: "Êxodo", abbreviation: "Êx" },
    { name: "Jó", abbreviation: "Jó" },
    { name: "Salmos", abbreviation: "Sl" },
    { name: "João", abbreviation: "Jo" },
    { name: "1 João", abbreviation: "1Jo" }
]

describe("normalizeReference", () => {
    it("maps accent-sensitive abbreviations", () => {
        expect(normalizeReference("jo", books)).toBe("João")
        expect(normalizeReference("jó", books)).toBe("Jó")
        expect(normalizeReference("Jo 3", books)).toBe("João 3")
        expect(normalizeReference("1jo 1:9", books)).toBe("1 João 1:9")
        expect(normalizeReference("1 jo 1:9", books)).toBe("1 João 1:9")
    })

    it("converts space or dot separated chapter and verse", () => {
        expect(normalizeReference("jo 3 16", books)).toBe("João 3:16")
        expect(normalizeReference("jo 3.16", books)).toBe("João 3:16")
        expect(normalizeReference("sl 23 1-6", books)).toBe("Salmos 23:1-6")
        expect(normalizeReference("1 jo 1 9", books)).toBe("1 João 1:9")
    })

    it("leaves other input untouched", () => {
        expect(normalizeReference("ex 20:3", books)).toBe("ex 20:3")
        expect(normalizeReference("João 3:16", books)).toBe("João 3:16")
        expect(normalizeReference("jos", books)).toBe("jos")
        expect(normalizeReference("salmos 23", books)).toBe("salmos 23")
    })
})
