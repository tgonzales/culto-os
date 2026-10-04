// ----- cultoOS -----
// Converts an eBible.org VPL file ("GEN 1:1 text" per line) into the app Bible JSON format (.fsb)
// usage: node scripts/bibles/vplToFsb.js <input_vpl.txt> <output.fsb> <id> "<name>" "<copyright>"

const fs = require("fs")

// Protestant canon (66 books) with Brazilian Portuguese names and abbreviations
const BOOKS = [
    ["GEN", "Gênesis", "Gn"],
    ["EXO", "Êxodo", "Êx"],
    ["LEV", "Levítico", "Lv"],
    ["NUM", "Números", "Nm"],
    ["DEU", "Deuteronômio", "Dt"],
    ["JOS", "Josué", "Js"],
    ["JDG", "Juízes", "Jz"],
    ["RUT", "Rute", "Rt"],
    ["1SA", "1 Samuel", "1Sm"],
    ["2SA", "2 Samuel", "2Sm"],
    ["1KI", "1 Reis", "1Rs"],
    ["2KI", "2 Reis", "2Rs"],
    ["1CH", "1 Crônicas", "1Cr"],
    ["2CH", "2 Crônicas", "2Cr"],
    ["EZR", "Esdras", "Ed"],
    ["NEH", "Neemias", "Ne"],
    ["EST", "Ester", "Et"],
    ["JOB", "Jó", "Jó"],
    ["PSA", "Salmos", "Sl"],
    ["PRO", "Provérbios", "Pv"],
    ["ECC", "Eclesiastes", "Ec"],
    ["SOL", "Cânticos", "Ct"],
    ["ISA", "Isaías", "Is"],
    ["JER", "Jeremias", "Jr"],
    ["LAM", "Lamentações", "Lm"],
    ["EZE", "Ezequiel", "Ez"],
    ["DAN", "Daniel", "Dn"],
    ["HOS", "Oseias", "Os"],
    ["JOE", "Joel", "Jl"],
    ["AMO", "Amós", "Am"],
    ["OBA", "Obadias", "Ob"],
    ["JON", "Jonas", "Jn"],
    ["MIC", "Miqueias", "Mq"],
    ["NAH", "Naum", "Na"],
    ["HAB", "Habacuque", "Hc"],
    ["ZEP", "Sofonias", "Sf"],
    ["HAG", "Ageu", "Ag"],
    ["ZEC", "Zacarias", "Zc"],
    ["MAL", "Malaquias", "Ml"],
    ["MAT", "Mateus", "Mt"],
    ["MAR", "Marcos", "Mc"],
    ["LUK", "Lucas", "Lc"],
    ["JOH", "João", "Jo"],
    ["ACT", "Atos", "At"],
    ["ROM", "Romanos", "Rm"],
    ["1CO", "1 Coríntios", "1Co"],
    ["2CO", "2 Coríntios", "2Co"],
    ["GAL", "Gálatas", "Gl"],
    ["EPH", "Efésios", "Ef"],
    ["PHI", "Filipenses", "Fp"],
    ["COL", "Colossenses", "Cl"],
    ["1TH", "1 Tessalonicenses", "1Ts"],
    ["2TH", "2 Tessalonicenses", "2Ts"],
    ["1TI", "1 Timóteo", "1Tm"],
    ["2TI", "2 Timóteo", "2Tm"],
    ["TIT", "Tito", "Tt"],
    ["PHM", "Filemom", "Fm"],
    ["HEB", "Hebreus", "Hb"],
    ["JAM", "Tiago", "Tg"],
    ["1PE", "1 Pedro", "1Pe"],
    ["2PE", "2 Pedro", "2Pe"],
    ["1JO", "1 João", "1Jo"],
    ["2JO", "2 João", "2Jo"],
    ["3JO", "3 João", "3Jo"],
    ["JUD", "Judas", "Jd"],
    ["REV", "Apocalipse", "Ap"]
]

function convert(inputPath, id, name, copyright) {
    const books = BOOKS.map(([code, bookName, abbreviation], i) => ({ code, number: i + 1, name: bookName, abbreviation, chapters: [] }))
    const byCode = Object.fromEntries(books.map((b) => [b.code, b]))

    const lines = fs.readFileSync(inputPath, "utf8").split(/\r?\n/)
    let skipped = 0
    for (const line of lines) {
        const match = line.match(/^(\w{3}) (\d+):(\d+) (.*)$/)
        if (!match) continue
        const [, code, chapterNumber, verseNumber, rawText] = match
        const book = byCode[code]
        if (!book) {
            skipped++ // deuterocanonical / non-66 books
            continue
        }

        // remove translator brackets around supplied words: "para [que eu saiba]" -> "para que eu saiba"
        const text = rawText.replace(/[[\]]/g, "").replace(/\s+/g, " ").trim()
        if (!text) continue

        let chapter = book.chapters[book.chapters.length - 1]
        if (!chapter || chapter.number !== Number(chapterNumber)) {
            chapter = { number: Number(chapterNumber), verses: [] }
            book.chapters.push(chapter)
        }
        chapter.verses.push({ number: Number(verseNumber), text })
    }

    const missing = books.filter((b) => !b.chapters.length).map((b) => b.code)
    if (missing.length) throw new Error("Missing books: " + missing.join(", "))

    return {
        bible: { id, name, copyright, metadata: { language: "pt-BR", copyright }, books: books.map(({ code, ...b }) => b) },
        skipped
    }
}

if (require.main === module) {
    const [input, output, id, name, copyright] = process.argv.slice(2)
    if (!input || !output || !id || !name) {
        console.error('usage: node vplToFsb.js <input_vpl.txt> <output.fsb> <id> "<name>" "<copyright>"')
        process.exit(1)
    }
    const { bible, skipped } = convert(input, id, name, copyright || "")
    fs.writeFileSync(output, JSON.stringify([id, bible]))
    const verses = bible.books.reduce((n, b) => n + b.chapters.reduce((m, c) => m + c.verses.length, 0), 0)
    console.log(`${name}: ${bible.books.length} books, ${verses} verses (${skipped} non-canon lines skipped) -> ${output}`)
}

module.exports = { convert, BOOKS }
