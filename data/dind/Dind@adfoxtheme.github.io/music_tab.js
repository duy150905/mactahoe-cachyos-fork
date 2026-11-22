import Cairo from 'gi://cairo';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';

const TICK_MS = 200;
const SYNC_EVERY_TICKS = 20;

const LYRIC_GAP = 10;
const LYRIC_SCROLL_MS = 520;
const LYRIC_FADE_MS = 380;
const LYRIC_LEVELS = [
    { opacity: 255, scale: 1.0 },
    { opacity: 105, scale: 0.94 },
    { opacity: 55, scale: 0.90 },
];

const BAR_H = 14;
const BAR_THICK = 4;
const BAR_THICK_ACTIVE = 6;
const KNOB_R = 6;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function fmt(us) {
    const s = Math.max(0, Math.floor(us / 1e6));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function label(styleClass, wrap = false) {
    const l = new St.Label({
        style_class: styleClass,
        x_expand: true,
        x_align: Clutter.ActorAlign.FILL,
    });
    if (wrap) {
        l.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        l.clutter_text.line_wrap = true;
        l.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
    } else {
        l.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    }
    return l;
}

export class MusicTab {
    constructor({ mpris, art, lyrics, settings }) {
        this._mpris = mpris;
        this._art = art;
        this._lyrics = lyrics;
        this._settings = settings;

        this._player = null;
        this._visible = false;
        this._tickId = 0;
        this._ticks = 0;
        this._key = '';
        this._artToken = 0;
        this._lyricsData = null;
        this._cancelLyrics = null;
        this._lastIdx = -2;
        this._lyLabels = [];
        this._lyOff = [];
        this._lyH = [];
        this._lyLevels = [];
        this._lyBuilt = null;
        this._lyW = 0;
        this._lyVH = 0;
        this._lyDirty = false;
        this._lyMode = 'none';
        this._lyMsgText = '';
        this._lyNoAnimOnce = false;
        this._progress = 0;
        this._dragging = false;
        this._dragFrac = 0;
        this._dragId = 0;

        this._build();
    }

    get title() { return 'Nhạc'; }
    get actor() { return this._root; }

    _build() {
        this._root = new St.BoxLayout({
            name: 'dind-music',
            style_class: 'dind-music',
            orientation: Clutter.Orientation.VERTICAL,
        });

        const top = new St.BoxLayout({ style_class: 'dind-music-top' });
        this._root.add_child(top);

        this._cover = new St.Widget({
            style_class: 'dind-cover',
            width: 104,
            height: 104,
            y_align: Clutter.ActorAlign.START,
            layout_manager: new Clutter.BinLayout(),
        });
        this._coverIcon = new St.Icon({
            icon_name: 'audio-x-generic-symbolic',
            style_class: 'dind-cover-icon',
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._cover.add_child(this._coverIcon);
        top.add_child(this._cover);

        const info = new St.BoxLayout({
            style_class: 'dind-info',
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        top.add_child(info);

        this._title = label('dind-title');
        this._artist = label('dind-artist');
        info.add_child(this._title);
        info.add_child(this._artist);

        const controls = new St.BoxLayout({
            style_class: 'dind-controls',
            x_align: Clutter.ActorAlign.START,
        });
        this._prev = this._button('media-skip-backward-symbolic', () => this._player?.previous());
        this._play = this._button('media-playback-start-symbolic', () => this._player?.playPause(), true);
        this._next = this._button('media-skip-forward-symbolic', () => this._player?.next());
        [this._prev, this._play, this._next].forEach(b => controls.add_child(b));
        info.add_child(controls);

        const progress = new St.BoxLayout({ style_class: 'dind-progress' });
        this._cur = new St.Label({ style_class: 'dind-time', text: '0:00', y_align: Clutter.ActorAlign.CENTER });
        this._dur = new St.Label({ style_class: 'dind-time', text: '--:--', y_align: Clutter.ActorAlign.CENTER });
        this._trackWrap = new St.DrawingArea({
            style_class: 'dind-track-wrap',
            reactive: true,
            track_hover: true,
            x_expand: true,
            height: BAR_H,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._trackWrap.connect('repaint', area => this._drawBar(area));
        this._trackWrap.connect('notify::hover', () => this._trackWrap.queue_repaint());
        this._trackWrap.connect('button-press-event', (_a, event) => {
            if (event.get_button() !== Clutter.BUTTON_PRIMARY)
                return Clutter.EVENT_PROPAGATE;
            this._beginDrag(event);
            return Clutter.EVENT_STOP;
        });
        progress.add_child(this._cur);
        progress.add_child(this._trackWrap);
        progress.add_child(this._dur);
        info.add_child(progress);

        this._lyricsBox = new St.Widget({
            style_class: 'dind-lyrics',
            clip_to_allocation: true,
            x_expand: true,
            y_expand: true,
            min_width: 0,
            natural_width: 0,
            min_height: 0,
            natural_height: 0,
        });
        this._lyList = new St.Widget({ visible: false });
        this._lyMsg = new St.Label({ style_class: 'dind-lyric-msg', visible: false });
        for (const ct of [this._lyMsg.clutter_text]) {
            ct.ellipsize = Pango.EllipsizeMode.NONE;
            ct.line_wrap = true;
            ct.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
            ct.line_alignment = Pango.Alignment.CENTER;
        }
        this._lyricsBox.add_child(this._lyList);
        this._lyricsBox.add_child(this._lyMsg);
        this._root.add_child(this._lyricsBox);
    }

    _button(iconName, onClick, main = false) {
        const icon = new St.Icon({ icon_name: iconName, style_class: 'dind-btn-icon' });
        const button = new St.Button({
            style_class: main ? 'dind-btn dind-btn-main' : 'dind-btn',
            child: icon,
            can_focus: true,
            reactive: true,
        });
        button._enabled = true;
        button.connect('clicked', () => {
            if (button._enabled)
                onClick();
        });
        button._icon = icon;
        return button;
    }


    onShow() {
        this._visible = true;
        this._lyNoAnimOnce = true;
        this.refresh();
        this._ensureLyrics();
        this._startTick();
    }

    onHide() {
        this._visible = false;
        this._endDrag(null, false);
        this._stopTick();
    }

    destroy() {
        this._endDrag(null, false);
        this._stopTick();
        this._cancelLyrics?.();
        this._cancelLyrics = null;
        ++this._artToken;
    }

    refresh() {
        const player = this._mpris.active;
        this._player = player;

        if (!player || !player.metadata.title) {
            this._showIdle();
            return;
        }

        const m = player.metadata;
        this._title.text = m.title;
        this._artist.text = [m.artist, m.album].filter(Boolean).join(' · ');
        this._play._icon.icon_name = player.status === 'Playing'
            ? 'media-playback-pause-symbolic'
            : 'media-playback-start-symbolic';
        this._setEnabled(this._prev, player.canGoPrevious);
        this._setEnabled(this._next, player.canGoNext);
        this._setEnabled(this._play, true);
        this._lyricsBox.visible = this._settings.get_boolean('lyrics-enabled');

        const key = `${m.trackId}|${m.title}|${m.artist}|${m.length}`;
        if (key !== this._key) {
            this._key = key;
            this._cancelLyrics?.();
            this._cancelLyrics = null;
            this._lyricsData = null;
            this._clearLyrics();
            this._setCover(m.artUrl);
            if (this._visible)
                this._ensureLyrics();
        }
        this._update();
    }

    _showIdle() {
        this._key = '';
        this._title.text = 'Không có nhạc đang phát';
        this._artist.text = 'Mở Spotify, trình duyệt hoặc trình phát nhạc bất kỳ';
        this._play._icon.icon_name = 'media-playback-start-symbolic';
        [this._prev, this._play, this._next].forEach(b => this._setEnabled(b, false));
        this._cur.text = '0:00';
        this._dur.text = '--:--';
        this._progress = 0;
        this._trackWrap.queue_repaint();
        this._setCover('');
        this._cancelLyrics?.();
        this._cancelLyrics = null;
        this._lyricsData = null;
        this._clearLyrics();
    }

    _setEnabled(button, enabled) {
        button._enabled = enabled;
        button.can_focus = enabled;
        button.opacity = enabled ? 255 : 90;
        if (enabled)
            button.remove_style_pseudo_class('disabled');
        else
            button.add_style_pseudo_class('disabled');
    }

    _setCover(url) {
        const token = ++this._artToken;
        this._cover.set_style(null);
        this._coverIcon.show();
        if (!url)
            return;
        this._art.get(url, path => {
            if (token !== this._artToken || !path)
                return;
            this._cover.set_style(`background-image: url("file://${path}"); background-size: cover;`);
            this._coverIcon.hide();
        });
    }

    _ensureLyrics() {
        const player = this._player;
        const settled = this._lyricsData && this._lyricsData.state !== 'error';
        if (!player || !player.hasTrack || settled || this._cancelLyrics)
            return;
        if (!this._settings.get_boolean('lyrics-enabled'))
            return;

        const key = this._key;
        this._lyricsData = null;
        this._lastIdx = -2;
        this._showMessage('Đang tìm lời bài hát…');

        let finished = false;
        try {
            const cancel = this._lyrics.fetch(player.metadata, result => {
                finished = true;
                if (key !== this._key)
                    return;
                this._cancelLyrics = null;
                this._lyricsData = result;
                this._lastIdx = -2;
                this._update();
            });
            if (!finished)
                this._cancelLyrics = cancel;
        } catch (e) {
            console.error(`[Dind] fetch lời bài hát ném lỗi: ${e.message}\n${e.stack}`);
            this._cancelLyrics = null;
            this._lyricsData = { state: 'error', lines: [] };
            this._lastIdx = -2;
            this._update();
        }
    }

    _lineIndex(lines, posMs) {
        let lo = 0;
        let hi = lines.length - 1;
        let idx = -1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (lines[mid].t <= posMs) {
                idx = mid;
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
        return idx;
    }

    _clearLyrics() {
        this._lyList.remove_all_transitions();
        this._lyList.destroy_all_children();
        this._lyList.hide();
        this._lyMsg.remove_all_transitions();
        this._lyMsg.hide();
        this._lyLabels = [];
        this._lyOff = [];
        this._lyH = [];
        this._lyLevels = [];
        this._lyBuilt = null;
        this._lyMode = 'none';
        this._lastIdx = -2;
    }

    _showMessage(text) {
        this._lyMode = 'msg';
        this._lyMsgText = text;
        this._lyList.hide();
        this._renderMessage();
    }

    _renderMessage() {
        if (this._lyMode !== 'msg')
            return;
        const w = Math.round(this._lyricsBox.width);
        const vh = Math.round(this._lyricsBox.height);
        if (!(w > 0 && vh > 0)) {
            this._lyMsg.hide();
            return;
        }
        const fresh = this._lyMsg.text !== this._lyMsgText || !this._lyMsg.visible;
        this._lyMsg.text = this._lyMsgText;
        const [, mh] = this._lyMsg.get_preferred_height(w);
        this._lyMsg.set_size(w, Math.ceil(mh));
        this._lyMsg.set_position(0, Math.max(0, Math.round((vh - mh) / 2)));
        if (fresh) {
            this._lyMsg.remove_all_transitions();
            this._lyMsg.opacity = 0;
            this._lyMsg.ease({ opacity: 255, duration: 240, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
        }
        this._lyMsg.show();
    }

    _buildLyricLines(data) {
        this._lyList.remove_all_transitions();
        this._lyList.destroy_all_children();
        this._lyLabels = data.lines.map(line => {
            const l = new St.Label({ style_class: 'dind-lyric-line', text: line.text || '♪', opacity: 0 });
            const ct = l.clutter_text;
            ct.ellipsize = Pango.EllipsizeMode.NONE;
            ct.line_wrap = true;
            ct.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
            ct.line_alignment = Pango.Alignment.CENTER;
            l.set_pivot_point(0.5, 0.5);
            this._lyList.add_child(l);
            return l;
        });
        this._lyOff = [];
        this._lyH = [];
        this._lyLevels = [];
        this._lyBuilt = data;
        this._lyDirty = true;
        this._lastIdx = -2;
    }

    _layoutLyrics() {
        const w = this._lyW;
        let y = 0;
        this._lyLabels.forEach((l, i) => {
            const [, h] = l.get_preferred_height(w);
            const height = Math.ceil(h);
            this._lyOff[i] = y;
            this._lyH[i] = height;
            l.set_size(w, height);
            l.set_position(0, y);
            y += height + LYRIC_GAP;
        });
        this._lyList.set_size(w, Math.max(0, y - LYRIC_GAP));
    }

    _syncLyricGeometry() {
        const w = Math.round(this._lyricsBox.width);
        const vh = Math.round(this._lyricsBox.height);
        if (!(w > 0 && vh > 0))
            return null;
        if (w === this._lyW && vh === this._lyVH && !this._lyDirty)
            return false;
        this._lyW = w;
        this._lyVH = vh;
        this._lyDirty = false;
        this._layoutLyrics();
        this._renderMessage();
        return true;
    }

    _showScroller() {
        this._lyMsg.hide();
        if (this._lyMode === 'list')
            return;
        this._lyMode = 'list';
        this._lyList.remove_all_transitions();
        this._lyList.opacity = 0;
        this._lyList.show();
        this._lyList.ease({ opacity: 255, duration: 280, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
    }

    _setActiveLine(idx, animate) {
        if (!this._lyLabels.length)
            return;
        this._lyLabels.forEach((l, i) => {
            const d = idx < 0 ? (i === 0 ? 1 : 2) : Math.min(2, Math.abs(i - idx));
            if (this._lyLevels[i] === d)
                return;
            this._lyLevels[i] = d;
            const { opacity, scale } = LYRIC_LEVELS[d];
            l.remove_all_transitions();
            if (animate) {
                l.ease({
                    opacity, scale_x: scale, scale_y: scale,
                    duration: LYRIC_FADE_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                });
            } else {
                l.opacity = opacity;
                l.scale_x = scale;
                l.scale_y = scale;
            }
        });

        const ai = Math.max(0, idx);
        const off = this._lyOff[ai];
        const h = this._lyH[ai];
        const vh = this._lyVH;
        const y = h > vh ? -off : Math.round(vh / 2 - (off + h / 2));
        this._lyList.remove_all_transitions();
        if (animate) {
            this._lyList.ease({ y, duration: LYRIC_SCROLL_MS, mode: Clutter.AnimationMode.EASE_OUT_CUBIC });
        } else {
            this._lyList.set_position(0, y);
        }
    }

    _updateLyrics(posUs) {
        if (!this._lyricsBox.visible)
            return;
        const data = this._lyricsData;
        if (data?.state === 'ok' && this._lyBuilt !== data)
            this._buildLyricLines(data);

        const geo = this._syncLyricGeometry();
        if (!data)
            return;

        if (data.state === 'none') {
            if (this._lastIdx !== -3) {
                this._lastIdx = -3;
                this._showMessage('Không tìm thấy lời bài hát');
            }
            return;
        }
        if (data.state === 'error') {
            if (this._lastIdx !== -5) {
                this._lastIdx = -5;
                this._showMessage('Không tải được lời (lỗi mạng)');
            }
            return;
        }
        if (data.state === 'plain') {
            if (this._lastIdx !== -4) {
                this._lastIdx = -4;
                this._showMessage('Bài này chỉ có lời không đồng bộ');
            }
            return;
        }

        if (geo === null)
            return;

        const noAnim = this._lyNoAnimOnce;
        this._lyNoAnimOnce = false;

        const offset = this._settings.get_int('lyrics-offset-ms');
        const idx = this._lineIndex(data.lines, posUs / 1000 + offset);
        if (idx === this._lastIdx && !geo)
            return;

        const animate = this._lastIdx !== -2 && !geo && !noAnim && this._lyMode === 'list';
        this._lastIdx = idx;
        this._setActiveLine(idx, animate);
        this._showScroller();
    }

    _startTick() {
        if (this._tickId)
            return;
        this._tickId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, TICK_MS, () => {
            this._update();
            if (++this._ticks % SYNC_EVERY_TICKS === 0 && this._player?.status === 'Playing')
                this._player.syncPosition();
            return GLib.SOURCE_CONTINUE;
        });
        GLib.Source.set_name_by_id(this._tickId, '[dind] music tab tick');
    }

    _stopTick() {
        if (this._tickId)
            GLib.source_remove(this._tickId);
        this._tickId = 0;
    }

    _update() {
        const player = this._player;
        if (!player || !player.hasTrack)
            return;
        const pos = player.positionUs;
        const len = player.metadata.length;
        this._progress = len ? clamp(pos / len, 0, 1) : 0;
        if (!this._dragging)
            this._cur.text = fmt(pos);
        this._dur.text = len ? fmt(len) : '--:--';
        this._trackWrap.queue_repaint();
        this._updateLyrics(pos);
    }

    _drawBar(area) {
        const [w, h] = area.get_surface_size();
        const cr = area.get_context();
        try {
            const active = area.hover || this._dragging;
            const thick = active ? BAR_THICK_ACTIVE : BAR_THICK;
            const y = (h - thick) / 2;
            const frac = clamp(this._dragging ? this._dragFrac : this._progress, 0, 1);
            const fillW = w * frac;

            const pill = (x, width) => {
                if (width <= 0)
                    return;
                const r = Math.min(thick / 2, width / 2);
                cr.newSubPath();
                cr.arc(x + width - r, y + r, r, -Math.PI / 2, Math.PI / 2);
                cr.arc(x + r, y + r, r, Math.PI / 2, Math.PI * 1.5);
                cr.closePath();
                cr.fill();
            };

            cr.setSourceRGBA(1, 1, 1, 0.22);
            pill(0, w);
            cr.setSourceRGBA(1, 1, 1, 1);
            pill(0, fillW);

            if (active) {
                cr.arc(clamp(fillW, KNOB_R, Math.max(KNOB_R, w - KNOB_R)), h / 2, KNOB_R, 0, Math.PI * 2);
                cr.fill();
            }
        } finally {
            cr.$dispose();
        }
    }

    _fracFromEvent(event) {
        const [sx, sy] = event.get_coords();
        const [ok, lx] = this._trackWrap.transform_stage_point(sx, sy);
        const width = this._trackWrap.width;
        if (!ok || !width)
            return this._dragFrac;
        return clamp(lx / width, 0, 1);
    }

    _beginDrag(event) {
        const len = this._player?.metadata.length;
        if (!len || this._dragging)
            return;
        this._dragging = true;
        this._dragFrac = this._fracFromEvent(event);
        this._cur.text = fmt(this._dragFrac * len);
        this._trackWrap.queue_repaint();

        this._dragId = global.stage.connect('captured-event', (_stage, ev) => {
            switch (ev.type()) {
            case Clutter.EventType.MOTION:
            case Clutter.EventType.TOUCH_UPDATE:
                this._moveDrag(ev);
                return Clutter.EVENT_PROPAGATE;
            case Clutter.EventType.BUTTON_RELEASE:
            case Clutter.EventType.TOUCH_END:
                this._endDrag(ev, true);
                return Clutter.EVENT_STOP;
            default:
                return Clutter.EVENT_PROPAGATE;
            }
        });
    }

    _moveDrag(event) {
        const len = this._player?.metadata.length;
        if (!this._dragging || !len)
            return;
        this._dragFrac = this._fracFromEvent(event);
        this._cur.text = fmt(this._dragFrac * len);
        this._trackWrap.queue_repaint();
    }

    _endDrag(event, commit) {
        if (!this._dragging)
            return;
        if (event)
            this._dragFrac = this._fracFromEvent(event);
        this._dragging = false;
        if (this._dragId)
            global.stage.disconnect(this._dragId);
        this._dragId = 0;

        const player = this._player;
        const len = player?.metadata.length;
        if (commit && player && len)
            player.seekTo(this._dragFrac * len);
        this._update();
        this._trackWrap.queue_repaint();
    }
}
