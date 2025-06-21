import { PomodoroWidget } from '../../src/widgets/pomodoro';
import { DEFAULT_POMODORO_SETTINGS } from '../../src/settings/defaultWidgetSettings';
import type { WidgetConfig } from '../../src/interfaces';
import * as i18n from '../../src/i18n';

// i18n t-function mock
jest.spyOn(i18n, 't').mockImplementation((lang, key, vars) => {
  const translations: { [key: string]: string } = {
    pause: '一時停止',
    start: '開始',
    reset: 'リセット',
    nextSession: '次のセッションへ',
    workStatus: `作業中 (${vars?.minutes}分)`,
    shortBreakStatus: `短い休憩 (${vars?.minutes}分)`,
    longBreakStatus: `長い休憩 (${vars?.minutes}分)`,
    currentCycle: `現在のサイクル: ${vars?.completed} / ${vars?.total}`,
    pomodoroTimer: 'ポモドーロタイマー',
  };
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  return translations[key] || key;
});

describe('PomodoroWidget 詳細テスト', () => {
  let dummyConfig: WidgetConfig;
  let dummyApp: any;
  let dummyPlugin: any;

  beforeEach(() => {
    dummyConfig = {
      id: 'test-pomodoro',
      type: 'pomodoro',
      title: 'テストポモドーロ',
      settings: { ...DEFAULT_POMODORO_SETTINGS }
    };
    dummyApp = { vault: { adapter: { exists: jest.fn(), mkdir: jest.fn(), read: jest.fn(), write: jest.fn() } } };
    dummyPlugin = { settings: { boards: [] }, manifest: { id: 'test-plugin' }, saveData: jest.fn() };
  });

  it('createでpomodoro-timer-widgetクラスとUI要素が生成される', () => {
    const widget = new PomodoroWidget();
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    expect(el.classList.contains('pomodoro-timer-widget')).toBe(true);
    expect(el.querySelector('.pomodoro-time-display')).toBeTruthy();
    expect(el.querySelector('.pomodoro-status-display')).toBeTruthy();
    expect(el.querySelector('.pomodoro-controls')).toBeTruthy();
  });

  it('startTimerでisRunningがtrueになりUIが更新される', () => {
    const widget = new PomodoroWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    widget['startTimer']();
    expect(widget['isRunning']).toBe(true);
    expect(widget['startPauseButton'].getAttribute('aria-label')).toBe('一時停止');
  });

  it('pauseTimerでisRunningがfalseになりUIが更新される', () => {
    const widget = new PomodoroWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    widget['startTimer']();
    widget['pauseTimer']();
    expect(widget['isRunning']).toBe(false);
    expect(widget['startPauseButton'].getAttribute('aria-label')).toBe('開始');
  });

  it('resetTimerStateで残り時間が初期化される', () => {
    const widget = new PomodoroWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    widget['remainingTime'] = 10;
    widget['resetTimerState']('work', true);
    expect(widget['remainingTime']).toBe(widget['currentSettings'].workMinutes * 60);
    expect(widget['widgetEl'].style.backgroundImage).toBe('');
  });

  it('skipToNextSessionConfirmでcurrentPomodoroSetが変化する', () => {
    const widget = new PomodoroWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    const before = widget['currentPomodoroSet'];
    widget['skipToNextSessionConfirm']();
    expect(widget['currentPomodoroSet']).not.toBe(before);
  });

  it('handleSessionEndでisRunningがfalseになり次セッションに進む', async () => {
    const widget = new PomodoroWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    widget['isRunning'] = true;
    await widget['handleSessionEnd']();
    expect(widget['isRunning']).toBe(false);
  });

  it('メモ編集でmemoContentが更新される', async () => {
    const widget = new PomodoroWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    await widget['renderMemo']('テストメモ内容');
    expect(widget['currentSettings'].memoContent).toBe('テストメモ内容');
  });

  it('updateExternalSettingsで各種設定が反映される', async () => {
    const widget = new PomodoroWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    await widget.updateExternalSettings({ workMinutes: 50, backgroundImageUrl: 'url', notificationSound: 'bell' });
    expect(widget['currentSettings'].workMinutes).toBe(50);
    expect(widget['currentSettings'].backgroundImageUrl).toBe('url');
    expect(widget['currentSettings'].notificationSound).toBe('bell');
  });

  it('getWidgetIdでconfig.idが返る', () => {
    const widget = new PomodoroWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    expect(widget.getWidgetId()).toBe(dummyConfig.id);
  });

  it('onunloadでインスタンスが削除される', () => {
    const widget = new PomodoroWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    widget.onunload();
    expect((PomodoroWidget as any).widgetInstances.has(dummyConfig.id)).toBe(false);
  });

  it('removePersistentInstanceでインスタンスが削除される', () => {
    const widget = new PomodoroWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    PomodoroWidget.removePersistentInstance(dummyConfig.id);
    expect((PomodoroWidget as any).widgetInstances.has(dummyConfig.id)).toBe(false);
  });

  it('cleanupAllPersistentInstancesですべてのインスタンスが削除される', () => {
    const widget1 = new PomodoroWidget();
    const widget2 = new PomodoroWidget();
    widget1.create({ ...dummyConfig, id: 'id1' }, dummyApp, dummyPlugin);
    widget2.create({ ...dummyConfig, id: 'id2' }, dummyApp, dummyPlugin);
    PomodoroWidget.cleanupAllPersistentInstances();
    expect((PomodoroWidget as any).widgetInstances.size).toBe(0);
  });

  it('背景画像が設定されるとUIに反映される', async () => {
    const widget = new PomodoroWidget();
    // 初期は背景画像なし
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    expect(widget['widgetEl'].classList.contains('has-background-image')).toBe(false);
    expect(widget['widgetEl'].style.backgroundImage).toBe('');
    // 背景画像を設定
    await widget.updateExternalSettings({ backgroundImageUrl: 'https://example.com/bg.png' });
    expect(widget['widgetEl'].classList.contains('has-background-image')).toBe(true);
    expect(widget['widgetEl'].style.backgroundImage).toBe('url("https://example.com/bg.png")');
    // 背景画像を解除
    await widget.updateExternalSettings({ backgroundImageUrl: '' });
    expect(widget['widgetEl'].classList.contains('has-background-image')).toBe(false);
    expect(widget['widgetEl'].style.backgroundImage).toBe('');
  });

  it('resetCurrentTimerConfirmを2回連続で呼ぶとサイクル数がリセットされる', () => {
    const widget = new PomodoroWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    // サイクル数を仮に3にする
    widget['pomodorosCompletedInCycle'] = 3;
    // 1回目のリセット（サイクル数は維持）
    widget['resetCurrentTimerConfirm']();
    expect(widget['pomodorosCompletedInCycle']).toBe(3);
    // 2回目のリセット（サイクル数がリセット）
    widget['resetCurrentTimerConfirm']();
    expect(widget['pomodorosCompletedInCycle']).toBe(0);
    // UI上も反映されているか
    const el = widget['widgetEl'];
    const cycleEl = el.querySelector('.pomodoro-cycle-display');
    expect(cycleEl?.textContent).toBe('現在のサイクル: 0 / 4');
  });

  it('playSoundNotificationで通知音が再生される（default_beep/bell/chime/off/異常系）', () => {
    const originalError = console.error;
    console.error = jest.fn(); // エラー出力を抑制
    try {
      const widget = new PomodoroWidget();
      widget.create(dummyConfig, dummyApp, dummyPlugin);
      // AudioContextを完全にモック
      const oscMock = {
        connect: jest.fn(),
        start: jest.fn(),
        stop: jest.fn(),
        onended: jest.fn(),
        frequency: { setValueAtTime: jest.fn() },
        type: '',
      };
      const gainMock = {
        connect: jest.fn(),
        gain: { setValueAtTime: jest.fn(), exponentialRampToValueAtTime: jest.fn() },
      };
      const ctxMock = {
        createOscillator: jest.fn(() => oscMock),
        createGain: jest.fn(() => gainMock),
        currentTime: 0,
        destination: {},
        state: 'running',
        close: jest.fn(),
      };
      (widget as any).soundPlayer.audioContext = ctxMock;
      // default_beep
      (widget as any).currentSettings.notificationSound = 'default_beep';
      expect(() => (widget as any).playSoundNotification()).not.toThrow();
      // bell/chime
      global.HTMLAudioElement = jest.fn(() => ({ play: jest.fn(), pause: jest.fn(), currentTime: 0 })) as any;
      (widget as any).currentSettings.notificationSound = 'bell';
      expect(() => (widget as any).playSoundNotification()).not.toThrow();
      (widget as any).currentSettings.notificationSound = 'chime';
      expect(() => (widget as any).playSoundNotification()).not.toThrow();
      // off
      (widget as any).currentSettings.notificationSound = 'off';
      expect(() => (widget as any).playSoundNotification()).not.toThrow();
      // 異常系: ctx.createOscillatorが例外をthrow
      ctxMock.createOscillator = jest.fn(() => { throw new Error('fail'); });
      (widget as any).currentSettings.notificationSound = 'default_beep';
      expect(() => (widget as any).playSoundNotification()).not.toThrow();
      // 異常系: ctx.createOscillatorがundefinedを返す
      ctxMock.createOscillator = jest.fn(() => undefined) as any;
      expect(() => (widget as any).playSoundNotification()).not.toThrow();
      // 異常系: osc.frequencyがundefined
      ctxMock.createOscillator = jest.fn(() => ({
        connect: jest.fn(),
        start: jest.fn(),
        stop: jest.fn(),
        onended: jest.fn(),
        // frequency: undefined intentionally omitted
        type: '',
      })) as any;
      expect(() => (widget as any).playSoundNotification()).not.toThrow();
    } finally {
      console.error = originalError;
    }
  });

  it('exportSessionLogsで各フォーマットのファイルが出力される', async () => {
    const widget = new PomodoroWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    widget['sessionLogs'] = [
      { date: '2024-01-01', start: '10:00', end: '10:25', memo: 'test', sessionType: 'work' }
    ];
    dummyApp.vault.adapter.exists.mockResolvedValue(false);
    dummyApp.vault.adapter.mkdir.mockResolvedValue();
    dummyApp.vault.adapter.write.mockResolvedValue();
    dummyApp.vault.adapter.read.mockResolvedValue('');
    // CSV
    await widget['exportSessionLogs']('csv');
    // JSON
    await widget['exportSessionLogs']('json');
    // Markdown
    await widget['exportSessionLogs']('markdown');
    // none/unknown
    await widget['exportSessionLogs']('none');
    expect(dummyApp.vault.adapter.write).toHaveBeenCalled();
  });

  it('メモ編集の保存・キャンセルが正しく動作する', async () => {
    const widget = new PomodoroWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    // 保存
    await widget['renderMemo']('保存テスト');
    expect(widget['currentSettings'].memoContent).toBe('保存テスト');
    // キャンセル（エミュレート: 編集→キャンセル→内容が元に戻る）
    if (widget['memoWidget']) {
      widget['memoWidget'].setMemoContent('一時編集');
      widget['memoWidget'].cancelEditMode();
      // キャンセル後もcurrentSettings.memoContentは保存前の値
      expect(widget['currentSettings'].memoContent).toBe('保存テスト');
    }
  });

  it('handleSessionEndでメモ内容がセッションログに記録される', async () => {
    const widget = new PomodoroWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    await widget['renderMemo']('セッションメモ');
    widget['isRunning'] = true;
    widget['currentPomodoroSet'] = 'work';
    widget['currentSessionStartTime'] = new Date('2024-01-01T10:00:00');
    widget['currentSessionEndTime'] = new Date('2024-01-01T10:25:00');
    await widget['handleSessionEnd']();
    expect(widget['sessionLogs'].some(log => log.memo === 'セッションメモ')).toBe(true);
  });

  it('複数インスタンスが独立して動作する', () => {
    const widget1 = new PomodoroWidget();
    const widget2 = new PomodoroWidget();
    widget1.create({ ...dummyConfig, id: 'id1' }, dummyApp, dummyPlugin);
    widget2.create({ ...dummyConfig, id: 'id2' }, dummyApp, dummyPlugin);
    widget1['pomodorosCompletedInCycle'] = 2;
    widget2['pomodorosCompletedInCycle'] = 5;
    widget1['resetCurrentTimerConfirm']();
    widget2['resetCurrentTimerConfirm']();
    expect(widget1['pomodorosCompletedInCycle']).toBe(2);
    expect(widget2['pomodorosCompletedInCycle']).toBe(5);
    widget1['resetCurrentTimerConfirm']();
    widget2['resetCurrentTimerConfirm']();
    expect(widget1['pomodorosCompletedInCycle']).toBe(0);
    expect(widget2['pomodorosCompletedInCycle']).toBe(0);
  });

  it('不正値設定や多重操作でエラーや不整合が発生しない', async () => {
    const widget = new PomodoroWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    // 不正値
    await expect(widget.updateExternalSettings({ workMinutes: -1, shortBreakMinutes: 0 })).resolves.not.toThrow();
    // 多重操作
    for (let i = 0; i < 5; i++) {
      widget['resetCurrentTimerConfirm']();
      widget['startTimer']();
      widget['pauseTimer']();
    }
    expect(widget['isRunning']).toBe(false);
  });

  // E2E/Obsidian再起動/通知・エクスポート一連動作はシステムテスト・手動/自動E2Eでカバー推奨
}); 