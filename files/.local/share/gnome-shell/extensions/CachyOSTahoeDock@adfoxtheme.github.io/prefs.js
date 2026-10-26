import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class CachyOSTahoeDockPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: 'Cài đặt CachyOSTahoe Dock',
            icon_name: 'preferences-desktop-display-symbolic',
        });
        window.add(page);

        const group = new Adw.PreferencesGroup({
            title: 'Kích thước Dock',
            description: 'Kéo thanh trượt qua lại để tùy chỉnh độ lớn biểu tượng trên thanh Dock',
        });
        page.add(group);

        const iconSizeRow = new Adw.ActionRow({
            title: 'Kích thước biểu tượng',
            subtitle: 'Mặc định chuẩn macOS Tahoe là 45px',
        });

        const scale = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            adjustment: new Gtk.Adjustment({
                lower: 24,
                upper: 96,
                step_increment: 1,
                page_increment: 5,
                value: settings.get_int('dash-max-icon-size') || 45,
            }),
            digits: 0,
            draw_value: true,
            hexpand: true,
            valign: Gtk.Align.CENTER,
        });

        scale.set_size_request(240, -1);

        scale.connect('value-changed', () => {
            const val = Math.round(scale.get_value());
            if (settings.get_int('dash-max-icon-size') !== val) {
                settings.set_int('dash-max-icon-size', val);
            }
        });

        settings.connect('changed::dash-max-icon-size', () => {
            const val = settings.get_int('dash-max-icon-size');
            if (scale.get_value() !== val) {
                scale.set_value(val);
            }
        });

        iconSizeRow.add_suffix(scale);
        group.add(iconSizeRow);
    }
}
