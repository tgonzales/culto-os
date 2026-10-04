// ----- CultoOS -----
// Normalizes scripture references typed the Brazilian way before they reach the json-bible search:
// - accent-sensitive abbreviations: "jo" = João, "jó" = Jó (json-bible ignores accents and would pick Jó for both)
// - chapter and verse separated by a space or a dot: "jo 3 16" / "jo 3.16" -> "João 3:16"

interface BookName {
    name: string
    abbreviation?: string
}

const BOOK_TOKEN = /^(\s*(?:[1-3]\s*)?[^\d\s:.,;+-]+)(.*)$/u

export function normalizeReference(value: string, books: BookName[]) {
    let result = value

    const match = result.match(BOOK_TOKEN)
    if (match) {
        const [, token, rest] = match
        const key = token.replace(/\s+/g, "").toLowerCase()
        const book = books.find((a) => a.abbreviation && a.abbreviation.replace(/\s+/g, "").toLowerCase() === key)
        if (book) result = book.name + rest
    }

    // "<book> 3 16" -> "<book> 3:16" (the book part must contain a non-digit, e.g. "1 João 1 9")
    result = result.replace(/^(.*?[^\d\s].*?)\s+(\d+)\s+(\d+)/u, "$1 $2:$3")
    // "<book> 3.16" -> "<book> 3:16"
    result = result.replace(/^(.*?[^\d\s].*?\s\d+)\.(\d+)/u, "$1:$2")

    return result
}
