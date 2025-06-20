import { debugLog } from '../../src/utils/logger';

describe('debugLog', () => {
  let originalLog: any;
  beforeEach(() => {
    originalLog = console.log;
    console.log = jest.fn();
  });
  afterEach(() => {
    console.log = originalLog;
  });

  test('logs when debugLogging enabled', () => {
    const plugin = { settings: { debugLogging: true } };
    debugLog(plugin, 'a', 1);
    expect(console.log).toHaveBeenCalledWith('a', 1);
  });

  test('does nothing when disabled', () => {
    const plugin = { settings: { debugLogging: false } };
    debugLog(plugin, 'b');
    expect(console.log).not.toHaveBeenCalled();
  });

  test('does nothing when plugin undefined', () => {
    debugLog(undefined, 'c');
    expect(console.log).not.toHaveBeenCalled();
  });
});
