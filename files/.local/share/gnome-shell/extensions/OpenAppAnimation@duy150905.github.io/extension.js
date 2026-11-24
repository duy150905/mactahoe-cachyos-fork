/*
 * Open App Animation for GNOME Shell
 *
 * Based on Compiz-alike-magic-lamp-effect
 * Copyright (C) 2020 Mauro Pepe <https://github.com/hermes83/compiz-alike-magic-lamp-effect>
 * Modifications (C) 2026 duy150905: renamed to "Open App Animation", added
 * open/close window effects, made the window-manager patching conditional.
 *
 * This file is part of the gnome-shell extension Open App Animation.
 *
 * gnome-shell extension Open App Animation is free software: you can
 * redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software
 * Foundation, either version 3 of the License, or (at your option)
 * any later version.
 *
 * gnome-shell extension Open App Animation is distributed in the hope that it
 * will be useful, but WITHOUT ANY WARRANTY; without even the
 * implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR
 * PURPOSE.  See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with gnome-shell extension Open App Animation.  If not, see
 * <http://www.gnu.org/licenses/>.
 */
'use strict';

import Meta from 'gi://Meta';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {SettingsData} from './settings_data.js';
import {
    MagicLampMinimizeEffect,
    MagicLampUnminimizeEffect,
    MINIMIZE_EFFECT_NAME,
    UNMINIMIZE_EFFECT_NAME,
} from './magicLamp.js';
import {WindowTransition, isKnownEffect} from './transitions.js';

const LOG_TAG = '[Open App Animation]';

// Loại cửa sổ mà GNOME mặc định có hoạt ảnh mở/đóng; chỉ những loại này được thay.
const ANIMATED_WINDOW_TYPES = [
    Meta.WindowType.NORMAL,
    Meta.WindowType.DIALOG,
    Meta.WindowType.MODAL_DIALOG,
];

export default class OpenAppAnimationExtension extends Extension {
    enable() {
        this.settingsData = new SettingsData(this.getSettings());

        // actor -> 'map' | 'destroy' | 'minimize' | 'unminimize'
        // Cửa sổ mà extension này đã "nhận" hoạt ảnh từ GNOME Shell.
        this._claimed = new Map();
        // actor -> WindowTransition đang chạy (mở/đóng)
        this._transitions = new Map();
        this._ids = [];
        this._orig = null;

        const wm = Main.wm;
        if (!wm || typeof wm._shouldAnimateActor !== 'function') {
            console.warn(`${LOG_TAG} Bản GNOME Shell này không có WindowManager._shouldAnimateActor; extension không làm gì.`);
            return;
        }

        this._patchWindowManager();

        const shellwm = global.window_manager;
        this._ids.push(shellwm.connect('map', (_wm, actor) => this._onMap(actor)));
        this._ids.push(shellwm.connect('destroy', (_wm, actor) => this._onDestroy(actor)));
        this._ids.push(shellwm.connect('minimize', (_wm, actor) => this._onMinimize(actor)));
        this._ids.push(shellwm.connect('unminimize', (_wm, actor) => this._onUnminimize(actor)));
    }

    disable() {
        if (this._ids && this._ids.length) {
            this._ids.forEach(id => global.window_manager.disconnect(id));
        }
        this._ids = [];

        // Kết thúc mọi hiệu ứng đang chạy để cửa sổ không bị kẹt ở nửa chừng.
        if (this._transitions) {
            [...this._transitions.values()].forEach(transition => transition.abort());
            this._transitions.clear();
        }
        if (global.get_window_actors) {
            global.get_window_actors().forEach(actor => this._destroyLampEffects(actor));
        }
        if (this._claimed) {
            [...this._claimed.entries()].forEach(([actor, kind]) => this._complete(kind, actor));
            this._claimed.clear();
        }

        this._unpatchWindowManager();

        this._claimed = null;
        this._transitions = null;
        this.settingsData = null;
    }

    // ---- Vá WindowManager -------------------------------------------------

    _patchWindowManager() {
        const wm = Main.wm;
        const shellwm = wm._shellwm;
        const self = this;

        this._orig = {
            shouldAnimateActor: wm._shouldAnimateActor,
            completed: {
                minimize: shellwm.completed_minimize,
                unminimize: shellwm.completed_unminimize,
                destroy: shellwm.completed_destroy,
            },
        };

        // GNOME hỏi hàm này trước khi tự chạy hoạt ảnh. Trả về false cho những
        // cửa sổ mà extension muốn tự xử lý, và ghi nhớ lại để các tín hiệu
        // map/destroy/minimize/unminimize phía dưới biết cửa sổ nào là của mình.
        wm._shouldAnimateActor = function (actor, types) {
            const original = self._orig.shouldAnimateActor.call(this, actor, types);
            if (!original) {
                return false;
            }

            const kind = self._kindFromStack(new Error().stack);
            if (kind && self._shouldClaim(kind, actor)) {
                self._claimed.set(actor, kind);
                return false;
            }
            return original;
        };

        // Khi GNOME báo "xong" cho cửa sổ mà mình đang chạy hoạt ảnh thì phải bỏ qua,
        // chỉ gọi bản gốc khi hoạt ảnh của mình kết thúc (xem _complete).
        for (const kind of ['minimize', 'unminimize', 'destroy']) {
            const name = `completed_${kind}`;
            shellwm[name] = function (actor) {
                if (self._claimed && self._claimed.get(actor) === kind) {
                    return;
                }
                return self._orig.completed[kind].call(this, actor);
            };
        }
    }

    _unpatchWindowManager() {
        if (!this._orig) {
            return;
        }
        const wm = Main.wm;
        const shellwm = wm._shellwm;

        wm._shouldAnimateActor = this._orig.shouldAnimateActor;
        shellwm.completed_minimize = this._orig.completed.minimize;
        shellwm.completed_unminimize = this._orig.completed.unminimize;
        shellwm.completed_destroy = this._orig.completed.destroy;
        this._orig = null;
    }

    // Tên hàm trong stack cho biết _shouldAnimateActor đang được gọi từ đâu.
    _kindFromStack(stack) {
        if (!stack) {
            return null;
        }
        if (stack.indexOf('_minimizeWindow') !== -1) {
            return 'minimize';
        }
        if (stack.indexOf('_unminimizeWindow') !== -1) {
            return 'unminimize';
        }
        if (stack.indexOf('_mapWindow') !== -1) {
            return 'map';
        }
        if (stack.indexOf('_destroyWindow') !== -1) {
            return 'destroy';
        }
        return null;
    }

    _shouldClaim(kind, actor) {
        if (!this.settingsData || this._claimed.has(actor)) {
            return false;
        }

        if (kind === 'minimize' || kind === 'unminimize') {
            return this.settingsData.MINIMIZE_EFFECT.get() === 'lamp';
        }

        const window = actor.meta_window;
        if (!window || !ANIMATED_WINDOW_TYPES.includes(window.get_window_type())) {
            return false;
        }
        const setting = kind === 'map' ? this.settingsData.OPEN_EFFECT : this.settingsData.CLOSE_EFFECT;
        return setting.get() !== 'default';
    }

    // Báo cho GNOME biết hoạt ảnh đã xong (gọi hàm gốc) rồi mới bỏ đánh dấu.
    _complete(kind, actor) {
        if (!this._claimed || this._claimed.get(actor) !== kind) {
            return;
        }
        this._claimed.delete(actor);

        if (kind === 'map' || !this._orig) {
            return;
        }
        try {
            this._orig.completed[kind].call(Main.wm._shellwm, actor);
        } catch (e) {
            console.warn(`${LOG_TAG} completed_${kind} lỗi: ${e}`);
        }
    }

    // ---- Mở / đóng --------------------------------------------------------

    _onMap(actor) {
        if (this._claimed.get(actor) !== 'map') {
            return;
        }
        this._claimed.delete(actor);

        actor.show();
        this._runTransition(actor, 'open', this.settingsData.OPEN_EFFECT.get(),
            this.settingsData.OPEN_DURATION.get(), () => {});
    }

    _onDestroy(actor) {
        if (this._claimed.get(actor) !== 'destroy') {
            return;
        }

        const effect = this.settingsData.CLOSE_EFFECT.get();
        this._runTransition(actor, 'close', effect,
            this.settingsData.CLOSE_DURATION.get(), () => this._complete('destroy', actor));
    }

    _runTransition(actor, mode, effect, duration, onDone) {
        // Giá trị lạ trong dconf (ví dụ 'burn' từ bản trước) thì dùng zoom.
        if (effect !== 'none' && !isKnownEffect(effect)) {
            effect = 'scale';
        }
        // Hiệu ứng 'none' hoặc đang ở Overview: không chạy hoạt ảnh.
        const skip = effect === 'none' || Main.overview.visible;

        const previous = this._transitions.get(actor);
        if (previous) {
            previous.abort();
        }

        // onDone có thể chạy ngay trong constructor (khi không có hoạt ảnh), lúc đó
        // biến transition chưa có giá trị, nên khai báo trước.
        let transition = null;
        transition = new WindowTransition(actor, {
            mode,
            effect: skip ? 'none' : effect,
            duration: skip ? 0 : duration,
            onDone: () => {
                if (this._transitions && this._transitions.get(actor) === transition) {
                    this._transitions.delete(actor);
                }
                onDone();
            },
        });

        // Nếu hiệu ứng đã kết thúc ngay trong constructor thì không cần lưu lại.
        if (!transition._finished) {
            this._transitions.set(actor, transition);
        }
    }

    // ---- Thu nhỏ / phóng to (Magic Lamp) ----------------------------------

    _onMinimize(actor) {
        if (this._claimed.get(actor) !== 'minimize') {
            return;
        }
        if (Main.overview.visible) {
            this._complete('minimize', actor);
            return;
        }

        const icon = this._getIcon(actor);
        this._destroyLampEffects(actor);
        actor.add_effect_with_name(MINIMIZE_EFFECT_NAME, new MagicLampMinimizeEffect({
            settingsData: this.settingsData,
            icon,
            onDone: () => this._complete('minimize', actor),
        }));
    }

    _onUnminimize(actor) {
        if (this._claimed.get(actor) !== 'unminimize') {
            return;
        }
        actor.show();

        if (Main.overview.visible) {
            this._complete('unminimize', actor);
            return;
        }

        const icon = this._getIcon(actor);
        this._destroyLampEffects(actor);
        actor.add_effect_with_name(UNMINIMIZE_EFFECT_NAME, new MagicLampUnminimizeEffect({
            settingsData: this.settingsData,
            icon,
            onDone: () => this._complete('unminimize', actor),
        }));
    }

    _getIcon(actor) {
        let [success, icon] = actor.meta_window.get_icon_geometry();
        if (success) {
            return icon;
        }

        let monitor = Main.layoutManager.monitors[actor.meta_window.get_monitor()];
        if (monitor && Main.overview.dash) {
            Main.overview.dash._redisplay();

            let dashIcon = null;
            let transformed_position = null;
            let pids = null;
            let pid = actor.get_meta_window() ? actor.get_meta_window().get_pid() : null;
            if (pid) {
                Main.overview.dash._box.get_children()
                    .filter(dashElement => dashElement.child && dashElement.child._delegate && dashElement.child._delegate.app)
                    .forEach(dashElement => {
                        pids = dashElement.child._delegate.app.get_pids();
                        if (pids && pids.indexOf(pid) >= 0) {
                            transformed_position = dashElement.get_transformed_position();
                            if (transformed_position && transformed_position[0]) {
                                dashIcon = {x: transformed_position[0], y: monitor.y + monitor.height, width: 0, height: 0};
                                return;
                            }
                        }
                    });
            }
            if (dashIcon) {
                return dashIcon;
            }

            return {x: monitor.x + monitor.width / 2, y: monitor.y + monitor.height, width: 0, height: 0};
        }

        return {x: 0, y: 0, width: 0, height: 0};
    }

    _destroyLampEffects(actor) {
        if (!actor) {
            return;
        }

        const minimizeEffect = actor.get_effect(MINIMIZE_EFFECT_NAME);
        if (minimizeEffect) {
            minimizeEffect.destroy();
        }

        const unminimizeEffect = actor.get_effect(UNMINIMIZE_EFFECT_NAME);
        if (unminimizeEffect) {
            unminimizeEffect.destroy();
        }
    }
}
