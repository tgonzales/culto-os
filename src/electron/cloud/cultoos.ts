// ----- cultoOS -----
// Sync with the cultoOS cloud: pair this computer with a code from the web panel, then pull/push records.

import crypto from "crypto"
import { safeStorage } from "electron"
import fs from "fs"
import path from "path"
import { Readable } from "stream"
import { BRAND } from "../../types/Brand"
import { Main } from "../../types/IPC/Main"
import { _store, getStore, safeStoreSet } from "../data/store"
import { sendMain } from "../IPC/main"
import { deleteFile, doesPathExist, getDataFolderPath, getFileParentFolderId, getMediaSyncFolderPath, loadShows, parseShow, readFile, writeFileAsync } from "../utils/files"
import { chunk, diffLocal, emptyLedger, mediaContentType, mediaRecordId, needsApply, referencedMediaPaths, rememberApplied, showFileName, type LocalRecord, type MediaRecord, type PushChange, type RemoteChange, type SyncLedger } from "./cultoosCore"

const SECRET_KEY = "cultoosCloud"
const PUSH_BATCH = 200

interface Connection {
    token: string
    churchName: string
    deviceName: string
}

function cloudUrl() {
    return (process.env.CULTOOS_CLOUD_URL || BRAND.cloudUrl).replace(/\/$/, "")
}

// ----- connection (token kept encrypted with the OS keychain when available) -----

function getConnection(): Connection | null {
    const stored = getStore("ACCESS").secrets?.[SECRET_KEY]
    if (!stored?.token) return null

    try {
        const token = stored.encrypted ? safeStorage.decryptString(Buffer.from(stored.token, "base64")) : stored.token
        return { token, churchName: stored.churchName || "", deviceName: stored.deviceName || "" }
    } catch (err) {
        console.error("cultoOS: could not read the cloud token", err)
        return null
    }
}

function setConnection(connection: Connection | null) {
    const access = getStore("ACCESS")
    const secrets = { ...(access.secrets || {}) }

    if (!connection) delete secrets[SECRET_KEY]
    else {
        const encrypted = safeStorage.isEncryptionAvailable()
        const token = encrypted ? safeStorage.encryptString(connection.token).toString("base64") : connection.token
        secrets[SECRET_KEY] = { token, encrypted, churchName: connection.churchName, deviceName: connection.deviceName }
    }

    _store.ACCESS?.set("secrets", secrets)
}

function getLedger(): SyncLedger {
    return { ...emptyLedger(), ...(getStore("CULTOOS_SYNC") as SyncLedger) }
}

async function api<T>(pathname: string, token: string | null, init: RequestInit = {}): Promise<T> {
    const response = await fetch(cloudUrl() + pathname, {
        ...init,
        headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) }
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw Object.assign(new Error(body?.error || `HTTP ${response.status}`), { status: response.status })
    return body as T
}

export async function cultoosPair({ code, deviceName }: { code: string; deviceName: string }) {
    try {
        const result = await api<{ token: string; church: { name: string } }>("/api/devices/claim", null, { method: "POST", body: JSON.stringify({ code, deviceName }) })
        setConnection({ token: result.token, churchName: result.church.name, deviceName })
        // a new church starts from scratch: everything local is pushed on the first sync
        await safeStoreSet(_store.CULTOOS_SYNC, emptyLedger(), "CULTOOS_SYNC")
        return { success: true, churchName: result.church.name }
    } catch (err: any) {
        return { success: false, error: err?.message === "invalid_or_expired_code" ? "invalid_code" : "connection_failed" }
    }
}

export function cultoosStatus() {
    const connection = getConnection()
    return { connected: !!connection, churchName: connection?.churchName || "", deviceName: connection?.deviceName || "", lastSync: getLedger().lastSync || 0, url: cloudUrl() }
}

export function cultoosDisconnect() {
    setConnection(null)
    return { success: true }
}

// ----- local data -----

async function collectLocal(ledger: SyncLedger): Promise<LocalRecord[]> {
    const records: LocalRecord[] = []

    const showsFolder = getDataFolderPath("shows")
    Object.entries(getStore("SHOWS")).forEach(([id, trimmed]: [string, any]) => {
        const filePath = path.join(showsFolder, `${trimmed.name}.show`)
        if (!doesPathExist(filePath)) return
        const parsed = parseShow(readFile(filePath))
        if (!parsed || parsed[0] !== id) return
        const show: any = parsed[1]
        records.push({ collection: "shows", id, data: show, modified: show.timestamps?.modified || show.timestamps?.created })
    })

    const projects = getStore("PROJECTS")
    Object.entries(projects.projects || {}).forEach(([id, data]: [string, any]) => records.push({ collection: "projects", id, data, modified: data.modified }))
    Object.entries(projects.folders || {}).forEach(([id, data]: [string, any]) => records.push({ collection: "folders", id, data, modified: data.modified }))

    const keyed: [LocalRecord["collection"], any][] = [
        ["templates", getStore("TEMPLATES")],
        ["overlays", getStore("OVERLAYS")],
        ["stage", getStore("STAGE")],
        ["themes", getStore("THEMES")],
        ["categories", getStore("SYNCED_SETTINGS").categories || {}]
    ]
    keyed.forEach(([collection, store]) => {
        Object.entries(store || {}).forEach(([id, data]: [string, any]) => records.push({ collection, id, data, modified: data?.modified }))
    })

    // media files that exist on this computer and are used by synced shows/templates
    const shows = records.filter((r) => r.collection === "shows").map((r) => r.data)
    const templates = Object.values(getStore("TEMPLATES") || {})
    for (const filePath of referencedMediaPaths(shows, templates)) {
        const media = await describeMedia(filePath, ledger)
        if (media) records.push({ collection: "media", id: mediaRecordId(filePath), data: media })
    }

    return records
}

// ----- media files -----

async function sha256File(filePath: string) {
    return new Promise<string>((resolve, reject) => {
        const hash = crypto.createHash("sha256")
        fs.createReadStream(filePath)
            .on("data", (chunk) => hash.update(chunk))
            .on("end", () => resolve(hash.digest("hex")))
            .on("error", reject)
    })
}

async function describeMedia(filePath: string, ledger: SyncLedger): Promise<MediaRecord | null> {
    const contentType = mediaContentType(filePath)
    if (!contentType) return null

    let stat: fs.Stats
    try {
        stat = fs.statSync(filePath)
    } catch {
        return null
    }
    if (!stat.isFile()) return null

    // hashing big videos is slow: cache by path, size and modification time
    const cacheKey = `${filePath}|${stat.size}|${stat.mtimeMs}`
    ledger.fileHashes = ledger.fileHashes || {}
    const hash = ledger.fileHashes[cacheKey] || (ledger.fileHashes[cacheKey] = await sha256File(filePath))
    return { path: filePath, name: path.basename(filePath), hash, size: stat.size, contentType }
}

// Uploads the files of new media records straight to the private cloud storage (presigned URLs).
async function uploadMedia(changes: PushChange[], token: string) {
    const files = changes.filter((c) => c.collection === "media" && !c.deleted).map((c) => c.data as MediaRecord)
    if (!files.length) return

    const payload = files.map(({ hash, size, contentType }) => ({ hash, size, contentType }))
    const { uploads } = await api<{ uploads: { hash: string; url: string }[] }>("/api/media/upload-urls", token, { method: "POST", body: JSON.stringify({ files: payload }) })
    for (const upload of uploads) {
        const file = files.find((f) => f.hash === upload.hash)
        if (!file || !doesPathExist(file.path)) continue
        const body = Readable.toWeb(fs.createReadStream(file.path)) as any
        const response = await fetch(upload.url, { method: "PUT", body, headers: { "content-type": file.contentType, "content-length": String(file.size) }, duplex: "half" } as RequestInit)
        if (!response.ok) throw new Error(`media upload failed: ${response.status}`)
    }
    if (uploads.length) await api("/api/media/complete", token, { method: "POST", body: JSON.stringify({ files: payload }) })
}

// Where the app looks for a missing file (see locateMediaFile): <media sync folder>/<parent folder id>/<file name>
function syncFolderPathFor(originalPath: string) {
    return path.join(getMediaSyncFolderPath(), getFileParentFolderId(originalPath), path.basename(originalPath))
}

// Downloads files used by synced shows/templates that don't exist on this computer.
async function downloadMissingMedia(ledger: SyncLedger, token: string, local: LocalRecord[]) {
    const byPath = new Map(Object.values(ledger.media || {}).map((m) => [m.path, m]))
    if (!byPath.size) return 0

    const shows = local.filter((r) => r.collection === "shows").map((r) => r.data)
    const missing = referencedMediaPaths(shows, Object.values(getStore("TEMPLATES") || {}))
        .filter((p) => byPath.has(p) && !doesPathExist(p) && !doesPathExist(syncFolderPathFor(p)))
        .map((p) => byPath.get(p)!)
    if (!missing.length) return 0

    let downloaded = 0
    for (const batch of chunk(missing, 50)) {
        const { urls } = await api<{ urls: { [hash: string]: string } }>("/api/media/download-urls", token, { method: "POST", body: JSON.stringify({ hashes: batch.map((m) => m.hash) }) })
        for (const media of batch) {
            const url = urls[media.hash]
            if (!url) continue
            const response = await fetch(url)
            if (!response.ok || !response.body) continue

            const target = syncFolderPathFor(media.path)
            fs.mkdirSync(path.dirname(target), { recursive: true })
            const temp = `${target}.download`
            await new Promise<void>((resolve, reject) => {
                Readable.fromWeb(response.body as any)
                    .pipe(fs.createWriteStream(temp))
                    .on("finish", () => resolve())
                    .on("error", reject)
            })
            fs.renameSync(temp, target)
            downloaded++
        }
    }
    return downloaded
}

async function applyRemote(changes: RemoteChange[], ledger: SyncLedger) {
    const downloadedShowIds: string[] = []
    const changedShowNames: string[] = []
    const showsFolder = getDataFolderPath("shows")

    const projects = JSON.parse(JSON.stringify(getStore("PROJECTS")))
    const stores: { [key: string]: any } = {}
    const getKeyed = (storeId: "TEMPLATES" | "OVERLAYS" | "STAGE" | "THEMES") => (stores[storeId] ??= JSON.parse(JSON.stringify(getStore(storeId) || {})))
    let syncedSettings: any = null
    let projectsChanged = false

    for (const change of changes) {
        if (!needsApply(change, ledger)) continue

        if (change.collection === "shows") {
            const existing: any = getStore("SHOWS")[change.id]
            const removeExisting = () => {
                if (!existing) return
                const oldPath = path.join(showsFolder, `${existing.name}.show`)
                // only delete the file if it really is this show
                if (doesPathExist(oldPath) && parseShow(readFile(oldPath))?.[0] === change.id) deleteFile(oldPath)
            }

            if (change.deleted) removeExisting()
            else {
                const fileName = showFileName(change.data?.name, change.id)
                if (existing && `${existing.name}.show` !== fileName) removeExisting()
                await writeFileAsync(path.join(showsFolder, fileName), JSON.stringify([change.id, change.data]), change.id)
                changedShowNames.push(fileName.slice(0, -5))
            }
            downloadedShowIds.push(change.id)
        } else if (change.collection === "projects" || change.collection === "folders") {
            const target = projects[change.collection] || (projects[change.collection] = {})
            if (change.deleted) delete target[change.id]
            else target[change.id] = change.data
            projectsChanged = true
        } else if (change.collection === "media") {
            ledger.media = ledger.media || {}
            if (change.deleted) delete ledger.media[change.id]
            else ledger.media[change.id] = change.data
        } else if (change.collection === "categories") {
            syncedSettings ??= JSON.parse(JSON.stringify(getStore("SYNCED_SETTINGS")))
            syncedSettings.categories = syncedSettings.categories || {}
            if (change.deleted) delete syncedSettings.categories[change.id]
            else syncedSettings.categories[change.id] = change.data
        } else {
            const storeId = ({ templates: "TEMPLATES", overlays: "OVERLAYS", stage: "STAGE", themes: "THEMES" } as const)[change.collection as "templates"]
            if (!storeId) continue
            const store = getKeyed(storeId)
            if (change.deleted) delete store[change.id]
            else store[change.id] = change.data
        }

        rememberApplied(ledger, change)
    }

    // write the stores once and push them to the renderer so the next save does not overwrite them
    if (projectsChanged) {
        await safeStoreSet(_store.PROJECTS, projects, "PROJECTS")
        sendMain(Main.PROJECTS, projects)
    }
    for (const [storeId, data] of Object.entries(stores)) {
        await safeStoreSet(_store[storeId as "TEMPLATES"], data, storeId)
        sendMain(Main[storeId as "TEMPLATES"], data)
    }
    if (syncedSettings) {
        await safeStoreSet(_store.SYNCED_SETTINGS, syncedSettings, "SYNCED_SETTINGS")
        sendMain(Main.SYNCED_SETTINGS, syncedSettings)
    }
    if (downloadedShowIds.length) {
        loadShows(false, changedShowNames)
        sendMain(Main.SHOWS, _store.SHOWS?.store || {})
    }

    return downloadedShowIds
}

// ----- sync -----

let syncing = false

export async function cultoosSync() {
    const connection = getConnection()
    if (!connection) return { success: false, error: "not_connected" }
    if (syncing) return { success: false, error: "already_syncing" }
    syncing = true

    try {
        const ledger = getLedger()

        // 1. pull everything that changed since the last sync
        const pulled: RemoteChange[] = []
        let cursor = ledger.cursor
        for (;;) {
            const page = await api<{ changes: RemoteChange[]; cursor: number; hasMore: boolean }>(`/api/sync/pull?since=${cursor}`, connection.token)
            pulled.push(...page.changes)
            cursor = page.cursor
            if (!page.hasMore) break
        }
        const downloadedShowIds = await applyRemote(pulled, ledger)
        ledger.cursor = cursor

        // 2. push local changes (media files are uploaded before the records that point to them)
        const local = await collectLocal(ledger)
        const changes = diffLocal(local, ledger)
        let pushed = 0
        for (const batch of chunk(changes, PUSH_BATCH)) {
            await uploadMedia(batch, connection.token)
            const result = await api<{ results: { collection: string; id: string; status: string }[] }>("/api/sync/push", connection.token, { method: "POST", body: JSON.stringify({ changes: batch }) })
            result.results.forEach((r, i) => {
                // "stale": the cloud has a newer version, which arrives on the next pull
                if (r.status === "applied") {
                    rememberApplied(ledger, batch[i])
                    pushed++
                }
            })
        }

        // 3. bring files used here that were added on other computers
        const downloadedMedia = await downloadMissingMedia(ledger, connection.token, local)

        ledger.lastSync = Date.now()
        await safeStoreSet(_store.CULTOOS_SYNC, ledger, "CULTOOS_SYNC")
        return { success: true, pulled: pulled.length, pushed, downloadedShowIds, downloadedMedia }
    } catch (err: any) {
        if (err?.status === 401) return { success: false, error: "unauthorized" }
        console.error("cultoOS sync failed:", err)
        return { success: false, error: "sync_failed" }
    } finally {
        syncing = false
    }
}
