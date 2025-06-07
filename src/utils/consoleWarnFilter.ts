export function filterConsoleWarn(patterns: (string | RegExp)[]): void {
    const originalWarn = console.warn;
    console.warn = (...args: any[]): void => {
        if (args.length > 0) {
            const msg = String(args[0]);
            for (const pattern of patterns) {
                if (typeof pattern === 'string') {
                    if (msg.includes(pattern)) {
                        return;
                    }
                } else {
                    if (pattern.test(msg)) {
                        return;
                    }
                }
            }
        }
        originalWarn.apply(console, args as any);
    };
}
