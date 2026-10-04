// CultoOS: usage analytics removed (upstream sent events to Google Analytics).
// Exports are kept as no-ops so upstream call sites keep compiling.

export function startTracking() {}

export function trackScriptureUsage(_translationName: string, _apiId: string | null, _verseRef: string) {}
