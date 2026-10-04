import { describe, expect, it } from "vitest"
import { chunk, diffLocal, emptyLedger, hashData, mediaContentType, mediaRecordId, needsApply, referencedMediaPaths, rememberApplied, showFileName } from "./cultoosCore"

describe("CultoOS sync core", () => {
    it("pushes new and edited records, skipping unchanged ones", () => {
        const ledger = emptyLedger()
        const local = [
            { collection: "shows" as const, id: "s1", data: { name: "A" }, modified: 10 },
            { collection: "templates" as const, id: "t1", data: { name: "T" } }
        ]

        const first = diffLocal(local, ledger, 99)
        expect(first).toHaveLength(2)
        expect(first[0]).toMatchObject({ collection: "shows", id: "s1", modifiedAt: 10, deleted: false })
        // no modified time: edited "now"
        expect(first[1].modifiedAt).toBe(99)

        first.forEach((c) => rememberApplied(ledger, c))
        expect(diffLocal(local, ledger)).toHaveLength(0)

        local[0].data = { name: "A (editada)" }
        expect(diffLocal(local, ledger).map((c) => c.id)).toEqual(["s1"])
    })

    it("turns records removed locally into deletions", () => {
        const ledger = emptyLedger()
        rememberApplied(ledger, { collection: "projects", id: "p1", data: { name: "Culto" }, deleted: false })
        rememberApplied(ledger, { collection: "projects", id: "p:2", data: { name: "Id com dois pontos" }, deleted: false })

        const changes = diffLocal([], ledger, 5)
        expect(changes).toEqual([
            { collection: "projects", id: "p1", data: null, deleted: true, modifiedAt: 5 },
            { collection: "projects", id: "p:2", data: null, deleted: true, modifiedAt: 5 }
        ])
    })

    it("applies only pulled changes this computer does not have yet", () => {
        const ledger = emptyLedger()
        const change = { collection: "shows", id: "s1", data: { name: "A" }, deleted: false, version: 1, modifiedAt: 1 }
        expect(needsApply(change, ledger)).toBe(true)

        rememberApplied(ledger, change)
        expect(needsApply(change, ledger)).toBe(false)
        expect(needsApply({ ...change, data: { name: "B" } }, ledger)).toBe(true)

        const deletion = { ...change, data: null, deleted: true }
        expect(needsApply(deletion, ledger)).toBe(true)
        rememberApplied(ledger, deletion)
        expect(needsApply(deletion, ledger)).toBe(false)
        expect(ledger.hashes).toEqual({})
    })

    it("builds safe show file names", () => {
        expect(showFileName('Grande é o Senhor / Ao vivo: "2026"', "id1")).toBe("Grande é o Senhor  Ao vivo 2026.show")
        expect(showFileName("", "id1")).toBe("id1.show")
    })

    it("hashes deterministically and chunks batches", () => {
        expect(hashData({ a: 1 })).toBe(hashData({ a: 1 }))
        expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    })

    it("hashes independently of key order", () => {
        expect(hashData({ a: 1, b: { c: 2, d: [1, { e: 3, f: 4 }] } })).toBe(hashData({ b: { d: [1, { f: 4, e: 3 }], c: 2 }, a: 1 }))
    })

    it("never turns media mappings into deletions", () => {
        const ledger = emptyLedger()
        rememberApplied(ledger, { collection: "media", id: "m1", data: { path: "C:/x.jpg" }, deleted: false })
        expect(diffLocal([], ledger)).toEqual([])
    })

    it("finds local media used by shows and templates", () => {
        const shows = [{ media: { a: { path: "C:/Fundos/ceu.jpg" }, b: { path: "https://youtube.com/x" }, c: { path: "C:/doc.txt" } } }]
        const templates = [{ settings: { backgroundPath: "/Users/maria/Videos/loop.mp4" } }]
        expect(referencedMediaPaths(shows, templates)).toEqual(["C:/Fundos/ceu.jpg", "/Users/maria/Videos/loop.mp4"])
        expect(mediaContentType("loop.MP4")).toBe("video/mp4")
        expect(mediaRecordId("C:/a.jpg")).toHaveLength(24)
    })
})
