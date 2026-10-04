// ----- cultoOS -----
// Sync with the cultoOS cloud: pair this computer with a code from the web panel, then pull/push records.

import { safeStorage } from "electron"
import path from "path"
import { BRAND } from "../../types/Brand"
import { Main } from "../../types/IPC/Main"
import { _store, getStore, safeStoreSet } from "../data/store"
import { sendMain } from "../IPC/main"
import { deleteFile, doesPathExist, getDataFolderPath, loadShows, parseShow, readFile, writeFileAsync } from "../utils/files"
import { chunk, diffLocal, emptyLedger, needsApply, rememberApplied, showFileName, type LocalRecord, type RemoteChange, type SyncLedger } from "./cultoosCore"

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

function collectLocal(): LocalRecord[] {
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

    return records
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

        // 2. push local changes
        const changes = diffLocal(collectLocal(), ledger)
        let pushed = 0
        for (const batch of chunk(changes, PUSH_BATCH)) {
            const result = await api<{ results: { collection: string; id: string; status: string }[] }>("/api/sync/push", connection.token, { method: "POST", body: JSON.stringify({ changes: batch }) })
            result.results.forEach((r, i) => {
                // "stale": the cloud has a newer version, which arrives on the next pull
                if (r.status === "applied") {
                    rememberApplied(ledger, batch[i])
                    pushed++
                }
            })
        }

        ledger.lastSync = Date.now()
        await safeStoreSet(_store.CULTOOS_SYNC, ledger, "CULTOOS_SYNC")
        return { success: true, pulled: pulled.length, pushed, downloadedShowIds }
    } catch (err: any) {
        if (err?.status === 401) return { success: false, error: "unauthorized" }
        console.error("cultoOS sync failed:", err)
        return { success: false, error: "sync_failed" }
    } finally {
        syncing = false
    }
}
