export function debugLog(plugin: { settings?: { debugLogging?: boolean } } | undefined, ...args: any[]): void {
    if (plugin && plugin.settings?.debugLogging) {
        // eslint-disable-next-line no-console
        console.log(...args);
    }
}
