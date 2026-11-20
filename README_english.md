# MacTahoe for CachyOS

An installer to build a macOS Tahoe-style interface on GNOME (CachyOS/Arch): GTK theme, cursors, extensions, Conky widgets, and GNOME settings. One command to install, one command to uninstall.

Tested on CachyOS with GNOME Shell 51 (see `data/manifest.env`). On different GNOME versions, extensions might not work; `install.sh` will show a warning without blocking the installation.

## Requirements

- CachyOS or Arch Linux with GNOME Shell installed.
- Must be run inside the terminal of an active GNOME session (requires a D-Bus session) under a regular user account. Do not run `sudo bash install.sh`; the script will prompt for `sudo` automatically when installing packages.

## Installation

```bash
git clone https://github.com/duy150905/mactahoe-cachyos-fork.git
cd mactahoe-cachyos-fork

./install.sh --dry-run    # dry run, prints steps without making changes
./install.sh              # actual installation
```

Log out and log back in for GNOME to load the themes and extensions.

| Flag | Description |
| --- | --- |
| `--dry-run` | Display steps only without making any changes |
| `--skip-packages` | Skip installing pacman packages, copy configurations only |
| `--no-dconf` | Do not load GNOME dconf settings |

## Uninstallation

Before overwriting, `install.sh` backs up the paths listed in `data/paths.txt` and dumps dconf settings into `~/.local/state/mactahoe-restore/`. To revert to your previous state:

```bash
./uninstall.sh --dry-run   # preview changes
./uninstall.sh             # remove copied files, restore backups, reset dconf
```

Installed pacman packages will not be removed. Logs for each installation are stored in the same backup directory.

## Directory Structure

```
install.sh, uninstall.sh   main scripts
data/
  manifest.env             tested environment (distro, GNOME Shell version)
  paths.txt                paths in ~ to be backed up and overwritten
  packages.txt             pacman packages to install
  extensions.tsv           extensions to enable
  units-enabled.txt        systemd --user services to enable
dconf/gnome.ini            GNOME settings
hooks/                     custom post-install command templates
files/                     contents copied to $HOME, preserving directory structure
```

Inside `files/`:

```
.themes/                               MacTahoe (Light/Dark, solid)
.config/gtk-3.0, gtk-4.0/              settings, css, bookmarks
.config/conky/                         7 widgets and lua drawing scripts
.config/systemd/user/                  color-scheme-sync.service
.local/bin/                            helper scripts (detailed below)
.local/share/applications/             .desktop launchers
.local/share/backgrounds/              default wallpaper
.local/share/fonts/                    Montserrat, Allura (datecard), Nerd Font, and miscellaneous fonts
.local/share/icons/                    MacTahoe cursors, WhiteSur icon theme
.local/share/gnome-shell/extensions/   CachyOSTahoe, CachyOSTahoeDock, blur-my-shell, moveclock
.local/share/mactahoe-apps/            two Python apps: lunar calendar, image compressor
.local/share/mactahoe-widgets/         lunar.py for the lunar calendar widget
```

Scripts inside `.local/bin/`:

- `mactahoe-widgets`: GUI to toggle widgets, select weather city, and pick the large clock color. Commands: `start|stop|restart|status|color [color]`.
- `mactahoe-cava-feed`: runs `cava` and feeds audio data to the music visualizer widget (invoked by `mactahoe-widgets`).
- `mactahoe-weather-fetch.py`: fetches weather data from Open-Meteo, called by Conky every 10 minutes.
- `mactahoe-lunar-fetch.py`: generates lunar calendar data for the widget.
- `color-scheme-sync.sh`: monitors GNOME's `color-scheme` and switches GTK/Shell themes between Light and Dark.
- `mactahoe-icon-manager`: GTK4 app to change icons for individual applications.
- `gnome-theme-switcher`, `am-lich-viet-nam`, `image-compressor`: self-explanatory utilities.

## Customization

**Packages.** Edit `data/packages.txt` (one package per line, `#` for comments).

**Copied Files.** Edit `data/paths.txt`. Remove a line to prevent that path from being overwritten (e.g., remove `.local/share/backgrounds` if you want to keep your current wallpaper).

**GNOME Settings.** Edit `dconf/gnome.ini`. Commonly tweaked keys:

- Wallpapers: `picture-uri`, `picture-uri-dark`
- Themes & Cursors: `gtk-theme`, `icon-theme`, `cursor-theme`, `cursor-size`, `accent-color`
- Appearance: `color-scheme` (`default` for light, `prefer-dark` for dark)
- Typography: `font-name`, `monospace-font-name`, `text-scaling-factor`
- Window controls: `button-layout` (close/minimize/maximize buttons are set to the left)
- Dock pins: `favorite-apps` (uninstalled apps are automatically filtered out)
- Blur-my-shell intensity: `sigma`, `brightness`, `unscaled_radius`
- Top bar: `clock-position`, `clock-offset`, `hide-activities`
- Dock behavior: `click-action`, `dash-max-icon-size`

When `color-scheme-sync` is running, `gtk-theme` and `user-theme` are automatically switched based on light/dark mode. To toggle light/dark mode, change `color-scheme` rather than editing theme names directly.

**Fonts.** The interface uses Inter and JetBrains Mono (`inter-font`, `ttf-jetbrains-mono` packages). You can change fonts in `dconf/gnome.ini`, `files/.config/gtk-{3,4}.0/settings.ini`, and `files/.config/conky/mactahoe-*.conf`.

**Weather.** Configured at `~/.config/mactahoe-widgets/weather.conf`, generated when running `mactahoe-widgets`. Keys: `LAT`, `LON`, `CITY`, `TIMEZONE`, `LOCATION_MODE` (`manual` or `auto` IP lookup via ipapi.co), `ICON_THEME`. Defaults to Hanoi. Recommended to configure via the GUI, which includes a city search box.

**Conky Widgets.** `files/.config/conky/mactahoe-*.conf` (one file per widget): `alignment`, `gap_x`/`gap_y`, width, `font`, `update_interval`. Positions are calibrated for the original author's display; `mactahoe-widgets` rearranges them automatically when toggled, though you can fine-tune `gap_x`/`gap_y` if misaligned. Keep `output_backend = 'x11'`: removing it can cause newer Conky versions to crash on Wayland.

**Large Clock Color.** Select via the `mactahoe-widgets` GUI or run `mactahoe-widgets color purple`. The selection is saved in `~/.cache/mactahoe-widgets/clock_theme.txt` and applied immediately.

**Date Card.** The `datecard` widget displays the weekday, day (spelled out in words), month, and time at the top center of the screen. Disabled by default; enable it in the `mactahoe-widgets` menu. Its white and orange colors are fixed and do not follow the "Clock and cava color" setting. Quick tweaks are available at the top of `files/.config/conky/mactahoe-datecard.lua`: `FONT_DAY`, `FONT_SCRIPT`, `SCALE`, `ORANGE`. Because it sits at the center of the screen, it may overlap with the Large Clock; enable only one of the two, or adjust `gap_x` in `mactahoe-datecard.conf`.

**Autostart Widgets on Login.** Handled by `files/.config/autostart/mactahoe-widgets.desktop`. To disable, delete this file from `~/.config/autostart/`.

**Custom Post-Install Commands.** Rename `hooks/post-install.example.sh` to `hooks/post-install.sh` and add your custom commands; `install.sh` executes it at the very end. This file is already ignored by `.gitignore`.

## Notes

- **Icon theme and cursor.** Defaults to the `WhiteSur-dark` icons, the `MacTahoe-dark-cursors` cursor, and `MacTahoe-Light` for Shell and GTK (all bundled in this repository). `mactahoe-icon-manager` needs the `MacTahoe` icon theme installed separately (vinceliuice/MacTahoe-icon-theme); the weather widget uses WhiteSur's symbolic icons.
- **Extensions.** `install.sh` only *adds* the extensions marked `bật` in `data/extensions.tsv` (via `data/merge-extensions.py`) and never overwrites the list of extensions you already use. User Themes is always enabled so the Shell theme takes effect. `extension-manager` is listed in `data/packages.txt`.
- **System Extensions** (`user-theme`, `system-monitor`, etc.) are part of the `gnome-shell-extensions` package, which is already included in `data/packages.txt`.
- **Wallpapers.** The default wallpaper is `files/Wallpaper/astronaut_4k_1.png`: `install.sh` copies it to `~/.local/share/backgrounds/` and sets it as the background (if the file is missing, the old `mactahoe-default.jpg` is kept). To use another image, edit `picture-uri` and `picture-uri-dark` in `dconf/gnome.ini` (and the copy step in `install.sh`). `files/Wallpapers/` is not installed automatically. The images have no explicit source or license attribution; please replace them with your own if you plan to redistribute this project.
- The scripts only operate within `~`, never touching `/etc`, GDM, or the kernel, and contain no personal accounts or passwords.

## Credits

- MacTahoe GTK theme, icons, cursors, and WhiteSur icons: [vinceliuice](https://github.com/vinceliuice).
- CachyOSTahoe and CachyOSTahoeDock extensions: based on [adfoxtheme/mactahoe-ubuntu](https://github.com/adfoxtheme/mactahoe-ubuntu).
- [Blur my Shell](https://github.com/aunetx/blur-my-shell) by aunetx.
- [moveclock](https://github.com/kuvaus/moveclock) by kuvaus.
- [Montserrat](https://github.com/JulietaUla/Montserrat) and [Allura](https://github.com/googlefonts/allura) fonts under the SIL Open Font License 1.1; license copies are located alongside the font files in `files/.local/share/fonts/`.

## License

The repository's source code is licensed under GNU GPL v3 (see `LICENSE`). Third-party components (themes, icons, fonts, extensions) retain their respective project licenses.
