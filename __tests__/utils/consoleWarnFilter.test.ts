import { filterConsoleWarn } from '../../src/utils/consoleWarnFilter';

describe('filterConsoleWarn', () => {
  let originalWarn: any;
  let mockWarn: jest.Mock;
  beforeEach(() => {
    originalWarn = console.warn;
    mockWarn = jest.fn();
    console.warn = mockWarn;
  });
  afterEach(() => {
    console.warn = originalWarn;
  });

  test('filters warnings containing string pattern', () => {
    filterConsoleWarn(['ignore']);
    console.warn('ignore this');
    expect(mockWarn).not.toHaveBeenCalled();

    console.warn('other');
    expect(mockWarn).toHaveBeenCalledWith('other');
  });

  test('filters warnings matching regexp', () => {
    filterConsoleWarn([/skip\d+/]);
    console.warn('skip123');
    expect(mockWarn).not.toHaveBeenCalled();

    console.warn('skip');
    expect(mockWarn).toHaveBeenCalledWith('skip');
  });
});
