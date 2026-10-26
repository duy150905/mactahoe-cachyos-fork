import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { update_from_old_settings } from './settings/settings_updater.js';
import { PipelinesManager } from './pipelines/pipelines_manager.js';
import { EffectsManager } from './pipelines/effects_manager.js';
import { Connections } from './conveniences/connections.js';
import { Settings } from './settings/settings.js';
import { KEYS } from './settings/keys.js';

import { OverviewBlur } from './components/overview.js';
import { AppFoldersBlur } from './components/appfolders.js';
import { PanelBlur } from './components/panel/index.js';
import { enable_system_style, disable_system_style } from './conveniences/style.js';
import { track_painted_views } from './render/backdrop/painted_view.js';
import { clear_snippets } from './render/shader/snippet_cache.js';

export class TahoeBlurManager {
    constructor(gsettings) {
        this._gsettings = gsettings;
        this._settings = null;
        this._connection = null;
        this._connections = [];
        this._effects_manager = null;
        this._pipelines_manager = null;
        this._overview_blur = null;
        this._appfolder_blur = null;
        this._panel_blur = null;
    }

    enable() {
        console.log('[CachyOSTahoe > blur] Initializing Overview, AppFolder, and Panel transparency...');
        global.cachyos_tahoe_blur = this;

        update_from_old_settings(this._gsettings);
        this._settings = new Settings(KEYS, this._gsettings);

        this._connection = new Connections;
        this._connections = [this._connection];

        this._connection.connect(Main.uiGroup, 'destroy', () => this.disable());
        track_painted_views(this._connection);
        enable_system_style();

        this._effects_manager = new EffectsManager(this._connection);
        this._pipelines_manager = new PipelinesManager(this._settings);

        const init = () => {
            const connection = new Connections;
            this._connections.push(connection);
            return [connection, this._settings, this._effects_manager];
        };

        this._overview_blur = new OverviewBlur(...init());
        this._appfolder_blur = new AppFoldersBlur(...init());
        this._panel_blur = new PanelBlur(...init());

        if (this._settings.overview.BLUR) {
            this._overview_blur.enable();
        }
        if (this._settings.appfolder.BLUR) {
            this._appfolder_blur.enable();
        }
        if (this._settings.panel.BLUR) {
            this._panel_blur.enable();
        }

        // Listen for setting changes
        this._settings.overview.settings.connect('changed::blur', () => {
            if (this._settings?.overview?.BLUR) {
                this._overview_blur?.enable();
            } else {
                this._overview_blur?.disable();
            }
        });

        this._settings.appfolder.settings.connect('changed::blur', () => {
            if (this._settings?.appfolder?.BLUR) {
                this._appfolder_blur?.enable();
            } else {
                this._appfolder_blur?.disable();
            }
        });

        this._settings.panel.settings.connect('changed::blur', () => {
            if (this._settings?.panel?.BLUR) {
                this._panel_blur?.enable();
            } else {
                this._panel_blur?.disable();
            }
        });
    }

    disable() {
        console.log('[CachyOSTahoe > blur] Disabling blur and panel manager...');
        if (this._panel_blur) {
            this._panel_blur.disable();
            this._panel_blur = null;
        }

        if (this._overview_blur) {
            this._overview_blur.disable();
            this._overview_blur = null;
        }

        if (this._appfolder_blur) {
            this._appfolder_blur.disable();
            this._appfolder_blur = null;
        }

        if (this._effects_manager) {
            this._effects_manager.destroy_all();
            this._effects_manager = null;
        }

        if (this._pipelines_manager) {
            this._pipelines_manager.destroy();
            this._pipelines_manager = null;
        }

        clear_snippets();
        disable_system_style();

        if (this._settings) {
            this._settings.disconnect_all_settings();
            this._settings = null;
        }

        if (this._connections) {
            this._connections.forEach(c => c.disconnect_all());
            this._connections = [];
            this._connection = null;
        }

        if (global.cachyos_tahoe_blur === this) {
            delete global.cachyos_tahoe_blur;
        }
    }
}
