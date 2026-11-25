import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { MusicTab } from './music_tab.js';

const COLLAPSED_MIN_W = 120;
const COLLAPSED_MAX_W = 300;
const COLLAPSED_LYRIC_MAX_W = 480;
const COLLAPSED_LYRIC_TICK_MS = 250;
const COLLAPSED_SYNC_EVERY_TICKS = 20;
const COLLAPSED_PAD = 14;
const COLLAPSED_ART = 18;
const COLLAPSED_SPACING = 8;

const ANIM_MS = 900;
const SPRING_EXPAND = { zeta: 0.56, omega: 17 };
const SPRING_COLLAPSE = { zeta: 0.78, omega: 20 };
const SPRING_RESIZE = { zeta: 0.72, omega: 22 };

const CLICK_SLOP = 8;

const TAB_SLIDE_MS = 320;
const SCROLL_THRESHOLD = 5;
const SCROLL_LOCK_MS = 400;

const DEBUG = true;
const dbg = (...a) => {
    if (DEBUG)
        console.log('[Dind][dbg]', ...a);
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, p) => a + (b - a) * p;

export class Island {
    constructor({ settings, mpris, art, lyrics }) {
        this._settings = settings;
        this._mpris = mpris;
        this._art = art;
        this._lyrics = lyrics;

        this._expanded = false;
        this._cur = null;
        this._anim = null;
        this._timeline = null;
        this._timelineIds = [];
        this._pipeline = null;
        this._lastRadius = -1;
        this._artUrl = null;
        this._artToken = 0;
        this._tabIndex = 0;
        this._pressed = false;
        this._pressPos = null;
        this._stageId = 0;
        this._scrollAcc = 0;
        this._scrollLocked = false;
        this._scrollLockId = 0;
        this._hMin = 30;
        this._hMax = 216;
        this._signals = [];
        this._baseText = 'Dind Island';
        this._showingLyric = false;
        this._lyricTickId = 0;
        this._lyricTicks = 0;

        this._build();
    }

    get expanded() { return this._expanded; }


    _build() {
        this.actor = new St.Widget({
            name: 'dind-island',
            style_class: 'dind-island dind-no-blur',
            reactive: true,
            track_hover: true,
            clip_to_allocation: true,
            layout_manager: new Clutter.BinLayout(),
        });

        this._tint = new St.Widget({
            style_class: 'dind-tint',
            x_expand: true,
            y_expand: true,
        });
        this.actor.add_child(this._tint);

        // chế độ thu nhỏ
        this._collapsedBox = new St.BoxLayout({
            style_class: 'dind-collapsed',
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._cArt = new St.Widget({
            style_class: 'dind-collapsed-art',
            width: COLLAPSED_ART,
            height: COLLAPSED_ART,
            y_align: Clutter.ActorAlign.CENTER,
            visible: false,
        });
        this._cLabel = new St.Label({
            style_class: 'dind-collapsed-label',
            text: 'Dind Island',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._cLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this._collapsedBox.add_child(this._cArt);
        this._collapsedBox.add_child(this._cLabel);
        this.actor.add_child(this._collapsedBox);

        this._expandedBox = new St.Widget({
            name: 'dind-expanded',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.START,
            opacity: 0,
            visible: false,
        });
        this._viewport = new St.Widget({ clip_to_allocation: true });
        this._expandedBox.add_child(this._viewport);
        this.actor.add_child(this._expandedBox);

        this._tabs = [
            new MusicTab({
                mpris: this._mpris,
                art: this._art,
                lyrics: this._lyrics,
                settings: this._settings,
            }),
        ];
        this._tabs.forEach(tab => this._viewport.add_child(tab.actor));

        this._dots = new St.BoxLayout({
            style_class: 'dind-dots',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.END,
        });
        this._expandedBox.add_child(this._dots);
        this._buildDots();

        this._applySizes();
        this._layoutTabs(false);

        this._connect(this.actor, 'captured-event', (_a, event) => {
            const t = event.type();
            if (t === Clutter.EventType.BUTTON_PRESS || t === Clutter.EventType.BUTTON_RELEASE) {
                const src = event.get_source();
                dbg('CAPTURE', t === Clutter.EventType.BUTTON_PRESS ? 'press' : 'release',
                    'button=', event.get_button(),
                    'source=', src ? `${src.constructor.name}(${src.name || src.style_class || ''})` : 'null',
                    'reactive=', src?.reactive, 'expanded=', this._expanded,
                    'player=', this._mpris.active?.status ?? 'none');
            }
            return Clutter.EVENT_PROPAGATE;
        });
        this._connect(this.actor, 'button-press-event', (_a, event) => {
            if (this._expanded || event.get_button() !== Clutter.BUTTON_PRIMARY) {
                dbg('PRESS bỏ qua; expanded=', this._expanded, 'button=', event.get_button());
                this._pressed = false;
                return Clutter.EVENT_PROPAGATE;
            }
            this._pressed = true;
            this._pressPos = event.get_coords();
            dbg('PRESS nhận (island)', this._pressPos);
            return Clutter.EVENT_STOP;
        });
        this._connect(this.actor, 'button-release-event', (_a, event) => {
            if (this._expanded || event.get_button() !== Clutter.BUTTON_PRIMARY || !this._pressed) {
                dbg('RELEASE bỏ qua; expanded=', this._expanded, 'pressed=', this._pressed);
                this._pressed = false;
                return Clutter.EVENT_PROPAGATE;
            }
            this._pressed = false;
            const [px, py] = this._pressPos ?? [0, 0];
            const [rx, ry] = event.get_coords();
            const dist = Math.hypot(rx - px, ry - py);
            dbg('RELEASE nhận (island) dist=', dist.toFixed(1), dist <= CLICK_SLOP ? '=> phóng to' : '=> bỏ (kéo)');
            if (dist <= CLICK_SLOP)
                this.expand();
            return Clutter.EVENT_STOP;
        });
        this._connect(this.actor, 'leave-event', () => {
            if (this._pressed)
                dbg('LEAVE khi đang giữ chuột => huỷ click');
            this._pressed = false;
            return Clutter.EVENT_PROPAGATE;
        });
        this._connect(this.actor, 'scroll-event', (_a, event) => this._onScroll(event));
        this._connect(Main.overview, 'showing', () => this.collapse());
        this._connect(Main.layoutManager, 'monitors-changed', () => this.reposition());
        this._connect(Main.layoutManager.panelBox, 'notify::height', () => this.reposition());
        this._connect(this._settings, 'changed', (_s, key) => this._onSettingsChanged(key));
    }

    _connect(obj, signal, callback) {
        this._signals.push([obj, obj.connect(signal, callback)]);
    }

    _buildDots() {
        this._dots.destroy_all_children();
        this._dots.visible = this._tabs.length > 1;
        this._tabs.forEach((_tab, i) => {
            const dot = new St.Widget({ style_class: 'dind-dot', reactive: true });
            dot.connect('button-press-event', () => Clutter.EVENT_STOP);
            dot.connect('button-release-event', () => {
                this.goToTab(i);
                return Clutter.EVENT_STOP;
            });
            this._dots.add_child(dot);
        });
    }

    attachBlur(DynamicPipeline, bms, pipelineId) {
        this.detachBlur();
        const pipeline = new DynamicPipeline(
            bms._effects_manager,
            bms._pipelines_manager,
            pipelineId,
            {
                corner_radius: this._lastRadius >= 0 ? this._lastRadius : 15,
                get_corners: () => 0,
            }
        );
        pipeline.attach_to_container(this.actor, 'dind-blurred-widget');
        this._pipeline = pipeline;
        this.actor.remove_style_class_name('dind-no-blur');
    }

    detachBlur() {
        if (this._pipeline) {
            try {
                this._pipeline.destroy();
            } catch (e) {
                console.warn(`[Dind] lỗi khi gỡ blur: ${e.message}`);
            }
            this._pipeline = null;
        }
        this.actor?.add_style_class_name('dind-no-blur');
    }

    get hasBlur() { return this._pipeline !== null; }

    _tabSize(tab) {
        return tab?.preferredSize?.() ??
            [this._settings.get_int('expanded-width'), this._settings.get_int('expanded-height')];
    }

    _expandedSize() {
        return this._tabSize(this._tabs?.[this._tabIndex]);
    }

    _applySizes() {
        const [w, h] = this._expandedSize();
        this._expandedBox.set_size(w, h);
        this._viewport.set_size(w, h);
        this._tabs.forEach(tab => {
            const [tw, th] = this._tabSize(tab);
            tab.actor.set_size(tw, th);
        });
    }

    _resizeExpanded() {
        this._applySizes();
        this._layoutTabs(false);
        if (this._expanded)
            this._animate(this._metrics().expanded, SPRING_RESIZE);
        else
            this._placeNow();
    }

    _collapsedWidth() {
        this._cLabel.set_width(-1);
        const [, natural] = this._cLabel.get_preferred_width(-1);
        const extra = this._cArt.visible ? COLLAPSED_ART + COLLAPSED_SPACING : 0;
        const maxW = this._showingLyric ? COLLAPSED_LYRIC_MAX_W : COLLAPSED_MAX_W;
        const labelW = Math.min(natural, maxW - 2 * COLLAPSED_PAD - extra);
        this._cLabel.set_width(labelW);
        return clamp(labelW + extra + 2 * COLLAPSED_PAD, COLLAPSED_MIN_W, maxW);
    }

    _metrics() {
        const panelH = Main.layoutManager.panelBox.height || 40;
        const [ew, eh] = this._expandedSize();
        const gap = this._settings.get_int('expanded-gap');
        const ch = Math.max(22, panelH - 10);
        const m = {
            collapsed: { w: this._collapsedWidth(), h: ch, y: (panelH - ch) / 2, r: ch / 2 },
            expanded: {
                w: ew,
                h: eh,
                y: panelH + gap,
                r: Math.min(this._settings.get_int('corner-radius-expanded'), eh / 2),
            },
        };
        this._hMin = m.collapsed.h;
        this._hMax = m.expanded.h;
        return m;
    }

    _target() {
        const m = this._metrics();
        return this._expanded ? m.expanded : m.collapsed;
    }

    _placeNow() {
        this._stopTimeline();
        this._apply(this._target());
        if (!this._expanded)
            this._expandedBox.hide();
    }

    reposition() {
        if (this.actor)
            this._placeNow();
    }

    start() {
        this._applySizes();
        this._placeNow();
        this.refresh();
        this._startLyricTick();
    }

    _startLyricTick() {
        if (this._lyricTickId)
            return;
        this._lyricTickId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, COLLAPSED_LYRIC_TICK_MS, () => {
            if (!this._expanded && this._settings.get_boolean('music-wide')) {
                const player = this._mpris.active;
                if (player?.status === 'Playing' && ++this._lyricTicks % COLLAPSED_SYNC_EVERY_TICKS === 0)
                    player.syncPosition();
                this._applyCollapsedText(true);
            }
            return GLib.SOURCE_CONTINUE;
        });
        GLib.Source.set_name_by_id(this._lyricTickId, '[dind] collapsed lyric tick');
    }

    _stopLyricTick() {
        if (this._lyricTickId)
            GLib.source_remove(this._lyricTickId);
        this._lyricTickId = 0;
    }

    _applyCollapsedText(resize) {
        let text = this._baseText;
        let lyric = false;
        if (this._settings.get_boolean('music-wide')) {
            const tab = this._tabs?.find(t => typeof t.collapsedLyric === 'function');
            const line = tab?.collapsedLyric();
            if (line) {
                text = line;
                lyric = true;
            }
        }
        this._showingLyric = lyric;
        if (this._cLabel.text === text)
            return;
        this._cLabel.text = text;
        if (resize)
            this._resizeCollapsed();
    }

    _animate(target, spring) {
        if (!this._cur) {
            this._apply(target);
            return;
        }
        this._stopTimeline();
        this._anim = { from: { ...this._cur }, to: target, ...spring };

        const timeline = new Clutter.Timeline({ actor: this.actor, duration: ANIM_MS });
        this._timelineIds = [
            timeline.connect('new-frame', (_t, ms) => this._onFrame(ms)),
            timeline.connect('completed', () => this._onDone()),
        ];
        this._timeline = timeline;
        timeline.start();
    }

    _stopTimeline() {
        const timeline = this._timeline;
        if (!timeline)
            return;
        this._timeline = null;
        this._timelineIds.forEach(id => timeline.disconnect(id));
        this._timelineIds = [];
        timeline.stop();
    }

    _spring(t) {
        const { zeta, omega } = this._anim;
        const wd = omega * Math.sqrt(1 - zeta * zeta);
        return 1 - Math.exp(-zeta * omega * t) *
            (Math.cos(wd * t) + (zeta * omega / wd) * Math.sin(wd * t));
    }

    _onFrame(ms) {
        if (!this._anim)
            return;
        const p = this._spring(ms / 1000);
        const { from, to } = this._anim;
        this._apply({
            w: lerp(from.w, to.w, p),
            h: lerp(from.h, to.h, p),
            y: lerp(from.y, to.y, p),
            r: lerp(from.r, to.r, p),
        });
    }

    _onDone() {
        dbg('animation xong; expanded=', this._expanded, 'cur=', JSON.stringify(this._cur));
        if (this._anim)
            this._apply(this._anim.to);
        this._anim = null;
        this._stopTimeline();
        if (!this._expanded)
            this._expandedBox.hide();
    }

    _apply(s) {
        const mon = Main.layoutManager.primaryMonitor;
        if (!mon)
            return;

        const w = Math.max(60, s.w);
        const h = Math.max(16, s.h);
        this._cur = { w, h, y: s.y, r: s.r };

        this.actor.set_size(Math.round(w), Math.round(h));
        this.actor.set_position(
            Math.round(mon.x + (mon.width - w) / 2),
            Math.round(mon.y + s.y)
        );

        const radius = Math.round(clamp(s.r, 0, Math.min(w, h) / 2));
        if (radius !== this._lastRadius) {
            this._lastRadius = radius;
            this._tint.set_style(`border-radius: ${radius}px;`);
            this._pipeline?.set_corner_radius(radius);
        }

        const k = clamp((h - this._hMin) / Math.max(1, this._hMax - this._hMin), 0, 1);
        const collapsedOpacity = Math.round(255 * (1 - clamp(k * 4, 0, 1)));
        const expandedOpacity = Math.round(255 * clamp((k - 0.35) / 0.65, 0, 1));
        this._collapsedBox.opacity = collapsedOpacity;
        this._collapsedBox.visible = collapsedOpacity > 0;
        this._expandedBox.opacity = expandedOpacity;
        if (expandedOpacity > 0)
            this._expandedBox.show();
    }

    toggle() {
        dbg('toggle() expanded=', this._expanded);
        if (this._expanded)
            this.collapse();
        else
            this.expand();
    }

    _tabCall(method) {
        try {
            this._tabs[this._tabIndex][method]();
        } catch (e) {
            console.error(`[Dind] tab.${method}() ném lỗi: ${e.message}\n${e.stack}`);
        }
    }

    expand() {
        if (this._expanded)
            return;
        dbg('expand() bắt đầu; cur=', JSON.stringify(this._cur));
        this._expanded = true;
        this._expandedBox.show();
        this._watchOutside();
        this._animate(this._metrics().expanded, SPRING_EXPAND);
        this._tabCall('onShow');
        dbg('expand() xong phần khởi động');
    }

    collapse() {
        if (!this._expanded)
            return;
        dbg('collapse() bắt đầu; cur=', JSON.stringify(this._cur));
        this._expanded = false;
        this._unwatchOutside();
        this._applyCollapsedText(false);
        this._animate(this._metrics().collapsed, SPRING_COLLAPSE);
        this._tabCall('onHide');
    }

    _watchOutside() {
        if (this._stageId)
            return;
        this._stageId = global.stage.connect('captured-event', (_stage, event) => {
            switch (event.type()) {
            case Clutter.EventType.BUTTON_PRESS:
            case Clutter.EventType.TOUCH_BEGIN: {
                if (!this._pointerInside(event)) {
                    dbg('thu nhỏ do click NGOÀI island; toạ độ=', event.get_coords());
                    this.collapse();
                }
                break;
            }
            case Clutter.EventType.KEY_PRESS:
                if (event.get_key_symbol() === Clutter.KEY_Escape) {
                    dbg('thu nhỏ do phím Esc');
                    this.collapse();
                }
                break;
            default:
                break;
            }
            return Clutter.EVENT_PROPAGATE;
        });
    }

    _pointerInside(event) {
        if (!this.actor)
            return false;
        const [x, y] = event.get_coords();
        const [ax, ay] = this.actor.get_transformed_position();
        const [aw, ah] = this.actor.get_transformed_size();
        return x >= ax && x <= ax + aw && y >= ay && y <= ay + ah;
    }

    _unwatchOutside() {
        if (this._stageId)
            global.stage.disconnect(this._stageId);
        this._stageId = 0;
    }

    refresh() {
        const player = this._mpris.active;
        const meta = player?.metadata;

        let text = 'Dind Island';
        let artUrl = '';
        let paused = false;
        if (player && meta?.title) {
            text = meta.artist ? `${meta.artist} – ${meta.title}` : meta.title;
            artUrl = meta.artUrl;
            paused = player.status !== 'Playing';
        }

        this._baseText = text;
        this._cLabel.opacity = paused ? 150 : 255;
        this._cLabel.text = text;
        this._applyCollapsedText(false);
        this._setCollapsedArt(artUrl);
        if (this._expanded)
            this._tabs[this._tabIndex].refresh();
        this._resizeCollapsed();
    }

    _setCollapsedArt(url) {
        if (url === this._artUrl)
            return;
        this._artUrl = url;
        const token = ++this._artToken;
        if (!url) {
            this._cArt.hide();
            return;
        }
        this._cArt.hide();
        this._art.get(url, path => {
            if (token !== this._artToken || !path)
                return;
            this._cArt.set_style(`background-image: url("file://${path}"); background-size: cover;`);
            this._cArt.show();
            this._resizeCollapsed();
        });
    }

    _resizeCollapsed() {
        if (this._expanded || !this._cur)
            return;
        const target = this._metrics().collapsed;
        const settled = this._anim ? this._anim.to : this._cur;
        if (Math.abs(settled.w - target.w) < 1 && Math.abs(settled.h - target.h) < 1)
            return;
        this._animate(target, SPRING_RESIZE);
    }

    _layoutTabs(animate) {
        const widths = this._tabs.map(tab => this._tabSize(tab)[0]);
        const cur = this._tabIndex;
        this._tabs.forEach((tab, i) => {
            let x = 0;
            if (i > cur) {
                x = widths[cur];
                for (let j = cur + 1; j < i; j++)
                    x += widths[j];
            } else if (i < cur) {
                for (let j = i; j < cur; j++)
                    x -= widths[j];
            }
            if (animate) {
                tab.actor.ease({ x, duration: TAB_SLIDE_MS, mode: Clutter.AnimationMode.EASE_OUT_CUBIC });
            } else {
                tab.actor.remove_all_transitions();
                tab.actor.set_position(x, 0);
            }
        });
        this._dots.get_children().forEach((dot, i) => {
            if (i === this._tabIndex)
                dot.add_style_pseudo_class('active');
            else
                dot.remove_style_pseudo_class('active');
        });
    }

    goToTab(index) {
        index = clamp(index, 0, this._tabs.length - 1);
        if (index === this._tabIndex)
            return;
        if (this._expanded)
            this._tabs[this._tabIndex].onHide();
        this._tabIndex = index;
        if (this._expanded)
            this._tabs[index].onShow();
        this._applySizes();
        this._layoutTabs(true);
        if (this._expanded)
            this._animate(this._metrics().expanded, SPRING_RESIZE);
    }

    _onScroll(event) {
        if (!this._expanded || this._tabs.length < 2)
            return Clutter.EVENT_PROPAGATE;

        let step = 0;
        switch (event.get_scroll_direction()) {
        case Clutter.ScrollDirection.LEFT:
        case Clutter.ScrollDirection.UP:
            step = -1;
            break;
        case Clutter.ScrollDirection.RIGHT:
        case Clutter.ScrollDirection.DOWN:
            step = 1;
            break;
        case Clutter.ScrollDirection.SMOOTH: {
            const [dx, dy] = event.get_scroll_delta();
            this._scrollAcc += Math.abs(dx) > Math.abs(dy) ? dx : dy;
            if (Math.abs(this._scrollAcc) >= SCROLL_THRESHOLD) {
                step = Math.sign(this._scrollAcc);
                this._scrollAcc = 0;
            }
            break;
        }
        default:
            break;
        }

        if (step !== 0 && !this._scrollLocked) {
            this.goToTab(this._tabIndex + step);
            this._scrollLocked = true;
            this._scrollLockId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SCROLL_LOCK_MS, () => {
                this._scrollLocked = false;
                this._scrollLockId = 0;
                return GLib.SOURCE_REMOVE;
            });
        }
        return Clutter.EVENT_STOP;
    }

    _onSettingsChanged(key) {
        if (key === 'music-wide') {
            this._tabs.forEach(tab => tab.syncMode?.());
            this._resizeExpanded();
            return;
        }
        this._applySizes();
        this._layoutTabs(false);
        this._applyCollapsedText(false);
        this._placeNow();
        if (this._expanded)
            this._tabs[this._tabIndex].refresh();
    }

    destroy() {
        this._stopLyricTick();
        this._unwatchOutside();
        this._stopTimeline();
        if (this._scrollLockId)
            GLib.source_remove(this._scrollLockId);
        this._scrollLockId = 0;
        ++this._artToken;

        this._signals.forEach(([obj, id]) => obj.disconnect(id));
        this._signals = [];

        this.detachBlur();
        this._tabs.forEach(tab => tab.destroy());
        this._tabs = [];
        this.actor.destroy();
        this.actor = null;
    }
}
