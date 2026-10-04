// ----- CultoOS -----
// Single source of truth for product branding (fork of FreeShow, GPL-3.0)

export const BRAND = {
    name: "CultoOS",
    // used when the system language is English or not supported
    defaultLanguage: "pt_BR",
    // used for folders on disk (Documents/<folderName>)
    folderName: "cultoOS",
    // file name prefixes (recordings, exports)
    filePrefix: "cultoOS",
    website: "",
    // CultoOS cloud (web panel + sync API); override with the CULTOOS_CLOUD_URL env var in development
    cloudUrl: "https://culto-os-cloud.vercel.app",
    docsUrl: "",
    supportEmail: "",
    sourceUrl: "https://github.com/tgonzales/culto-os",
    // GitHub "owner/repo" used for update checks (empty = update checks disabled)
    releasesRepo: "tgonzales/culto-os",
    upstream: {
        name: "FreeShow",
        url: "https://github.com/ChurchApps/FreeShow",
        license: "GPL-3.0"
    }
} as const
