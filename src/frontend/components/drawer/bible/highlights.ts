// ----- cultoOS -----
// Quick scripture highlights: the operator picks words of the selected verse and they are emphasized on the output.
// Highlights live for the session (they are not saved).

import { writable } from "svelte/store"

export interface VerseHighlight {
    // whole verse highlighted
    all?: boolean
    // indexes of the highlighted words (as shown in the highlight panel)
    words: number[]
    // text runs built from contiguous highlighted words, matched against the slide text
    snippets: string[]
}

export const scriptureHighlights = writable<{ [key: string]: VerseHighlight }>({})

// verse ids can carry a chapter prefix ("3:16") and a split part ("16_2", each part has its own words)
export function highlightKey(book: string, chapter: number | string, verseId: number | string) {
    const verse = String(verseId).split(":").pop()
    return `${book}|${chapter}|${verse}`
}

export function plainVerseWords(text: string) {
    return text
        .replace(/<[^>]+>/g, " ")
        .replace(/!\{|\}!/g, "")
        .split(/\s+/)
        .filter(Boolean)
}

// contiguous selected words become one snippet: [0,1,2,5] -> ["w0 w1 w2", "w5"]
export function buildHighlight(words: string[], selected: number[], all = false): VerseHighlight {
    const sorted = [...new Set(selected)].filter((i) => i >= 0 && i < words.length).sort((a, b) => a - b)
    const snippets: string[] = []
    let run: string[] = []
    sorted.forEach((index, i) => {
        if (i > 0 && index !== sorted[i - 1] + 1) {
            snippets.push(run.join(" "))
            run = []
        }
        run.push(words[index])
    })
    if (run.length) snippets.push(run.join(" "))
    return { all, words: sorted, snippets }
}

export function isEmptyHighlight(highlight?: VerseHighlight) {
    return !highlight || (!highlight.all && !highlight.snippets.length)
}

// Splits slide text into plain and highlighted parts (only plain text matching is done, tags are left untouched).
export function splitByHighlight(text: string, highlight?: VerseHighlight): { value: string; highlighted: boolean }[] {
    if (!text) return []
    if (isEmptyHighlight(highlight)) return [{ value: text, highlighted: false }]
    if (highlight!.all) return [{ value: text, highlighted: true }]

    const ranges: [number, number][] = []
    for (const snippet of highlight!.snippets) {
        let from = 0
        while (snippet && from < text.length) {
            const index = text.indexOf(snippet, from)
            if (index < 0) break
            ranges.push([index, index + snippet.length])
            from = index + snippet.length
        }
    }
    if (!ranges.length) return [{ value: text, highlighted: false }]

    ranges.sort((a, b) => a[0] - b[0])
    const parts: { value: string; highlighted: boolean }[] = []
    let cursor = 0
    for (const [start, end] of ranges) {
        if (start < cursor) continue // overlapping snippet
        if (start > cursor) parts.push({ value: text.slice(cursor, start), highlighted: false })
        parts.push({ value: text.slice(start, end), highlighted: true })
        cursor = end
    }
    if (cursor < text.length) parts.push({ value: text.slice(cursor), highlighted: false })
    return parts
}

export function highlightStyle(color = "#e5cf8f") {
    return `color: ${color};font-weight: bold;`
}
