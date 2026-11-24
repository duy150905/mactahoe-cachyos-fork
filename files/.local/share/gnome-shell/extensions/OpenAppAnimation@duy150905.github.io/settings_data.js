/*
 * Open App Animation for GNOME Shell
 *
 * Based on Compiz-alike-magic-lamp-effect
 * Copyright (C) 2020 Mauro Pepe <https://github.com/hermes83/compiz-alike-magic-lamp-effect>
 * Modifications (C) 2026 duy150905: renamed to "Open App Animation", added
 * open/close window effects and extra settings.
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

export const OPEN_CLOSE_EFFECTS = ['default', 'none', 'scale', 'tv'];
export const MINIMIZE_EFFECTS = ['lamp', 'default'];
export const LAMP_CURVES = ['default', 'sine'];

function stringKey(settings, key) {
    return {
        key,
        get: () => settings.get_string(key),
        set: v => settings.set_string(key, v),
    };
}

function doubleKey(settings, key) {
    return {
        key,
        get: () => settings.get_double(key),
        set: v => settings.set_double(key, v),
    };
}

export class SettingsData {
    constructor(settings) {
        this.settings = settings;

        // Magic Lamp (thu nhỏ / phóng to)
        this.MINIMIZE_EFFECT = stringKey(settings, 'minimize-effect');
        this.EFFECT = stringKey(settings, 'effect');
        this.DURATION = doubleKey(settings, 'duration');
        this.X_TILES = doubleKey(settings, 'x-tiles');
        this.Y_TILES = doubleKey(settings, 'y-tiles');

        // Mở / đóng ứng dụng
        this.OPEN_EFFECT = stringKey(settings, 'open-effect');
        this.CLOSE_EFFECT = stringKey(settings, 'close-effect');
        this.OPEN_DURATION = doubleKey(settings, 'open-duration');
        this.CLOSE_DURATION = doubleKey(settings, 'close-duration');
    }
}
