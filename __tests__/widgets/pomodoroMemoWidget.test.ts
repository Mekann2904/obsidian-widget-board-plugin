import { PomodoroMemoWidget } from '../../src/widgets/pomodoro/pomodoroMemoWidget';

describe('PomodoroMemoWidget', () => {
  const dummyApp = {} as any;
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('DOM構造が生成される', () => {
    const widget = new PomodoroMemoWidget(dummyApp, container, { memoContent: 'test' });
    expect(container.querySelector('.pomodoro-memo-container')).toBeTruthy();
    expect((widget as any)['memoDisplayEl']).toBeTruthy();
    expect((widget as any)['memoEditContainerEl']).toBeTruthy();
  });

  it('enterEditModeで編集モードに切り替わる', () => {
    const widget = new PomodoroMemoWidget(dummyApp, container, { memoContent: '' });
    widget.enterEditMode();
    expect(widget.isEditing).toBe(true);
    expect((widget as any)['memoEditContainerEl'].style.display).toBe('flex');
  });

  it('saveChangesで内容が保存されコールバックが呼ばれる', async () => {
    const onSave = jest.fn();
    const widget = new PomodoroMemoWidget(dummyApp, container, { memoContent: 'before' }, onSave);
    widget.enterEditMode();
    (widget as any)['memoEditAreaEl'].value = 'after';
    await widget.saveChanges();
    expect(widget.getMemoContent()).toBe('after');
    expect(onSave).toHaveBeenCalledWith('after');
    expect(widget.isEditing).toBe(false);
  });

  it('cancelEditModeで編集がキャンセルされる', () => {
    const widget = new PomodoroMemoWidget(dummyApp, container, { memoContent: 'x' });
    widget.enterEditMode();
    widget.cancelEditMode();
    expect(widget.isEditing).toBe(false);
  });

  it('setMemoContentで表示が更新される', () => {
    const widget = new PomodoroMemoWidget(dummyApp, container, { memoContent: '' });
    widget.setMemoContent('new');
    expect(widget.getMemoContent()).toBe('new');
    expect((widget as any)['memoDisplayEl'].style.display).toBe('block');
  });
});
