/*
 * Open App Animation for GNOME Shell
 *
 * Open/close window effects. Written for this extension.
 *
 * Copyright (C) 2026 duy150905
 *
 * Open App Animation is based on Compiz-alike-magic-lamp-effect,
 * Copyright (C) 2020 Mauro Pepe <https://github.com/hermes83/compiz-alike-magic-lamp-effect>
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

import Clutter from 'gi://Clutter';

const clamp01 = value => Math.min(1, Math.max(0, value));

/**
 * Hiệu ứng "v" chạy từ 0 (ẩn) đến 1 (hiện) khi mở, và ngược lại khi đóng.
 * Mỗi hiệu ứng chỉ mô tả trạng thái của cửa sổ theo v.
 */
const EFFECTS = {
    scale(actor, v) {
        const s = 0.82 + 0.18 * v;
        actor.set_scale(s, s);
        actor.opacity = Math.round(255 * clamp01(v * 1.6));
    },

    tv(actor, v) {
        // Như màn hình CRT: một vạch ngang rồi nở ra (mở); thu thành vạch rồi tắt (đóng).
        const split = 0.4;
        const tiny = 0.01;
        if (v < split) {
            actor.set_scale(Math.max(v / split, tiny), tiny);
        } else {
            actor.set_scale(1, tiny + (1 - tiny) * ((v - split) / (1 - split)));
        }
        actor.opacity = 255;
    },
};

export function isKnownEffect(name) {
    return Object.prototype.hasOwnProperty.call(EFFECTS, name);
}

/**
 * Một lần chạy hiệu ứng mở hoặc đóng trên một WindowActor.
 *
 * mode: 'open' | 'close'
 * onDone: gọi đúng một lần khi hiệu ứng kết thúc hoặc bị hủy.
 */
export class WindowTransition {
    constructor(actor, {mode, effect, duration, onDone}) {
        this._actor = actor;
        this._mode = mode;
        this._effect = effect;
        this._onDone = onDone;
        this._finished = false;
        this._timeline = null;
        this._frameId = 0;
        this._completedId = 0;
        this._destroyId = 0;
        this._saved = {
            pivot: actor.get_pivot_point(),
            scaleX: actor.scale_x,
            scaleY: actor.scale_y,
            opacity: actor.opacity,
        };

        if (!isKnownEffect(effect) || duration <= 0) {
            this._finish();
            return;
        }

        actor.set_pivot_point(0.5, 0.5);

        this._destroyId = actor.connect('destroy', () => {
            this._destroyId = 0;
            this._actor = null;
            this._finish();
        });

        this._timeline = new Clutter.Timeline({actor, duration});
        this._frameId = this._timeline.connect('new-frame', () => this._onFrame());
        this._completedId = this._timeline.connect('completed', () => this._finish());

        this._apply(0);
        this._timeline.start();
    }

    _visibility(progress) {
        const eased = this._mode === 'open'
            ? 1 - Math.pow(1 - progress, 3)
            : progress * progress * (3 - 2 * progress);
        return this._mode === 'open' ? eased : 1 - eased;
    }

    _apply(progress) {
        const actor = this._actor;
        if (!actor) {
            return;
        }
        EFFECTS[this._effect](actor, this._visibility(progress));
        actor.queue_redraw();
    }

    _onFrame() {
        if (this._timeline) {
            this._apply(this._timeline.get_progress());
        }
    }

    /** Dừng ngay (dùng khi tắt extension). onDone vẫn được gọi. */
    abort() {
        this._finish();
    }

    _finish() {
        if (this._finished) {
            return;
        }
        this._finished = true;

        if (this._timeline) {
            if (this._frameId) {
                this._timeline.disconnect(this._frameId);
            }
            if (this._completedId) {
                this._timeline.disconnect(this._completedId);
            }
            this._timeline.stop();
            this._timeline = null;
        }

        const actor = this._actor;
        this._actor = null;
        if (actor) {
            if (this._destroyId) {
                actor.disconnect(this._destroyId);
            }
            const [pivotX, pivotY] = this._saved.pivot;
            actor.set_pivot_point(pivotX, pivotY);
            actor.set_scale(this._saved.scaleX, this._saved.scaleY);
            actor.opacity = this._saved.opacity;
        }

        if (this._onDone) {
            const done = this._onDone;
            this._onDone = null;
            done();
        }
    }
}
