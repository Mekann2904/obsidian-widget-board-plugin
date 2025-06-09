import { computeNextTime } from '../../src/widgets/tweetWidget/scheduleUtils';

describe('computeNextTime', () => {
  it('calculates next Monday correctly', () => {
    const now = new Date('2024-05-06T10:00:00Z'); // Monday
    const next = computeNextTime({ hour: 9, minute: 0, daysOfWeek: [1] }, now);
    const expected = new Date('2024-05-13T09:00:00Z').getTime();
    expect(next).toBe(expected);
  });
});
