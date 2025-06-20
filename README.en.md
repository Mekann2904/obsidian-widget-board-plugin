# Obsidian Widget Board Plugin

[Japanese README is available here.](README.md)

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Main Features](#main-features)
4. [Usage](#usage)
5. [User Prompt Feature (AI Summary & AI Reply Customization)](#user-prompt-feature-ai-summary--ai-reply-customization)
6. [For Developers](#for-developers--performance-optimization)
7. [Installation](#installation)
8. [License](#license)

## Overview

Obsidian Widget Board Plugin allows you to create a "widget board" in Obsidian, where you can freely arrange and manage multiple useful widgets (Pomodoro timer, memo, calendar, timer/stopwatch, recent notes, theme switcher, etc.).

> **For how to create/extend widgets, please refer to [WIDGET_DEV_GUIDE.md](docs/WIDGET_DEV_GUIDE.md) and the performance design guide [WIDGET_PERFORMANCE_GUIDE.md](docs/WIDGET_PERFORMANCE_GUIDE.md).**
> **For the file format of Pomodoro work logs, see [logs/README.md](logs/README.md).**

---

## Quick Start

1. Enable this plugin from **Settings → Community Plugins** in Obsidian.
2. Click the "Widget Board" icon in the sidebar to open the initial board.
3. Add and rearrange widgets from **Board Management** in the settings screen to customize your board.
4. For widgets like the Tweet Widget, set up the initial settings such as the save folder.

## Prerequisites

To clone and build this repository, you need:

- Node.js 16 or higher
- npm (latest version recommended)

Build steps:

```bash
npm install
npm run build
```

Place the generated files in `<Vault>/.obsidian/plugins/obsidian-widget-board-plugin/`.

---

## Main Features

- **Create and manage multiple widget boards**
    - Create multiple boards and freely add/rearrange widgets for each use case.
    - Select display mode (panel width) per board.
- **Widget types**
    - Pomodoro timer
    - Memo (Markdown supported)
    - Calendar
    - Timer/Stopwatch
    - Recent notes list
    - Theme switcher
    - **Tweet widget**
- **Each widget has its own title/settings and can be rearranged or deleted within the board**
- **Global and individual settings for notification sounds and volume**
- **Hotkeys for quickly opening/closing each board**
- **Automatic export of Pomodoro work logs (CSV/JSON/Markdown)**
- **You can also add/develop your own widgets. For details, see [WIDGET_DEV_GUIDE.md](docs/WIDGET_DEV_GUIDE.md) and [WIDGET_PERFORMANCE_GUIDE.md](docs/WIDGET_PERFORMANCE_GUIDE.md).**

---

## Usage

### 1. Creating and Managing Boards
- Add new boards from "Board Management" in the settings screen.
- Add, rearrange, or delete widgets for each board.
- You can also set the board name and initial display mode.

### 2. Adding and Editing Widgets
- Add widgets from "Widget Management" in the board details settings.
- You can change the title, rearrange, or delete added widgets.
- Edit detailed settings for each widget (e.g., Pomodoro work time, notification sound, memo content, calendar display, etc.).
- **Available widget types are limited to those registered in the plugin (see `src/widgetRegistry.ts`). To add a new widget, register it in `widgetRegistry.ts` and reload the plugin.**
- **For how to add/develop your own widgets, see [WIDGET_DEV_GUIDE.md](docs/WIDGET_DEV_GUIDE.md) and [WIDGET_PERFORMANCE_GUIDE.md](docs/WIDGET_PERFORMANCE_GUIDE.md). Be sure to check the performance design guide.**

### 3. Hotkeys
- You can set hotkeys for "open", "close", and "toggle" for each board (assignable from Obsidian's hotkey settings screen).
- Useful for quickly opening/closing boards.

### 4. Exporting Pomodoro Work Logs
- Work logs are automatically saved in CSV/JSON/Markdown format at the end of each Pomodoro session.
- Saved in the `logs` subfolder in the plugin folder.
- Export format can be set per widget.
- CSV is BOM and escape processed, Markdown is formatted to avoid line breaks/table collapse.
- **→ For log file formats and usage, see [logs/README.md](logs/README.md).**

---

## Widget Features

### ● Pomodoro Timer
- Flexible management of work/break/long break cycles
- Automatically records work logs (start/end time, memo) for each session
- Memo function allows you to record/edit work memos in Markdown
- Global and individual settings for notification sound/volume
- Work logs can be exported in CSV/JSON/Markdown format
- Supports background images and automatic cycle management

### ● Memo
- Markdown-supported memo widget
- Switch between auto height and fixed height
- Efficient editing/saving with diff update UI
- Batch resize and performance optimized

### ● Calendar
- Simple monthly calendar view
- Switch between previous/next month
- Highlights today's date
- Lightweight UI with diff update
- Start day of the week can be set (default: Monday)

### ● Timer/Stopwatch
- Switch between timer and stopwatch
- Notification sound when timer ends
- Set timer in minutes/seconds
- Diff update UI and global tick for performance

### ● Recent Notes
- List of recently edited Markdown notes
- Click note name to open instantly
- Number of displayed items can be set
- Virtual list for fast rendering if over 100 items

### ● Theme Switcher
- Switch Obsidian themes with one click
- Clearly shows current theme
- Theme list is auto-fetched and instantly applied

### ● File Viewer
- Select and preview any Markdown file
- Button to open directly in Obsidian
- Switch between auto/fixed height, jump to note by clicking links
- Batch/cached Markdown rendering (up to 1000 items LRU cache)

### ● Tweet Widget
- New widget for posting, threads, and detail view
- Post area (avatar, text, image/GIF, bold/italic, emoji, location, char count, post button)
- Post list displayed in thread (parent/child reply) structure in chronological order
- Click post to switch to "detail view" with parent/self/child replies split
- In detail view, header at top and reply area always at bottom
- Reply button opens reply input in modal popup
- Post save/edit/delete/like/retweet/image/GIF/bold/italic/emoji/location/bookmark, etc.
- Post data managed in a dedicated DB file. You can specify any folder in the Vault as the base folder
- Hide/fully delete/restore/filter (all/normal/hidden/bookmark) posts
- Create/link ContextNote (related note)
- Schedule posts for automatic posting at specified date/time (weekly or period also possible)
- UI/UX/design unified with other widgets
- Responsive and accessibility improved

### ● Reflection Report (reflection-widget)
- Visualizes the number of "tweet" posts in the last 7 days in a graph
- Automatically generates/displays "today's summary" and "this week's summary" using AI (Gemini, etc.)
- Post data is aggregated from the Vault DB in cooperation with the Tweet widget
- Graph/summary is diff updated and CSS containment optimized for performance
- AI summary is cached in `data.json` in the Vault, can be reused or manually regenerated
- Responsive and accessibility considered

> **You can also add/develop your own widgets. For details, see [WIDGET_DEV_GUIDE.md](docs/WIDGET_DEV_GUIDE.md) and [WIDGET_PERFORMANCE_GUIDE.md](docs/WIDGET_PERFORMANCE_GUIDE.md).**

---

## Settings & Customization

- Edit detailed settings for each widget from "Board Details Settings" → "Widget Management".
- Global settings for notification sound/volume, etc. are also available.
- Pomodoro work log export format can also be selected here.
- **Widget-specific settings are defined in each widget implementation under `src/widgets/`.**

### Main Settings for Tweet Widget
- Manage DB save location (base folder) and user icon URL globally
- Only Vault folders can be suggested/selected as base folder
  (If only a folder is specified, `tweets.json` is automatically appended)
- If a base folder is specified, it will be saved as `base folder/tweets.json`
- ContextNote is generated under the base folder (e.g., myfolder/ContextNotes/)
- Global avatar settings are reflected in both post area and list
- Suggestion/validation prevents user errors
- Post data is managed with a `deleted: true` flag for hiding. Full (physical) deletion is also possible
- Filter UI at the top of the post list: "All", "Normal only", "Hidden only", "Bookmark"
- Hidden tweets have "Restore" and "Delete permanently" buttons; normal tweets have "Hide" and "Delete permanently" buttons
- ContextNote is generated under the custom DB path (e.g., myfolder/ContextNotes/)
- Replies can be entered comfortably in modal UI

## User Prompt Feature (AI Summary & AI Reply Customization)

### Overview

A "User Prompt" feature is available, allowing you to freely customize the prompts (instructions) for AI summaries and AI replies using LLM (AI).

- Set custom prompts for each use case from **Global Settings > LLM (Global Settings)**.
- If left blank, the plugin's default prompt will be used.
- You can set prompts individually for the Tweet widget (AI reply) and Reflection widget (today/this week summary).
- You can also specify the model name for tweet AI reply and reflection AI summary (if blank, the common model name is used).
- If debug log is enabled, prompt/model info is shown in the console.

### How to Use

1. **Open the settings screen**
   - Open Obsidian's "Settings" → "Widget Board Settings" → "LLM (Global Settings)".
2. **Enter your prompt in the user prompt field**
   - Enter the instruction (prompt) you want to give to the AI in Japanese or English in the "User Prompt (Tweet)", "User Prompt (Today)", and "User Prompt (This Week)" fields.
   - Example: "You are a friendly counselor. Please read the following post and reply gently and empathetically."
   - Variables like `{tweet}`, `{postDate}`, `{posts}` will be automatically replaced with post content or date info.
3. **If left blank, the default prompt will be used**
   - If you leave it blank, the default AI summary/reply will work as before.

#### Available Variables

You can use the following variables in the user prompt. These will be automatically replaced when passed to the AI.

- `{tweet}` : The text of the post or thread to be replied to in the Tweet widget.
- `{postDate}` : Date/time info (e.g., "June 1, 2024, 10:30 AM (this time is 'morning')").
- `{posts}` : List of posts to be summarized in the Reflection widget.

Including these variables in your prompt allows the AI to correctly reference post content and date info.

#### Default Prompts & Examples

- The default prompts and examples provided by this plugin are summarized in [src/llm/gemini/summaryPrompts.ts](src/llm/gemini/summaryPrompts.ts) and [src/llm/gemini/tweetReplyPrompt.ts](src/llm/gemini/tweetReplyPrompt.ts).
- For more advanced customization or examples, see these files directly.

### Use Cases

- When you want to customize the AI's reply tone or analysis perspective
- When you want to use specific psychological perspectives or technical terms
- When you want to specify reply style (polite, casual, no bullet points, etc.)
- When you want to change AI behavior for each team or project

### Notes

- Be sure to keep variables (`{tweet}`, `{postDate}`, `{posts}`) so the AI can reference content correctly.
- Too long or complex prompts may affect AI response speed/quality.
- Depending on the custom prompt, AI responses may not be as intended. Adjust as needed.

---

## For Developers / Performance Optimization

- **If you are developing/extending your own widgets, be sure to refer to [WIDGET_DEV_GUIDE.md](docs/WIDGET_DEV_GUIDE.md) and [WIDGET_PERFORMANCE_GUIDE.md](docs/WIDGET_PERFORMANCE_GUIDE.md).**
- Covers development flow, WidgetImplementation examples, performance checklist, FAQ, etc.
- Performance optimization (batching, virtual list, containment, read→write separation, etc.) is required for all widgets.
- When developing/reviewing, always check the performance guide checklist and measure reflow/rendering cost with DevTools, etc.

### Code Quality Check (ESLint)

This repository uses [ESLint](https://eslint.org/) for static analysis and quality check of TypeScript code.

#### Basic Usage

```bash
# Check .ts files under src
eslint ./src --ext .ts
```

#### Debug Mode

Add the `--debug` option to see detailed ESLint logs.

```bash
eslint ./src --ext .ts --debug
```

- For rules, settings, and troubleshooting, see [docs/ESLINT_GUIDE.md](docs/ESLINT_GUIDE.md).

### Running Tests

This repository provides simple tests using Jest. After installing dependencies, run:

```bash
npm test
```

For test directory structure and how to add tests, see [docs/tests/README.md](docs/tests/README.md).

---

## Test Expansion Plan & Checklist

To improve the quality of this plugin, the test expansion plan, categories, and viewpoints are summarized in [docs/tests/README.md](docs/tests/README.md).

- Widget unit tests
- Utility/common function tests

For detailed checklist and viewpoints, see [docs/tests/README.md](docs/tests/README.md).

---

## Notes & Others

- You can set hotkeys for opening/closing boards individually.
- Adding/deleting/renaming boards and widgets is reflected immediately.
- Pomodoro work logs are saved without duplicate removal (can be changed in code if needed).
- Export files are saved in `<Vault>/.obsidian/plugins/obsidian-widget-board-plugin/logs/`.
- **To add/remove widget types, edit `widgetRegistry.ts` and reload the plugin.**
- **If a new widget does not appear as a candidate, check for missing registration in `widgetRegistry.ts`, plugin reload, or performance design issues.**

---

## Known Issues

- When adding/deleting/renaming boards, the command list in Obsidian's "Hotkey" screen is reflected after reloading the plugin (restart Obsidian or disable/enable the plugin).
- If you add/delete many boards/widgets in a short time, some UI may not update correctly (reopen the settings screen if this happens).
- Pomodoro work log export does not support files outside the Vault or conflicts with other plugins.
- Some UI may break depending on Obsidian version or theme.
- For other minor bugs or requests, please report via GitHub Issue, etc.
- **If a new widget does not appear as a candidate, check for missing registration in `widgetRegistry.ts` or plugin reload.**

---

## Installation

There are two main ways to install the Obsidian Widget Board Plugin.

### 1. Manual Installation from GitHub Release

1. Download `obsidian-widget-board-plugin.zip` from the [GitHub Releases page](https://github.com/Mekann2904/obsidian-widget-board-plugin/releases).
2. Unzip and move it to the Obsidian plugin folder (`<Vault>/.obsidian/plugins/obsidian-widget-board-plugin/`).
3. Enable the plugin from Obsidian's settings screen.

### 2. Install Using the BRAT Plugin (Recommended)

Using the BRAT (Beta Reviewers Auto-update Tool) plugin makes installation and updates easier.

1. Search and install "BRAT" from Obsidian's community plugins.
2. In BRAT settings, add this plugin's GitHub repository URL (`https://github.com/Mekann2904/obsidian-widget-board-plugin`) via "Add Beta Plugin".
3. After adding, you can install/enable this plugin via BRAT.

> **Using BRAT is the easiest and most recommended way. Updates will also be reflected automatically.**

---

## License

MIT 