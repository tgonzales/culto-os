// ----- cultoOS -----
// Installs the free Portuguese Bibles shipped with the app (public/bibles) on first run, so scripture works offline out of the box

import { get } from "svelte/store"
import { formatToFileName } from "../components/helpers/show"
import { setActiveScripture } from "../converters/bible"
import { drawerTabsData, scriptures, scripturesCache, special } from "../stores"

const BUNDLED_BIBLES = [
    { id: "cultoos-blivre", file: "./bibles/blivre.fsb" },
    { id: "cultoos-bpm", file: "./bibles/bpm.fsb" }
]

export async function installBundledBibles() {
    // ids are remembered, so a Bible the user deleted is not installed again
    const installed: string[] = get(special).bundledBibles || []
    const pending = BUNDLED_BIBLES.filter(({ id }) => !installed.includes(id) && !get(scriptures)[id])
    if (!pending.length) return

    for (const { id, file } of pending) {
        try {
            const [, bible] = await (await fetch(file)).json()
            scripturesCache.update((a) => {
                a[id] = bible
                return a
            })
            scriptures.update((a) => {
                a[id] = { name: formatToFileName(bible.name), id }
                return a
            })
        } catch (err) {
            console.error("Could not install bundled Bible:", id, err)
            continue
        }

        special.update((a) => {
            a.bundledBibles = [...(a.bundledBibles || []), id]
            return a
        })
    }

    if (!get(drawerTabsData).scripture?.activeSubTab) setActiveScripture(BUNDLED_BIBLES[0].id)
}
