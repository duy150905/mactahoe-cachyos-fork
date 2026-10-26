// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

import {DockManager} from './docking.js';
import {Main} from './dependencies/shell/ui.js';
import {Extension} from './dependencies/shell/extensions/extension.js';

export let dockManager;

export default class CachyOSTahoeDockExtension extends Extension.Extension {
    enable() {
        console.log('[CachyOSTahoeDock] Enabling macOS Tahoe Dock...');
        if (!dockManager) {
            try {
                dockManager = new DockManager(this);
            } catch (e) {
                console.error('[CachyOSTahoeDock] Error initializing DockManager:', e);
            }
        }
    }

    disable() {
        console.log('[CachyOSTahoeDock] Disabling macOS Tahoe Dock...');
        try {
            dockManager?.destroy();
            dockManager = null;
        } catch (e) {
            console.error('[CachyOSTahoeDock] Failed to destroy dockManager:', e);
        }
    }
}
