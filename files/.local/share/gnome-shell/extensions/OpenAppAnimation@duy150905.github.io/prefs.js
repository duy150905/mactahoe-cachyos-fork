/*
 * Open App Animation for GNOME Shell
 *
 * Based on Compiz-alike-magic-lamp-effect
 * Copyright (C) 2020 Mauro Pepe <https://github.com/hermes83/compiz-alike-magic-lamp-effect>
 * Modifications (C) 2026 duy150905: new preferences UI, open/close effect settings,
 * credits page.
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

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {SettingsData, OPEN_CLOSE_EFFECTS, MINIMIZE_EFFECTS, LAMP_CURVES} from './settings_data.js';

const EFFECT_LABELS = {
    'default': 'Mặc định của GNOME',
    'none': 'Không hiệu ứng',
    'scale': 'Zoom (kiểu macOS)',
    'tv': 'TV (màn hình CRT)',
    'lamp': 'Magic Lamp',
    'sine': 'Sóng sin',
};

const labelOf = value => EFFECT_LABELS[value] || value;

export default class OpenAppAnimationPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const data = new SettingsData(settings);

        const page = new Adw.PreferencesPage({
            title: 'Hiệu ứng',
            icon_name: 'preferences-desktop-appearance-symbolic',
        });

        // Mở / đóng
        const openClose = new Adw.PreferencesGroup({
            title: 'Mở và đóng ứng dụng',
            description: 'Hiệu ứng khi cửa sổ xuất hiện hoặc biến mất. "Mặc định của GNOME" trả lại hoạt ảnh gốc.',
        });
        openClose.add(this._comboRow('Hiệu ứng mở', data.OPEN_EFFECT, OPEN_CLOSE_EFFECTS));
        openClose.add(this._spinRow('Thời gian mở (ms)', data.OPEN_DURATION, 50, 2000, 10));
        openClose.add(this._comboRow('Hiệu ứng đóng', data.CLOSE_EFFECT, OPEN_CLOSE_EFFECTS));
        openClose.add(this._spinRow('Thời gian đóng (ms)', data.CLOSE_DURATION, 50, 2000, 10));
        page.add(openClose);

        // Thu nhỏ / phóng to
        const minimize = new Adw.PreferencesGroup({
            title: 'Thu nhỏ và phóng to',
            description: 'Hiệu ứng Magic Lamp hút cửa sổ vào biểu tượng trên dock.',
        });
        minimize.add(this._comboRow('Hiệu ứng thu nhỏ', data.MINIMIZE_EFFECT, MINIMIZE_EFFECTS));
        minimize.add(this._comboRow('Đường cong Magic Lamp', data.EFFECT, LAMP_CURVES));
        minimize.add(this._spinRow('Thời gian (ms)', data.DURATION, 100, 1000, 10));
        minimize.add(this._spinRow('Số ô ngang', data.X_TILES, 3, 50, 1));
        minimize.add(this._spinRow('Số ô dọc', data.Y_TILES, 3, 50, 1));
        page.add(minimize);

        // Khôi phục mặc định
        const reset = new Adw.PreferencesGroup();
        const resetRow = new Adw.ActionRow({
            title: 'Khôi phục mặc định',
            subtitle: 'Đặt lại mọi thiết lập của extension này',
        });
        const resetButton = new Gtk.Button({label: 'Khôi phục', valign: Gtk.Align.CENTER});
        resetButton.add_css_class('destructive-action');
        resetButton.connect('clicked', () => {
            settings.list_keys().forEach(key => settings.reset(key));
            window.close();
        });
        resetRow.add_suffix(resetButton);
        reset.add(resetRow);
        page.add(reset);

        // Ghi công
        const about = new Adw.PreferencesGroup({
            title: 'Ghi công',
            description: 'Extension này là bản chỉnh sửa từ một dự án GPL-3.0, đã được tác giả gốc đồng ý.',
        });
        about.add(this._linkRow(
            'Magic Lamp: Compiz alike magic lamp effect',
            'Tác giả: Mauro Pepe (hermes83), © 2020',
            'https://github.com/hermes83/compiz-alike-magic-lamp-effect'));
        about.add(this._linkRow(
            'Open App Animation',
            'Đổi tên, thêm hiệu ứng mở/đóng: duy150905',
            this.metadata.url));
        page.add(about);

        window.set_default_size(640, 780);
        window.add(page);
    }

    _comboRow(title, field, values) {
        const row = new Adw.ComboRow({
            title,
            model: Gtk.StringList.new(values.map(labelOf)),
        });

        const current = values.indexOf(field.get());
        row.set_selected(current >= 0 ? current : 0);
        row.connect('notify::selected', () => {
            const value = values[row.get_selected()];
            if (value !== undefined && value !== field.get()) {
                field.set(value);
            }
        });
        return row;
    }

    _spinRow(title, field, lower, upper, step) {
        const row = new Adw.SpinRow({
            title,
            adjustment: new Gtk.Adjustment({lower, upper, step_increment: step, page_increment: step * 10}),
            digits: 0,
        });

        row.set_value(field.get());
        row.connect('notify::value', () => {
            const value = row.get_value();
            if (value !== field.get()) {
                field.set(value);
            }
        });
        return row;
    }

    _linkRow(title, subtitle, uri) {
        const row = new Adw.ActionRow({title, subtitle, activatable: true});
        row.add_suffix(new Gtk.Image({icon_name: 'adw-external-link-symbolic'}));
        row.connect('activated', () => {
            Gtk.show_uri(null, uri, 0);
        });
        return row;
    }
}
