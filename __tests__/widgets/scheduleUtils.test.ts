import { computeNextTime } from '../../src/widgets/tweetWidget/scheduleUtils';

describe('computeNextTime', () => {
  it('calculates next Monday correctly', () => {
    const now = new Date('2024-05-06T10:00:00Z'); // Monday
    const next = computeNextTime({ hour: 9, minute: 0, daysOfWeek: [1] }, now);
    const expected = new Date('2024-05-13T09:00:00Z').getTime();
    expect(next).toBe(expected);
  });

  it('returns same day when time is in the future', () => {
    const now = new Date('2024-05-06T07:00:00Z'); // Monday
    const next = computeNextTime({ hour: 9, minute: 0, daysOfWeek: [1] }, now);
    const expected = new Date('2024-05-06T09:00:00Z').getTime();
    expect(next).toBe(expected);
  });

  it('handles start and end dates', () => {
    const now = new Date('2024-05-06T10:00:00Z'); // Monday
    const next = computeNextTime(
      { hour: 9, minute: 0, daysOfWeek: [5], startDate: '2024-05-10', endDate: '2024-05-11' },
      now
    );
    const expected = new Date('2024-05-10T09:00:00Z').getTime();
    expect(next).toBe(expected);
  });

  it('returns null when beyond endDate', () => {
    const now = new Date('2024-05-06T10:00:00Z');
    const next = computeNextTime(
      { hour: 9, minute: 0, daysOfWeek: [1], endDate: '2024-05-07' },
      now
    );
    expect(next).toBeNull();
  });

  it('picks earliest day from multiple daysOfWeek', () => {
    const now = new Date('2024-05-06T10:00:00Z'); // Monday
    const next = computeNextTime({ hour: 9, minute: 0, daysOfWeek: [2, 4] }, now);
    const expected = new Date('2024-05-07T09:00:00Z').getTime();
    expect(next).toBe(expected);
  });
});
