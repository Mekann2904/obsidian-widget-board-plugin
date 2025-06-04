// スキーマ駆動フォーム自動生成ユーティリティ
// 各ウィジェットのSCHEMA定数を受け取り、設定フォームを生成する

/**
 * スキーマ型の例:
 * [
 *   { key: 'userId', label: 'ユーザーID', type: 'text', default: '', desc: '...' },
 *   { key: 'mode', label: 'モード', type: 'select', options: ['a','b'], default: 'a', desc: '...' },
 *   ...
 * ]
 */

export type WidgetSettingSchemaItem = {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'boolean' | 'textarea';
  default: any;
  desc?: string;
  options?: any[];
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: string;
  errorMessage?: string;
};

/**
 * スキーマ配列から設定フォームを生成する
 * @param schema スキーマ配列
 * @param values 現在の値オブジェクト
 * @param onChange 値変更時コールバック (key, value) => void
 * @returns HTMLElement (form要素)
 */
export function createSettingsFormFromSchema(
  schema: readonly WidgetSettingSchemaItem[],
  values: Record<string, any>,
  onChange: (key: string, value: any) => void
): HTMLElement {
  const form = document.createElement('form');
  form.className = 'widget-settings-form';
  schema.forEach(item => {
    const row = document.createElement('div');
    row.className = 'widget-setting-row schema-form-row';
    // ラベル
    const label = document.createElement('label');
    label.textContent = item.label + (item.required ? ' *' : '');
    label.htmlFor = `setting-${item.key}`;
    label.className = 'widget-setting-label schema-form-label';
    row.appendChild(label);
    // 入力欄
    let input: HTMLElement;
    const currentValue = values[item.key] ?? item.default;
    let errorDiv: HTMLDivElement | null = null;
    const showError = (msg: string) => {
      if (!errorDiv) {
        errorDiv = document.createElement('div');
        errorDiv.className = 'schema-form-error';
        row.appendChild(errorDiv);
      }
      errorDiv.textContent = msg;
      input.classList.add('schema-form-input-error');
    };
    const clearError = () => {
      if (errorDiv) errorDiv.textContent = '';
      input.classList.remove('schema-form-input-error');
    };
    const validate = (val: any): boolean => {
      if (item.required && (val === '' || val === undefined || val === null)) {
        showError(item.errorMessage || '必須項目です');
        return false;
      }
      if (item.type === 'number') {
        if (item.min !== undefined && val < item.min) {
          showError(item.errorMessage || `最小値は${item.min}です`);
          return false;
        }
        if (item.max !== undefined && val > item.max) {
          showError(item.errorMessage || `最大値は${item.max}です`);
          return false;
        }
      }
      if ((item.type === 'text' || item.type === 'textarea') && item.pattern) {
        const re = new RegExp(item.pattern);
        if (!re.test(val)) {
          showError(item.errorMessage || '形式が正しくありません');
          return false;
        }
      }
      clearError();
      return true;
    };
    switch (item.type) {
      case 'text': {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.value = currentValue ?? '';
        inp.id = `setting-${item.key}`;
        if (item.required) inp.required = true;
        if (item.pattern) inp.pattern = item.pattern;
        inp.oninput = e => {
          const val = (e.target as HTMLInputElement).value;
          if (validate(val)) onChange(item.key, val);
        };
        input = inp;
        break;
      }
      case 'number': {
        const inp = document.createElement('input');
        inp.type = 'number';
        inp.value = currentValue ?? item.default ?? 0;
        inp.id = `setting-${item.key}`;
        if (item.min !== undefined) inp.min = String(item.min);
        if (item.max !== undefined) inp.max = String(item.max);
        if (item.required) inp.required = true;
        inp.oninput = e => {
          const val = Number((e.target as HTMLInputElement).value);
          if (validate(val)) onChange(item.key, val);
        };
        input = inp;
        break;
      }
      case 'select': {
        const sel = document.createElement('select');
        sel.id = `setting-${item.key}`;
        (item.options || []).forEach(opt => {
          const option = document.createElement('option');
          option.value = String(opt);
          option.textContent = String(opt);
          if (opt === currentValue) option.selected = true;
          sel.appendChild(option);
        });
        sel.onchange = e => onChange(item.key, (e.target as HTMLSelectElement).value);
        input = sel;
        break;
      }
      case 'boolean': {
        const inp = document.createElement('input');
        inp.type = 'checkbox';
        inp.checked = !!currentValue;
        inp.id = `setting-${item.key}`;
        inp.onchange = e => onChange(item.key, (e.target as HTMLInputElement).checked);
        input = inp;
        break;
      }
      case 'textarea': {
        const ta = document.createElement('textarea');
        ta.value = currentValue ?? '';
        ta.id = `setting-${item.key}`;
        ta.oninput = e => {
          const val = (e.target as HTMLTextAreaElement).value;
          if (validate(val)) onChange(item.key, val);
        };
        input = ta;
        break;
      }
      default: {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.value = currentValue ?? '';
        inp.id = `setting-${item.key}`;
        inp.oninput = e => onChange(item.key, (e.target as HTMLInputElement).value);
        input = inp;
      }
    }
    input.classList.add('widget-setting-input', 'schema-form-input');
    row.appendChild(input);
    // 説明文
    if (item.desc) {
      const desc = document.createElement('div');
      desc.className = 'widget-setting-desc schema-form-desc';
      desc.textContent = item.desc;
      row.appendChild(desc);
    }
    form.appendChild(row);
  });
  return form;
} 