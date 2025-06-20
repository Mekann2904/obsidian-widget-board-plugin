import { pad2, getDateKey, getDateKeyLocal, getWeekRange } from '../../src/utils/date';

describe('date utility functions', () => {
  test('pad2 pads single digits', () => {
    expect(pad2(3)).toBe('03');
    expect(pad2(12)).toBe('12');
  });

  test('getDateKey returns ISO date', () => {
    const d = new Date('2024-06-01T12:34:56Z');
    expect(getDateKey(d)).toBe('2024-06-01');
  });

  test('getDateKeyLocal returns local date string', () => {
    const d = new Date(2024, 5, 1, 10, 20, 0);
    expect(getDateKeyLocal(d)).toBe('2024-06-01');
  });

  test('getWeekRange calculates start and end of week', () => {
    jest.useFakeTimers().setSystemTime(new Date('2024-06-05T00:00:00Z'));
    expect(getWeekRange(0)).toEqual(['2024-06-02', '2024-06-08']);
    expect(getWeekRange(1)).toEqual(['2024-06-03', '2024-06-09']);
    jest.useRealTimers();
  });
});
