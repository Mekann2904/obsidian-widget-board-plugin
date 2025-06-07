jest.mock('../../src/utils', () => ({
  safeFetch: jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ title: 't1' }) }))
}));

import { safeFetch } from '../../src/utils';
import { fetchYouTubeTitle, __clearYouTubeTitleCache, __setYouTubeTitleTTL } from '../../src/widgets/tweetWidget/tweetWidgetUtils.ts';

beforeEach(() => {
  __clearYouTubeTitleCache();
  __setYouTubeTitleTTL(1000 * 60 * 60 * 24);
  (safeFetch as jest.Mock).mockClear();
  localStorage.clear();
});

test('caches title result', async () => {
  const title1 = await fetchYouTubeTitle('https://youtu.be/abc');
  expect(title1).toBe('t1');
  expect((safeFetch as jest.Mock).mock.calls.length).toBe(1);

  const title2 = await fetchYouTubeTitle('https://youtu.be/abc');
  expect(title2).toBe('t1');
  expect((safeFetch as jest.Mock).mock.calls.length).toBe(1);
});

test('deduplicates concurrent fetches', async () => {
  const p1 = fetchYouTubeTitle('https://youtu.be/xyz');
  const p2 = fetchYouTubeTitle('https://youtu.be/xyz');
  const [t1, t2] = await Promise.all([p1, p2]);
  expect(t1).toBe('t1');
  expect(t2).toBe('t1');
  expect((safeFetch as jest.Mock).mock.calls.length).toBe(1);
});

