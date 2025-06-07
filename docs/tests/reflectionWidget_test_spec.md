# ReflectionWidget テスト仕様書

## 概要
- 対象: `src/widgets/reflectionWidget/reflectionWidget.ts` `ReflectionWidget`
- 目的: 振り返りウィジェットのUI・設定反映・UI再描画の仕様検証

---

## テストケース一覧

| No. | テスト内容                                 | 目的                                 | 結果 | 備考 |
|-----|--------------------------------------------|--------------------------------------|------|------|
| 1   | DOM構造・UIインスタンス生成                | UI要素・UIクラスの生成               |      |      |
| 2   | create時にUIのrenderが呼ばれる             | UI初期化の副作用                     |      |      |
| 3   | updateExternalSettingsで設定反映・refresh   | 設定反映・UI再描画トリガー           |      |      |
| 4   | refreshでUIのscheduleRenderが呼ばれる       | UI再描画のトリガー                   |      |      |
| 5   | uiがnullでもrefreshでエラーにならない       | 異常系の安全性                       |      |      |

---

## 各テストケース詳細

### 1. DOM構造・UIインスタンス生成
- **テスト対象**: `ReflectionWidget.create`
- **目的**: reflection-widgetクラスやUIインスタンスが正しく生成されるか
- **前提条件**: ダミーconfig/app/pluginを用意
- **入力値・操作**: `widget.create(config, app, plugin)`
- **期待結果**: reflection-widgetクラスとUIインスタンスが生成される
- **手順**:
  1. ダミーconfig/app/pluginを用意
  2. createを呼び出す
  3. DOMとUIインスタンスを検証
- **実施結果記録**:

---

### 2. create時にUIのrenderが呼ばれる
- **テスト対象**: `ReflectionWidget.create`, `ReflectionWidgetUI.render`
- **目的**: create時にUIのrenderが呼ばれるか
- **前提条件**: ケース1と同じ
- **入力値・操作**: create呼び出し
- **期待結果**: UIインスタンスのrenderが呼ばれる（エラーなく生成される）
- **手順**:
  1. create呼び出し
  2. UIインスタンスの存在を検証
- **実施結果記録**:

---

### 3. updateExternalSettingsで設定反映・refresh
- **テスト対象**: `ReflectionWidget.updateExternalSettings`, `ReflectionWidget.refresh`
- **目的**: updateExternalSettingsで設定値が反映され、refreshが呼ばれるか
- **前提条件**: ケース1と同じ
- **入力値・操作**: updateExternalSettingsで設定値を変更
- **期待結果**: config.settingsが新しい値になり、refreshが呼ばれる
- **手順**:
  1. create呼び出し
  2. updateExternalSettingsで値を変更
  3. config.settingsとrefresh呼び出しを検証
- **実施結果記録**:

---

### 4. refreshでUIのscheduleRenderが呼ばれる
- **テスト対象**: `ReflectionWidget.refresh`, `ReflectionWidgetUI.scheduleRender`
- **目的**: refreshでUIのscheduleRenderが呼ばれるか
- **前提条件**: ケース1と同じ
- **入力値・操作**: refresh呼び出し
- **期待結果**: UIインスタンスのscheduleRenderが呼ばれる
- **手順**:
  1. create呼び出し
  2. refresh呼び出し
  3. scheduleRenderの呼び出しを検証
- **実施結果記録**:

---

### 5. uiがnullでもrefreshでエラーにならない
- **テスト対象**: `ReflectionWidget.refresh`
- **目的**: uiがnullでもrefreshでエラーにならないか
- **前提条件**: ケース1と同じ
- **入力値・操作**: uiをnullにしてrefresh呼び出し
- **期待結果**: エラーが発生しない
- **手順**:
  1. create呼び出し
  2. uiをnullに設定
  3. refresh呼び出し
  4. エラーが発生しないことを検証
- **実施結果記録**:

---

## 進捗・メモ

- [ ] ケース1 実施済み
- [ ] ケース2 未実施
- [ ] ケース3 未実施
- [ ] ケース4 未実施
- [ ] ケース5 未実施 