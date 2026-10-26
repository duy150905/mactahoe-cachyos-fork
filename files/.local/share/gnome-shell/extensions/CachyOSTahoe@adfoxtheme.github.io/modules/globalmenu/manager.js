import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { MenuManager } from './menuManager.js';
import { SystemMenuButton } from './systemMenu.js';

export class TahoeGlobalMenuManager {
    constructor(extensionPath, settings, uuid = 'CachyOSTahoe@adfoxtheme.github.io') {
        this._extensionPath = extensionPath;
        this._settings = settings;
        this._uuid = uuid;
        this._menuManager = null;
        this._logoButton = null;
        this._settingsChangedId = null;
    }

    enable() {
        console.log('[CachyOSTahoe > globalmenu] Enabling Global Menu...');
        this._menuManager = new MenuManager(this._uuid, this._settings);

        const ICON_ONLY_KEYS = [
            'logo-icon-name',
            'logo-custom-icon-path',
            'logo-distro-icon',
            'logo-distro-icon-symbolic',
            'logo-icon-size'
        ];

        this._settingsChangedId = this._settings.connect('changed', (_settings, key) => {
            if (key === 'show-logo-menu') {
                this._syncLogoButton();
            } else if (!ICON_ONLY_KEYS.includes(key)) {
                this._syncMenuVisibility();
            }
        });

        global.display.connectObject('notify::focus-window', () => {
            this._syncMenuVisibility();
        }, this);

        this._syncLogoButton();
        this._syncMenuVisibility();
    }

    _syncLogoButton() {
        let shouldShow = this._settings.get_boolean('show-logo-menu');

        if (shouldShow && !this._logoButton) {
            this._logoButton = new SystemMenuButton(this._settings, this._extensionPath);
            Main.panel.addToStatusArea('globalmenu-logo', this._logoButton, 0, 'left');
        } else if (!shouldShow && this._logoButton) {
            this._logoButton.destroy();
            this._logoButton = null;
        }
    }

    _syncMenuVisibility() {
        if (!this._menuManager) return;

        if (this._settings.get_boolean('show-indicator')) {
            let activeWindow = global.display.get_focus_window();
            this._menuManager.updateMenuForWindow(activeWindow);
        } else {
            this._menuManager.clear();
        }
    }

    disable() {
        console.log('[CachyOSTahoe > globalmenu] Disabling Global Menu...');
        global.display.disconnectObject(this);

        if (this._settings && this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }

        if (this._menuManager) {
            this._menuManager.destroy();
            this._menuManager = null;
        }

        if (this._logoButton) {
            this._logoButton.destroy();
            this._logoButton = null;
        }
    }
}
