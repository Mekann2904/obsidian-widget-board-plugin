jest.mock('../../src/llm/gemini/geminiApi.ts', () => ({
  GeminiProvider: { generateReply: jest.fn() },
}));

const { App } = require('obsidian');

import type { TweetWidgetPost } from '../../src/widgets/tweetWidget/types';
import type { WidgetConfig } from '../../src/interfaces';
import type { ReflectionWidgetSettings } from '../../src/widgets/reflectionWidget/reflectionWidgetTypes';

describe('AI prompt integration', () => {
  beforeAll(() => {
    HTMLCanvasElement.prototype.getContext = jest.fn(() => null);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('generateAiReply substitutes custom prompt and model', async () => {
    const { generateAiReply } = require('../../src/widgets/tweetWidget/aiReply');
    const { GeminiProvider } = require('../../src/llm/gemini/geminiApi.ts');
    const tweet: TweetWidgetPost = {
      id: 't1',
      text: 'Hello',
      created: 0,
      updated: 0,
      files: [],
      like: 0,
      liked: false,
      retweet: 0,
      retweeted: false,
      edited: false,
      replyCount: 0,
      deleted: false,
      bookmark: false,
      contextNote: null,
      threadId: null,
      visibility: 'public',
      noteQuality: 'fleeting',
      taskStatus: null,
      tags: [],
      links: [],
      userId: '@you',
      userName: 'you',
      verified: false,
    };

    (GeminiProvider.generateReply as jest.Mock).mockResolvedValue('ok');

    await generateAiReply({
      tweet,
      allTweets: [tweet],
      llmGemini: { apiKey: 'key', model: 'custom-model' },
      saveReply: jest.fn(),
      parseTags: () => [],
      parseLinks: () => [],
      settings: { userTweetPrompt: 'Prompt {postDate} {tweet}' } as any,
      delay: false,
    });

    expect(GeminiProvider.generateReply).toHaveBeenCalled();
    const [prompt, context] = (GeminiProvider.generateReply as jest.Mock).mock.calls[0];
    expect(prompt).toContain('Prompt');
    expect(prompt).toContain('Hello');
    expect(prompt).not.toContain('{tweet}');
    expect(prompt).not.toContain('{postDate}');
    expect(context.model).toBe('custom-model');
  });

  test('generateAiReply invokes onError on failure', async () => {
    const { generateAiReply } = require('../../src/widgets/tweetWidget/aiReply');
    const { GeminiProvider } = require('../../src/llm/gemini/geminiApi.ts');
    const tweet: TweetWidgetPost = {
      id: 't1',
      text: 'Hello',
      created: 0,
      updated: 0,
      files: [],
      like: 0,
      liked: false,
      retweet: 0,
      retweeted: false,
      edited: false,
      replyCount: 0,
      deleted: false,
      bookmark: false,
      contextNote: null,
      threadId: null,
      visibility: 'public',
      noteQuality: 'fleeting',
      taskStatus: null,
      tags: [],
      links: [],
      userId: '@you',
      userName: 'you',
      verified: false,
    };

    const onError = jest.fn();
    (GeminiProvider.generateReply as jest.Mock).mockRejectedValue(new Error('fail'));

    await generateAiReply({
      tweet,
      allTweets: [tweet],
      llmGemini: { apiKey: 'key', model: 'm' },
      saveReply: jest.fn(),
      parseTags: () => [],
      parseLinks: () => [],
      onError,
      settings: {},
      delay: false,
    });

    expect(onError).toHaveBeenCalled();
  });

  test('ReflectionWidget uses custom prompt and model', async () => {
    const { ReflectionWidget } = require('../../src/widgets/reflectionWidget/reflectionWidget');
    const { GeminiProvider } = require('../../src/llm/gemini/geminiApi.ts');
    const adapter = {
      exists: jest.fn().mockResolvedValue(true),
      read: jest.fn().mockResolvedValue(
        JSON.stringify({ posts: [{ id: 'p1', text: 'hi', created: Date.now(), userId: '@you' }] })
      ),
      write: jest.fn(),
    };
    const app = { vault: { adapter } } as unknown as App;
    const plugin = {
      settings: {
        weekStartDay: 1,
        userSummaryPromptToday: 'Summary {posts}',
        reflectionAiModel: 'model-x',
        llm: { gemini: { apiKey: 'key' } },
      },
      getTweetPostCounts: () => Array(7).fill(0),
      tweetChartDirty: true,
      llmManager: { generateReplyWithDefault: jest.fn().mockResolvedValue('res') },
    } as any;
    const config: WidgetConfig = {
      id: 'w',
      type: 'reflection-widget',
      title: 'r',
      settings: { period: 'today' } as ReflectionWidgetSettings,
    };

    const widget = new ReflectionWidget();
    widget.create(config, app, plugin);
    if (widget['ui']) {
      await widget['ui']['runSummary'](true);
      const call = plugin.llmManager.generateReplyWithDefault.mock.calls[0];
      expect(call[0]).toContain('Summary');
      expect(call[0]).toContain('hi');
      expect(call[0]).not.toContain('{posts}');
      expect(call[1].model).toBe('model-x');
    }
  });

  test('loadReflectionSummaryShared caches results', async () => {
    jest.resetModules();
    const { loadReflectionSummaryShared } = require('../../src/widgets/reflectionWidget/reflectionWidgetUI.ts');
    const adapter = {
      exists: jest.fn().mockResolvedValue(true),
      read: jest.fn().mockResolvedValue(
        JSON.stringify({ reflectionSummaries: { today: { date: 'd', summary: 's', html: '<p>s</p>', postCount: 1 } } })
      ),
      write: jest.fn(),
    };
    const app = { vault: { adapter } } as unknown as App;

    const res1 = await loadReflectionSummaryShared('today', 'd', app);
    expect(adapter.read).toHaveBeenCalledTimes(1);
    const res2 = await loadReflectionSummaryShared('today', 'd', app);
    expect(adapter.read).toHaveBeenCalledTimes(1);
    expect(res2).toEqual(res1);
  });
});
