# ThemeSwitcherWidget テスト仕様書

## 概要
- 対象: `src/widgets/theme-switcher/index.ts` `ThemeSwitcherWidget`
- 目的: テーマ切替ウィジェットのUI・テーマ切替・異常系・設定反映の仕様検証

---

## テストケース一覧

| No. | テスト内容                                         | 目的                                 | 結果 | 備考 |
|-----|----------------------------------------------------|--------------------------------------|------|------|
| 1   | DOM構造・クラス・タイトルの付与                    | UI要素・タイトルの正しい表示         |      |      |
| 2   | テーマ一覧の描画                                   | テーマリストが正しく表示される       |      |      |
| 3   | テーマ切替時のsetTheme/Notice/activeクラス切替      | テーマ切替の副作用・UI反映           |      |      |
| 4   | 既に適用済みテーマクリック時のNotice                | 二重適用時の通知                     |      |      |
| 5   | テーマ一覧が空の場合の表示                         | デフォルトのみ表示される             |      |      |
| 6   | customCss未定義時のエラーメッセージ                 | API未提供時の異常系                  |      |      |
| 7   | themesがobject型でもリスト化される                  | 柔軟なテーマリスト取得               |      |      |
| 8   | applyWidgetSizeが呼ばれる（設定反映）               | 設定値のUI反映                       |      |      |

---

## 各テストケース詳細

### 1. DOM構造・クラス・タイトルの付与
- **テスト対象**: `ThemeSwitcherWidget.create`
- **目的**: theme-switcher-widgetクラスやタイトルが正しく付与されるか
- **前提条件**: ダミーconfig/app/pluginを用意
- **入力値・操作**: `widget.create(config, app, plugin)`
- **期待結果**: .theme-switcher-widgetクラスとタイトルが表示される
- **手順**:
  1. ダミーconfig/app/pluginを用意
  2. createを呼び出す
  3. DOM構造・タイトルを検証
- **実施結果記録**:

---

### 2. テーマ一覧の描画
- **テスト対象**: `ThemeSwitcherWidget.create`, `renderThemeSelector`
- **目的**: テーマリストが正しく描画されるか
- **前提条件**: customCss.themesに複数テーマを設定
- **入力値・操作**: create呼び出し
- **期待結果**: .theme-switcher-itemが複数生成される
- **手順**:
  1. customCss.themesに複数テーマを設定
  2. create呼び出し
  3. リスト要素数を検証
- **実施結果記録**:

---

### 3. テーマ切替時のsetTheme/Notice/activeクラス切替
- **テスト対象**: `ThemeSwitcherWidget.renderThemeSelector` のクリックイベント
- **目的**: setTheme/Notice/activeクラスの切替が正しく行われるか
- **前提条件**: customCss.setThemeをjest.fnでモック
- **入力値・操作**: テーマリストのliをクリック
- **期待結果**: setTheme/Notice/activeクラスが正しく動作
- **手順**:
  1. create呼び出し
  2. 任意のliをクリック
  3. setTheme/Notice/activeクラスを検証
- **実施結果記録**:

---

### 4. 既に適用済みテーマクリック時のNotice
- **テスト対象**: `ThemeSwitcherWidget.renderThemeSelector` のクリックイベント
- **目的**: 既に適用済みテーマをクリックした際のNotice表示
- **前提条件**: customCss.themeを適用済みテーマに設定
- **入力値・操作**: activeなliをクリック
- **期待結果**: 「すでにこのテーマが適用されています。」のNotice
- **手順**:
  1. create呼び出し
  2. activeなliをクリック
  3. Notice表示を検証
- **実施結果記録**:

---

### 5. テーマ一覧が空の場合の表示
- **テスト対象**: `ThemeSwitcherWidget.renderThemeSelector`
- **目的**: テーマ一覧が空の場合にデフォルトのみ表示されるか
- **前提条件**: customCss.themes = []
- **入力値・操作**: create呼び出し
- **期待結果**: デフォルトのみリスト表示
- **手順**:
  1. customCss.themes = []
  2. create呼び出し
  3. リスト要素数・内容を検証
- **実施結果記録**:

---

### 6. customCss未定義時のエラーメッセージ
- **テスト対象**: `ThemeSwitcherWidget.renderThemeSelector`
- **目的**: customCss未定義時にエラーメッセージが表示されるか
- **前提条件**: app.customCss未定義
- **入力値・操作**: create呼び出し
- **期待結果**: 「テーマ切り替えAPIが利用できません。」の表示
- **手順**:
  1. app.customCss未定義
  2. create呼び出し
  3. メッセージ表示を検証
- **実施結果記録**:

---

### 7. themesがobject型でもリスト化される
- **テスト対象**: `ThemeSwitcherWidget.renderThemeSelector`
- **目的**: themesがobject型でもリスト化されるか
- **前提条件**: customCss.themes = { a: 'moonstone', b: 'dracula', c: { name: 'solarized' } }
- **入力値・操作**: create呼び出し
- **期待結果**: dracula/solarized等がリストに含まれる
- **手順**:
  1. customCss.themesをobject型で設定
  2. create呼び出し
  3. リスト内容を検証
- **実施結果記録**:

---

### 8. applyWidgetSizeが呼ばれる（設定反映）
- **テスト対象**: `ThemeSwitcherWidget.create`, `applyWidgetSize`
- **目的**: 設定値がapplyWidgetSize経由でUIに反映されるか
- **前提条件**: applyWidgetSizeをjest.spyOnで監視
- **入力値・操作**: create呼び出し
- **期待結果**: applyWidgetSizeが呼ばれる
- **手順**:
  1. spyOnでapplyWidgetSizeを監視
  2. create呼び出し
  3. 呼び出し有無を検証
- **実施結果記録**:

---

## 進捗・メモ

- [ ] ケース1 実施済み
- [ ] ケース2 未実施
- [ ] ケース3 未実施
- [ ] ケース4 未実施
- [ ] ケース5 未実施
- [ ] ケース6 未実施
- [ ] ケース7 未実施
- [ ] ケース8 未実施 