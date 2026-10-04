// ----- cultoOS -----
// Renderer side of the cultoOS cloud sync (see src/electron/cloud/cultoos.ts)

import { get, writable } from "svelte/store"
import { uid } from "uid"
import { Main } from "../../types/IPC/Main"
import type { ProjectShowRef } from "../../types/Projects"
import { generateScriptureShowFromReference } from "../components/drawer/bible/scripture"
import { history } from "../components/helpers/history"
import { isOutCleared } from "../components/helpers/output"
import { loadShows } from "../components/helpers/setShow"
import { requestMain } from "../IPC/main"
import { activeShow, projects, saved, shows, showsCache } from "../stores"
import { newToast, setStatus } from "./common"

const AUTO_SYNC_INTERVAL = 2 * 60 * 1000

export const cultoosCloud = writable({ connected: false, churchName: "", deviceName: "", lastSync: 0 })

export async function refreshCultoosStatus() {
    const status = await requestMain(Main.CULTOOS_STATUS)
    if (status) cultoosCloud.set(status)
}

export async function pairCultoos(code: string, deviceName: string) {
    const result = await requestMain(Main.CULTOOS_PAIR, { code, deviceName })
    await refreshCultoosStatus()
    if (result?.success) cultoosSyncNow(true)
    return result
}

export async function disconnectCultoos() {
    await requestMain(Main.CULTOOS_DISCONNECT)
    await refreshCultoosStatus()
}

let running = false

// manual = button click (sync even with unsaved changes after saving, and while something is live)
export async function cultoosSyncNow(manual = false) {
    if (running || !get(cultoosCloud).connected) return
    // the main process reads the saved files, and applying remote data while presenting could change the live slides
    if (!manual && (!get(saved) || !isOutCleared("slide"))) return

    running = true
    setStatus("syncing")
    try {
        const result = await requestMain(Main.CULTOOS_SYNC)
        if (!result?.success) {
            setStatus("error", 5)
            if (manual) newToast(result?.error === "unauthorized" ? "cloud.cultoos_unauthorized" : result?.error === "plan_required" ? "cloud.cultoos_plan_required" : "cloud.cultoos_sync_failed")
            if (result?.error === "unauthorized") await disconnectCultoos()
            return
        }

        // shows written by the sync must be reloaded from disk, otherwise the next save would overwrite them
        const downloaded = result.downloadedShowIds || []
        if (downloaded.length) {
            showsCache.update((a) => {
                downloaded.forEach((id) => delete a[id])
                return a
            })
            const currentlyActive = get(activeShow)?.id || ""
            if (downloaded.includes(currentlyActive) && get(shows)[currentlyActive]) loadShows([currentlyActive])
        }

        await convertScriptureReferences()
        setStatus("synced", 3)
        refreshCultoosStatus()
    } finally {
        running = false
    }
}

// Bible readings added in the web panel arrive as sections with `data.scriptureRef`;
// they become scripture slides using the Bibles installed on this computer.
async function convertScriptureReferences() {
    const allProjects = get(projects)
    for (const [projectId, project] of Object.entries(allProjects)) {
        if (!project.shows?.some((item) => item.type === "section" && item.data?.scriptureRef)) continue

        const items: ProjectShowRef[] = []
        let changed = false
        for (const item of project.shows) {
            const reference = item.type === "section" ? item.data?.scriptureRef : null
            if (!reference) {
                items.push(item)
                continue
            }

            const scriptureShow = await generateScriptureShowFromReference(reference)
            if (!scriptureShow) {
                // keep it as a section so the operator still sees the reading
                items.push(item)
                continue
            }

            const showId = uid()
            history({ id: "SHOWS", newData: { data: [{ id: showId, show: scriptureShow }] } })
            items.push({ id: showId, type: "show", name: reference })
            changed = true
        }

        if (!changed) continue
        projects.update((a) => {
            if (a[projectId]) a[projectId] = { ...a[projectId], shows: items, modified: Date.now() }
            return a
        })
    }
}

let timer: ReturnType<typeof setInterval> | null = null
export async function startCultoosCloud() {
    await refreshCultoosStatus()
    if (timer) clearInterval(timer)
    timer = setInterval(() => cultoosSyncNow(), AUTO_SYNC_INTERVAL)
    cultoosSyncNow()
}
