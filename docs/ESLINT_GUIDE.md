# ESLint ガイド

本ドキュメントは、Obsidian Widget Board Plugin開発時のESLint活用方法・ルールカスタマイズ・トラブルシューティングについてまとめたものです。

---

## 目次
- [ESLint ガイド](#eslint-ガイド)
  - [目次](#目次)
  - [基本的な使い方](#基本的な使い方)
  - [デバッグモード](#デバッグモード)
  - [ルールのカスタマイズ](#ルールのカスタマイズ)
  - [よくあるエラーと対処法](#よくあるエラーと対処法)
  - [FAQ](#faq)
    - [Q. ルールを一時的に無効化したい](#q-ルールを一時的に無効化したい)
    - [Q. Obsidian API特有の型エラーが出る](#q-obsidian-api特有の型エラーが出る)
    - [Q. ルールをプロジェクト全体で統一したい](#q-ルールをプロジェクト全体で統一したい)

---

## 基本的な使い方

```bash
# src配下のTypeScriptファイルをチェック
eslint ./src --ext .ts
```

- エラーや警告が表示された場合は、内容を確認し修正してください。
- ルールに従っていない場合、CIやレビューで指摘されることがあります。

## デバッグモード

ESLintの動作詳細を確認したい場合は `--debug` オプションを付与します。

```bash
eslint ./src --ext .ts --debug
```

- ルールの適用順序や設定ファイルの読み込み状況などが詳細に出力されます。
- 設定トラブル時の原因特定に役立ちます。

## ルールのカスタマイズ

- ルートの `eslint.config.mjs` でルールやパーサ、プラグインを設定しています。
- 独自ルールを追加したい場合はこのファイルを編集してください。
- ルール例:

```js
module.exports = {
  // ...
  rules: {
    'semi': ['error', 'always'],
    'quotes': ['error', 'single'],
    // 追加ルール
  },
};
```

- ルール変更後は必ず `eslint ./src --ext .ts` で動作確認を行ってください。

## よくあるエラーと対処法

- **"Parsing error: Cannot find module '@typescript-eslint/parser'"**
  - `npm install` で依存パッケージを再インストールしてください。
- **"No ESLint configuration found"**
  - ルートに `eslint.config.mjs` が存在するか確認してください。
- **TypeScriptの型エラー**
  - ESLintは型チェックも行うため、型定義ファイルや `tsconfig.json` の設定も確認してください。

## FAQ

### Q. ルールを一時的に無効化したい
A. ファイル単位や行単位で `// eslint-disable` コメントを利用できます。

### Q. Obsidian API特有の型エラーが出る
A. `@types/obsidian` など型定義が不足していないか確認してください。

### Q. ルールをプロジェクト全体で統一したい
A. `eslint.config.mjs` を編集し、チームで共有してください。

---

その他不明点は [ESLint公式ドキュメント](https://eslint.org/docs/latest/) も参照してください。 