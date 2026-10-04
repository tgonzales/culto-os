<script lang="ts">
    import { onMount } from "svelte"
    import { Main } from "../../../../types/IPC/Main"
    import { requestMain } from "../../../IPC/main"
    import { statusIndicator } from "../../../stores"
    import { cultoosCloud, cultoosSyncNow, disconnectCultoos, pairCultoos, refreshCultoosStatus } from "../../../utils/cultoosCloud"
    import { translateText } from "../../../utils/language"
    import { confirmCustom } from "../../../utils/popup"
    import T from "../../helpers/T.svelte"
    import InputRow from "../../input/InputRow.svelte"
    import MaterialButton from "../../inputs/MaterialButton.svelte"
    import MaterialTextInput from "../../inputs/MaterialTextInput.svelte"

    let code = ""
    let deviceName = ""
    let error = ""
    let pairing = false

    onMount(async () => {
        refreshCultoosStatus()
        deviceName = (await requestMain(Main.GET_DEVICE_NAME)) || ""
    })

    async function connect() {
        if (!code.trim()) return
        pairing = true
        error = ""
        const result = await pairCultoos(code.trim(), deviceName.trim() || "Computador")
        pairing = false
        if (result?.success) code = ""
        else error = result?.error === "invalid_code" ? "cloud.cultoos_invalid_code" : "cloud.cultoos_connection_failed"
    }

    async function disconnect() {
        if (await confirmCustom(translateText("cloud.cultoos_disconnect_confirm"))) disconnectCultoos()
    }

    $: lastSync = $cultoosCloud.lastSync ? new Date($cultoosCloud.lastSync).toLocaleString() : ""
</script>

{#if $cultoosCloud.connected}
    <InputRow>
        <MaterialButton style="flex: 1;border-bottom: 2px solid var(--connected) !important;" icon="church" on:click={disconnect}>
            {$cultoosCloud.churchName}
            <span style="opacity: 0.6;font-size: 0.8em;margin-left: 8px;"><T id="cloud.cultoos_disconnect" /></span>
        </MaterialButton>
        <MaterialButton icon="cloud_sync" disabled={$statusIndicator === "syncing"} on:click={() => cultoosSyncNow(true)}>
            <T id="cloud.sync" />
        </MaterialButton>
    </InputRow>
    {#if lastSync}
        <p style="opacity: 0.6;font-size: 0.85em;padding: 6px 12px;"><T id="cloud.cultoos_last_sync" />: {lastSync}</p>
    {/if}
{:else}
    <p style="opacity: 0.8;font-size: 0.9em;padding: 6px 12px;"><T id="cloud.cultoos_info" /></p>
    <InputRow>
        <MaterialTextInput label="cloud.cultoos_code" value={code} placeholder="ABCD-EFGH" on:change={(e) => (code = e.detail)} />
        <MaterialTextInput label="cloud.cultoos_device_name" value={deviceName} on:change={(e) => (deviceName = e.detail)} />
        <MaterialButton icon="login" disabled={pairing || !code.trim()} on:click={connect}>
            <T id="cloud.cultoos_connect" />
        </MaterialButton>
    </InputRow>
    {#if error}
        <p style="color: var(--secondary);font-size: 0.9em;padding: 6px 12px;"><T id={error} /></p>
    {/if}
{/if}
