# Source Overview

This folder contains the TypeScript source for the plugin. Key subfolders:

- **widgets/** – widget implementations
- **llm/** – AI integration modules
- **settings/** – plugin settings and types
- **utils/** – shared utilities

To add a new widget:
1. Create a folder under `widgets/` with an `index.ts` exporting the widget class.
2. Register the widget in `widgetRegistry.ts`.

