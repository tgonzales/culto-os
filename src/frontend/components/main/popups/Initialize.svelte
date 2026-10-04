<script lang="ts">
    import { onMount } from "svelte"
    import { Main } from "../../../../types/IPC/Main"
    import { requestMain, sendMain } from "../../../IPC/main"
    import { activePopup, dataPath, dictionary, guideActive, language, popupData, timeFormat } from "../../../stores"
    import { BRAND } from "../../../../types/Brand"
    import { newToast } from "../../../utils/common"
    import { createData } from "../../../utils/createData"
    import { pairCultoos, prepareSampleService } from "../../../utils/cultoosCloud"
    import { getLanguageList, setLanguage, translateText } from "../../../utils/language"
    import Icon from "../../helpers/Icon.svelte"
    import T from "../../helpers/T.svelte"
    import HRule from "../../input/HRule.svelte"
    import InputRow from "../../input/InputRow.svelte"
    import MaterialButton from "../../inputs/MaterialButton.svelte"
    import MaterialDropdown from "../../inputs/MaterialDropdown.svelte"
    import MaterialFolderPicker from "../../inputs/MaterialFolderPicker.svelte"
    import MaterialTextInput from "../../inputs/MaterialTextInput.svelte"
    import MaterialToggleSwitch from "../../inputs/MaterialToggleSwitch.svelte"

    // CultoOS: optional church connection on the first run
    let churchCode = ""
    let deviceName = ""

    onMount(async () => {
        if (!$dataPath) sendMain(Main.DATA_PATH)
        deviceName = (await requestMain(Main.GET_DEVICE_NAME)) || ""

        // check time format (based on browser language)
        const locale = navigator.language
        const use12Hour = Intl.DateTimeFormat(locale, { hour: "numeric" }).resolvedOptions().hour12
        if (use12Hour === true) timeFormat.set("12")
    })

    function create() {
        requestMain(Main.GET_PATHS, undefined, (a) => {
            if (!a) return
            createData(a)
            setTimeout(prepareSampleService, 1500)
        })

        sendMain(Main.REFRESH_SHOWS)

        if (churchCode.trim()) {
            pairCultoos(churchCode.trim(), deviceName.trim() || "Computador").then((result) => {
                newToast(result?.success ? "cloud.cultoos_connected" : "cloud.cultoos_invalid_code")
            })
        }

        guideActive.set(true)
        activePopup.set(null)
    }

    function restore() {
        popupData.set({ back: "initialize" })
        activePopup.set("restore")
    }

    $: languageText = translateText("settings.language", $dictionary)
    $: languageLabel = `${languageText}${languageText === "Language" ? "" : "/Language"}`

    // same as Files.svelte
    function updateDataPath(e: any) {
        const oldPath = $dataPath
        const newPath = e.detail

        sendMain(Main.UPDATE_DATA_PATH, { newPath, oldPath })
        dataPath.set(newPath)
    }
</script>

<MaterialButton style="inset-inline-end: 0;" class="popup-options" icon="import" iconSize={1.3} title="setup.restore_data" on:click={restore} white />

<div class="main">
    <p><T id="setup.good_luck" /></p>
    <p style="opacity: 0.8;"><T id="setup.tips" /></p>

    <HRule />

    <p style="margin-bottom: 10px;font-style: italic;font-size: 0.8em;opacity: 0.5;"><T id="setup.change_later" />:</p>

    <InputRow>
        <MaterialDropdown style="width: 50%;" label={languageLabel} value={$language} options={getLanguageList()} on:change={(e) => setLanguage(e.detail)} flags />
        <MaterialToggleSwitch style="width: 50%;" label="settings.use24hClock" checked={$timeFormat === "24"} on:change={(e) => timeFormat.set(e.detail ? "24" : "12")} />
    </InputRow>

    <MaterialFolderPicker PICK_ID="DATA_SHOWS" label={translateText("settings.data_location", $dictionary)} value={$dataPath} on:change={updateDataPath} openButton={false} />

    <!-- CultoOS: connect to the church on the first run (optional) -->
    <p style="margin: 18px 0 6px;font-size: 0.9em;opacity: 0.85;"><T id="setup.cultoos_connect" /></p>
    <InputRow>
        <MaterialTextInput style="width: 50%;" label="cloud.cultoos_code" value={churchCode} placeholder="ABCD-EFGH" on:change={(e) => (churchCode = e.detail)} />
        <MaterialTextInput style="width: 50%;" label="cloud.cultoos_device_name" value={deviceName} on:change={(e) => (deviceName = e.detail)} />
    </InputRow>
    <p style="font-size: 0.85em;opacity: 0.7;margin-top: 6px;">
        <T id="setup.cultoos_no_account" />
        <button class="link" on:click={() => sendMain(Main.URL, `${BRAND.cloudUrl}/cadastro`)}><T id="setup.cultoos_create_account" /></button>
    </p>

    <MaterialButton variant="outlined" class="start" style="font-size: 1.8em;padding: 15px;margin-top: 20px;" on:click={create} white>
        <Icon id="check" size={2.5} />
        <T id="setup.get_started" />
    </MaterialButton>

    <!-- <HRule title="setup.or" />

    <MaterialButton variant="outlined" style="padding: 8px;" on:click={restore} white>
        <Icon id="import" style="margin-inline-start: 0.5em;" size={1.2} white />
        <T id="setup.restore_data" />
    </MaterialButton> -->
</div>

<style>
    .link {
        background: none;
        border: none;
        padding: 0;
        font: inherit;
        color: var(--secondary);
        text-decoration: underline;
        cursor: pointer;
    }

    .main {
        display: flex;
        flex-direction: column;

        width: 50vw;
    }
</style>
