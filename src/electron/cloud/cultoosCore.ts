// ----- cultoOS -----
// Pure helpers for the cultoOS cloud sync: record keys, hashing and local change detection.

import crypto from "crypto"

export const SYNC_COLLECTIONS = ["shows", "projects", "folders", "templates", "overlays", "stage", "themes", "categories", "media"] as const
export type SyncCollection = (typeof SYNC_COLLECTIONS)[number]

export interface LocalRecord {
    collection: SyncCollection
    id: string
    data: any
    // record modification time (ms) when the app tracks it
    modified?: number
}

export interface RemoteChange {
    collection: string
    id: string
    data: any
    deleted: boolean
    version: number
    modifiedAt: number
}

export interface PushChange {
    collection: SyncCollection
    id: string
    data: any
    deleted: boolean
    modifiedAt: number
}

// what this computer last sent or received for each record
export interface MediaRecord {
    // path on the computer that added the file
    path: string
    name: string
    hash: string // sha256 of the content
    size: number
    contentType: string
}

export interface SyncLedger {
    cursor: number
    hashes: { [key: string]: string }
    lastSync?: number
    // media mappings received from the cloud, by record id
    media?: { [id: string]: MediaRecord }
    // sha256 cache of local files, by "path|size|mtime"
    fileHashes?: { [key: string]: string }
}

export const emptyLedger = (): SyncLedger => ({ cursor: 0, hashes: {} })

export function recordKey(collection: string, id: string) {
    return `${collection}:${id}`
}

// JSON with sorted keys, so the hash does not depend on key order (the cloud database reorders keys)
function stableStringify(value: any): string {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
    if (value && typeof value === "object") {
        return `{${Object.keys(value)
            .sort()
            .filter((key) => value[key] !== undefined)
            .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
            .join(",")}}`
    }
    return JSON.stringify(value ?? null)
}

export function hashData(data: any) {
    return crypto.createHash("sha1").update(stableStringify(data)).digest("hex")
}

// Records that differ from the ledger are pushed; records known by the ledger but gone locally become deletions.
export function diffLocal(local: LocalRecord[], ledger: SyncLedger, now = Date.now()): PushChange[] {
    const changes: PushChange[] = []
    const present = new Set<string>()

    for (const record of local) {
        const key = recordKey(record.collection, record.id)
        present.add(key)
        if (ledger.hashes[key] === hashData(record.data)) continue

        // records without a modification time count as edited now
        changes.push({ collection: record.collection, id: record.id, data: record.data, deleted: false, modifiedAt: record.modified || now })
    }

    for (const key of Object.keys(ledger.hashes)) {
        if (present.has(key)) continue
        const separator = key.indexOf(":")
        const collection = key.slice(0, separator) as SyncCollection
        if (!SYNC_COLLECTIONS.includes(collection)) continue
        // media records map a path on another computer to a file in the cloud: never deleted from here
        if (collection === "media") continue
        changes.push({ collection, id: key.slice(separator + 1), data: null, deleted: true, modifiedAt: now })
    }

    return changes
}

// A pulled change only needs to be applied when it differs from what this computer already has.
export function needsApply(change: RemoteChange, ledger: SyncLedger) {
    const known = ledger.hashes[recordKey(change.collection, change.id)]
    if (change.deleted) return known !== undefined
    return known !== hashData(change.data)
}

export function rememberApplied(ledger: SyncLedger, change: { collection: string; id: string; data: any; deleted: boolean }) {
    const key = recordKey(change.collection, change.id)
    if (change.deleted) delete ledger.hashes[key]
    else ledger.hashes[key] = hashData(change.data)
}

// characters that are not allowed in file names on Windows
export function showFileName(name: string, id: string) {
    const clean = (name || "").replace(/[\\/:*?"<>|]/g, "").trim()
    return `${clean || id}.show`
}

export function chunk<T>(items: T[], size: number) {
    const chunks: T[][] = []
    for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
    return chunks
}

// ----- media -----

const MEDIA_TYPES: { [ext: string]: string } = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    svg: "image/svg+xml",
    avif: "image/avif",
    mp4: "video/mp4",
    m4v: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    mkv: "video/x-matroska",
    avi: "video/x-msvideo",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    m4a: "audio/mp4",
    aac: "audio/aac",
    flac: "audio/flac"
}

export function mediaContentType(filePath: string) {
    const ext = filePath.split(".").pop()?.toLowerCase() || ""
    return MEDIA_TYPES[ext] || null
}

export function mediaRecordId(filePath: string) {
    return crypto.createHash("sha1").update(filePath).digest("hex").slice(0, 24)
}

// Local file paths used by synced records (show backgrounds/media and template backgrounds).
export function referencedMediaPaths(shows: any[], templates: any[]) {
    const paths = new Set<string>()
    const add = (value: any) => {
        if (typeof value !== "string" || !value || /^(https?:|data:|blob:)/.test(value)) return
        if (mediaContentType(value)) paths.add(value)
    }
    shows.forEach((show) => Object.values(show?.media || {}).forEach((m: any) => add(m?.path || m?.id)))
    templates.forEach((template) => add(template?.settings?.backgroundPath))
    return [...paths]
}
