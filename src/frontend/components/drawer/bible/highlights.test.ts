import { describe, expect, it } from "vitest"
import { buildHighlight, highlightKey, isEmptyHighlight, plainVerseWords, splitByHighlight } from "./highlights"

const verse = "Porque Deus amou o mundo de tal maneira, que deu o seu Filho unigênito"

describe("scripture highlights", () => {
    it("builds snippets from contiguous words", () => {
        const words = plainVerseWords(verse)
        const highlight = buildHighlight(words, [2, 3, 4, 13, 12])
        expect(highlight.snippets).toEqual(["amou o mundo", "Filho unigênito"])
        expect(highlight.words).toEqual([2, 3, 4, 12, 13])
    })

    it("splits slide text into highlighted parts", () => {
        const highlight = buildHighlight(plainVerseWords(verse), [2, 3, 4])
        expect(splitByHighlight(verse, highlight)).toEqual([
            { value: "Porque Deus ", highlighted: false },
            { value: "amou o mundo", highlighted: true },
            { value: " de tal maneira, que deu o seu Filho unigênito", highlighted: false }
        ])
    })

    it("highlights the whole verse", () => {
        expect(splitByHighlight(verse, { all: true, words: [], snippets: [] })).toEqual([{ value: verse, highlighted: true }])
    })

    it("leaves text untouched without highlights or matches", () => {
        expect(splitByHighlight(verse, undefined)).toEqual([{ value: verse, highlighted: false }])
        expect(splitByHighlight(verse, buildHighlight(["outro"], [0]))).toEqual([{ value: verse, highlighted: false }])
        expect(isEmptyHighlight(buildHighlight([], []))).toBe(true)
    })

    it("ignores tags and red-letter markers when listing words", () => {
        expect(plainVerseWords('<span class="wj">Eu sou</span> o caminho')).toEqual(["Eu", "sou", "o", "caminho"])
        expect(plainVerseWords("!{Eu sou}! o caminho")).toEqual(["Eu", "sou", "o", "caminho"])
    })

    it("keys verses by book, chapter and verse part", () => {
        expect(highlightKey("João", 3, "3:16")).toBe("João|3|16")
        expect(highlightKey("João", 3, "16_2")).toBe("João|3|16_2")
    })
})
