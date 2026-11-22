import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import { Island } from './island.js';
import { MprisManager } from './mpris.js';
import { LyricsProvider, ArtCache } from './media.js';

const BMS_UUID = 'blur-my-shell@aunetx';

export default class DindExtension extends Extension {
    enable() {
        this._settings = this.getSettings();

        const cacheDir = GLib.build_filenamev([GLib.get_user_cache_dir(), 'dind']);
        GLib.mkdir_with_parents(cacheDir, 0o755);
        this._art = new ArtCache(cacheDir);
        this._lyrics = new LyricsProvider(cacheDir);
        this._mpris = new MprisManager(() => this._island?.refresh());

        this._island = new Island({
            settings: this._settings,
            mpris: this._mpris,
            art: this._art,
            lyrics: this._lyrics,
        });
        Main.layoutManager.addTopChrome(this._island.actor, { trackFullscreen: true });

        this._blurToken = 0;
        this._extensionsSignal = Main.extensionManager.connect(
            'extension-state-changed',
            (_manager, extension) => {
                if (extension.uuid === BMS_UUID)
                    this._syncBlur();
            }
        );

        this._startId = 0;
        const start = () => {
            this._startId = 0;
            this._island?.start();
            this._mpris?.start();
            this._syncBlur();
        };
        if (Main.layoutManager._startingUp) {
            this._startupSignal = Main.layoutManager.connect('startup-complete', () => {
                Main.layoutManager.disconnect(this._startupSignal);
                this._startupSignal = 0;
                start();
            });
        } else {
            this._startId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                start();
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    disable() {
        ++this._blurToken;
        if (this._startId)
            GLib.source_remove(this._startId);
        this._startId = 0;
        if (this._startupSignal)
            Main.layoutManager.disconnect(this._startupSignal);
        this._startupSignal = 0;
        if (this._extensionsSignal)
            Main.extensionManager.disconnect(this._extensionsSignal);
        this._extensionsSignal = 0;

        this._mpris?.destroy();
        this._mpris = null;

        if (this._island) {
            Main.layoutManager.removeChrome(this._island.actor);
            this._island.destroy();
            this._island = null;
        }
        this._lyrics?.destroy();
        this._lyrics = null;
        this._art?.destroy();
        this._art = null;
        this._settings = null;
    }

    /// Gắn/gỡ blur tuỳ theo Blur My Shell có đang chạy hay không.
    async _syncBlur() {
        const token = ++this._blurToken;
        const island = this._island;
        if (!island)
            return;

        const bms = global.blur_my_shell;
        if (!bms?._pipelines_manager || !bms?._effects_manager) {
            island.detachBlur();
            return;
        }
        if (island.hasBlur)
            return;

        try {
            const uri = Main.extensionManager.lookup(BMS_UUID).dir.get_uri();
            const { DynamicPipeline } = await import(`${uri}/render/dynamic_surface.js`);
            if (token !== this._blurToken || !this._island || global.blur_my_shell !== bms)
                return;
            this._island.attachBlur(DynamicPipeline, bms, this._resolvePipelineId(bms));
        } catch (e) {
            console.warn(`[Dind] không gắn được blur của Blur My Shell: ${e.message}`);
            this._island?.detachBlur();
        }
    }

    _resolvePipelineId(bms) {
        const manager = bms._pipelines_manager;
        const saved = this._settings.get_string('pipeline-id');
        if (saved && Object.hasOwn(manager.pipelines, saved))
            return saved;

        const panelId = bms._settings?.panel?.PIPELINE;
        const base = manager.pipelines[panelId] ?? manager.pipelines['pipeline_default'];
        const id = manager.create_pipeline('Dind', base?.effects ?? []);
        if (id) {
            this._settings.set_string('pipeline-id', id);
            return id;
        }
        return Object.hasOwn(manager.pipelines, panelId) ? panelId : 'pipeline_default';
    }
}
