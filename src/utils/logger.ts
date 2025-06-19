export function debugLog(
    plugin: { settings?: { debugLogging?: boolean } } | undefined,
    ...args: unknown[]
): void {
    if (plugin && plugin.settings?.debugLogging) {
         
        console.log(...(args as Parameters<typeof console.log>));
    }
}
