// 多言語対応用ユーティリティ

// 翻訳辞書（必要に応じて拡張）
const translations: Record<string, Record<string, string>> = {
  'settings.language': {
    ja: '言語設定',
    en: 'Language',
  },
  'settings.language.desc': {
    ja: 'プラグインの表示言語を選択します。デフォルトはObsidian本体の言語設定に従います。',
    en: 'Select the display language for the plugin. Default is to follow Obsidian main language.',
  },
  'settings.baseFolder': {
    ja: 'ベースフォルダ（グローバル）',
    en: 'Base Folder (Global)',
  },
  'settings.baseFolder.desc': {
    ja: '全ウィジェット共通のデータ保存先となるVault内のフォルダを指定します（例: myfolder）。\nこのフォルダ配下に各ウィジェットのデータやノートが保存されます。',
    en: 'Specify the folder in your Vault to save data for all widgets (e.g., myfolder). Widget data and notes will be saved under this folder.',
  },
  'settings.debugLogging': {
    ja: 'デバッグログを有効にする',
    en: 'Enable debug logging',
  },
  'settings.debugLogging.desc': {
    ja: 'コンソールに開発用のデバッグ情報を出力します。',
    en: 'Output debug information for development to the console.',
  },
  // ... 必要に応じて追加 ...
};

/**
 * 翻訳関数
 * @param key 翻訳キー
 * @param lang 言語コード（例: 'ja', 'en'）
 * @returns 翻訳文言
 */
export function t(key: string, lang: string): string {
  if (translations[key] && translations[key][lang]) return translations[key][lang];
  if (translations[key] && translations[key]['en']) return translations[key]['en'];
  return key;
} 