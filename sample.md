## 📝 `src/widgets/configurableMessageWidget.ts`

This file contains the core logic for the new widget.

```typescript
// src/widgets/configurableMessageWidget.ts
import { App } from 'obsidian';
import type { WidgetConfig, WidgetImplementation } from '../interfaces';
import type WidgetBoardPlugin from '../main'; // Assuming your main plugin class is exported as default

// 1. Define the settings interface for this widget
export interface ConfigurableMessageWidgetSettings {
    displayText: string;
    fontSize: string; // Example of another setting: 'small', 'medium', 'large'
}

// 2. Define the default settings for this widget
export const DEFAULT_CONFIGURABLE_MESSAGE_SETTINGS: ConfigurableMessageWidgetSettings = {
    displayText: 'Hello from your new widget! ✨',
    fontSize: 'medium', // Default font size
};

// 3. Implement the WidgetImplementation interface
export class ConfigurableMessageWidget implements WidgetImplementation {
    // Unique identifier for this widget type
    id = 'configurableMessage';

    private config!: WidgetConfig;
    // private app!: App; // Store if needed for more complex interactions
    // private plugin!: WidgetBoardPlugin; // Store if needed
    private widgetEl!: HTMLElement;
    private messageEl!: HTMLParagraphElement; // To update the message content
    private currentSettings!: ConfigurableMessageWidgetSettings;

    // The create method is called when the widget needs to be rendered
    create(config: WidgetConfig, app: App, plugin: WidgetBoardPlugin): HTMLElement {
        this.config = config;
        // this.app = app; // Uncomment and use if your widget interacts with Obsidian App features
        // this.plugin = plugin; // Uncomment and use if your widget needs plugin-specific data or methods

        // Initialize currentSettings, merging defaults with any saved settings
        this.currentSettings = {
            ...DEFAULT_CONFIGURABLE_MESSAGE_SETTINGS,
            ...(config.settings || {}),
        };
        // Ensure the config object passed around reflects the full settings
        config.settings = this.currentSettings;

        // Create the main widget element
        this.widgetEl = document.createElement('div');
        this.widgetEl.classList.add('widget', 'configurable-message-widget');
        this.widgetEl.setAttribute('data-widget-id', config.id);

        // Add a title (optional, but good practice)
        const titleEl = this.widgetEl.createEl('h4');
        titleEl.textContent = this.config.title || 'Configurable Message'; // Use configured title or a default

        // Create the content area
        const contentEl = this.widgetEl.createDiv({ cls: 'widget-content' });

        // Create the paragraph element to display the message
        this.messageEl = contentEl.createEl('p');
        this.updateMessageDisplay(); // Initial display based on current settings

        return this.widgetEl;
    }

    // This method is called when settings are updated from the plugin's setting tab
    public updateExternalSettings(newSettings: Partial<ConfigurableMessageWidgetSettings>, widgetId?: string) {
        // Ensure this update is for the correct widget instance
        if (widgetId && this.config?.id !== widgetId) {
            return;
        }

        // Merge new settings into current settings
        this.currentSettings = { ...this.currentSettings, ...newSettings };
        // Also update the settings object within the main config
        if (this.config && this.config.settings) {
            this.config.settings = this.currentSettings;
        }

        // Re-render the part of the widget that changed
        if (this.messageEl) {
            this.updateMessageDisplay();
        }
    }

    // Helper method to update the displayed message and its style
    private updateMessageDisplay() {
        if (!this.messageEl) return;

        this.messageEl.textContent = this.currentSettings.displayText;
        this.messageEl.className = ''; // Clear previous font size classes
        switch (this.currentSettings.fontSize) {
            case 'small':
                this.messageEl.classList.add('font-small');
                break;
            case 'large':
                this.messageEl.classList.add('font-large');
                break;
            case 'medium':
            default:
                this.messageEl.classList.add('font-medium');
                break;
        }
    }

    // onunload is called when the widget is being removed or the plugin is unloaded
    onunload(): void {
        // Clean up any resources like intervals, global event listeners, etc.
        // For this simple widget, there's nothing to clean up.
        // console.log(`ConfigurableMessageWidget ${this.config?.id} unloaded.`);
    }
}
```

-----

## ⚙️ Integration Steps

To make this new widget available in your plugin, you'll need to update a few files:

1.  **`src/widgetRegistry.ts`**: Register the new widget.

    ```typescript
    // src/widgetRegistry.ts
    // ... other imports
    import { ConfigurableMessageWidget } from './widgets/configurableMessageWidget'; // Import the new widget

    export const registeredWidgetImplementations: Map<string, WidgetImplementation> = new Map();

    // ... other widget registrations
    registeredWidgetImplementations.set('pomodoro', new PomodoroWidget());
    registeredWidgetImplementations.set('memo', new MemoWidget());
    registeredWidgetImplementations.set('calendar', new CalendarWidget());
    registeredWidgetImplementations.set('youtube', new YouTubeWidget());
    registeredWidgetImplementations.set('configurableMessage', new ConfigurableMessageWidget()); // Add new widget
    ```

2.  **`src/settingsTab.ts`**: Add an "Add" button and settings UI for the new widget.

    ```typescript
    // src/settingsTab.ts
    // ... other imports
    // Import the new widget's defaults and settings interface
    import { DEFAULT_CONFIGURABLE_MESSAGE_SETTINGS, ConfigurableMessageWidgetSettings } from './widgets/configurableMessageWidget';

    export class WidgetBoardSettingTab extends PluginSettingTab {
        // ... constructor and existing display code

        display(): void {
            // ... existing settings tab code

            // --- In the createAddButton section ---
            createAddButton(
                "メッセージ追加", // Button text
                "configurableMessage",      // Widget type (matches id in ConfigurableMessageWidget)
                DEFAULT_CONFIGURABLE_MESSAGE_SETTINGS // Default settings for this widget
            );
            // ...

            // --- In the renderWidgetList method, inside the widgets.forEach loop ---
            // Add a new else if block for your widget type:
            // ...
            // } else if (widget.type === 'youtube') { ...
            } else if (widget.type === 'configurableMessage') {
                widget.settings = {
                    ...DEFAULT_CONFIGURABLE_MESSAGE_SETTINGS,
                    ...(widget.settings || {})
                } as ConfigurableMessageWidgetSettings;
                const currentSettings = widget.settings as ConfigurableMessageWidgetSettings;

                new Setting(settingsEl)
                    .setName('表示テキスト')
                    .setDesc('ウィジェットに表示するメッセージを入力してください。')
                    .addTextArea(text => text
                        .setPlaceholder('表示したいメッセージ...')
                        .setValue(currentSettings.displayText)
                        .onChange(async (value) => {
                            currentSettings.displayText = value;
                            await this.plugin.saveSettings();
                            this.notifyWidgetInstance(widget.id, widget.type, currentSettings);
                        }));

                new Setting(settingsEl)
                    .setName('フォントサイズ')
                    .setDesc('メッセージのフォントサイズを選択してください。')
                    .addDropdown(dropdown => dropdown
                        .addOption('small', '小')
                        .addOption('medium', '中')
                        .addOption('large', '大')
                        .setValue(currentSettings.fontSize)
                        .onChange(async (value: 'small' | 'medium' | 'large') => {
                            currentSettings.fontSize = value;
                            await this.plugin.saveSettings();
                            this.notifyWidgetInstance(widget.id, widget.type, currentSettings);
                        }));
            }
            // ...
        }
    }
    ```

3.  **`src/main.ts` (Optional but good practice for `loadSettings`)**:
    If you want to ensure that existing `configurableMessage` widgets without the new `fontSize` setting get a default value when the plugin loads, you can update the `loadSettings` method:

    ```typescript
    // src/main.ts
    // ... other imports
    import { DEFAULT_CONFIGURABLE_MESSAGE_SETTINGS } from './widgets/configurableMessageWidget'; // Import defaults

    export default class WidgetBoardPlugin extends Plugin {
        // ...
        async loadSettings() {
            // ... existing loadSettings code
            this.settings.widgets.forEach((widget: WidgetConfig) => {
                // ... other widget type checks
                } else if (widget.type === 'configurableMessage') {
                    widget.settings = { ...DEFAULT_CONFIGURABLE_MESSAGE_SETTINGS, ...(widget.settings || {}) };
                }
            });
        }
        // ...
    }
    ```

4.  **`styles.css` (Add styles for font sizes)**:

    ```css
    /* styles.css */
    /* ... other styles ... */

    .configurable-message-widget .widget-content p {
        margin: 0.5em 0; /* Add some spacing */
        word-break: break-word; /* Prevent long words from overflowing */
    }

    .configurable-message-widget .font-small {
        font-size: var(--font-ui-small); /* Use Obsidian's theme variables */
    }

    .configurable-message-widget .font-medium {
        font-size: var(--font-ui-medium);
    }

    .configurable-message-widget .font-large {
        font-size: var(--font-ui-large);
    }
    ```

-----

This "Configurable Message Widget" provides a basic template covering settings, UI creation, and updates. Developers can expand upon this by adding more complex logic, interacting with the Obsidian API via the `app` object, or using plugin-specific data through the `plugin` object passed to the `create` method.