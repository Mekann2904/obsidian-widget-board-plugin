export function debugLog(plugin: { settings?: { debugLogging?: boolean } } | undefined, ...args: any[]): void {
    if (plugin && plugin.settings?.debugLogging) {
         
        console.log(...args);
    }
}
