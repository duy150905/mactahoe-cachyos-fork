import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const BUS_PREFIX = 'org.mpris.MediaPlayer2.';
const MPRIS_PATH = '/org/mpris/MediaPlayer2';
const PLAYER_IFACE = 'org.mpris.MediaPlayer2.Player';
const PROPS_IFACE = 'org.freedesktop.DBus.Properties';

const EMPTY_META = Object.freeze({
    title: '', artist: '', album: '', artUrl: '', length: 0, trackId: '',
});

function isCancelled(e) {
    return e instanceof GLib.Error && e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED);
}

export class Player {
    constructor(busName, onChange) {
        this.busName = busName;
        this.ready = false;
        this._onChange = onChange;
        this._proxy = null;
        this._cancellable = new Gio.Cancellable();
        this._meta = EMPTY_META;
        this._pos = 0;
        this._stamp = GLib.get_monotonic_time();
        this._ids = [];
    }

    init() {
        Gio.DBusProxy.new_for_bus(
            Gio.BusType.SESSION, Gio.DBusProxyFlags.NONE, null,
            this.busName, MPRIS_PATH, PLAYER_IFACE, this._cancellable,
            (_src, res) => {
                try {
                    this._proxy = Gio.DBusProxy.new_for_bus_finish(res);
                } catch (e) {
                    if (!isCancelled(e))
                        console.warn(`[Dind] không kết nối được ${this.busName}: ${e.message}`);
                    return;
                }
                this._ids.push(this._proxy.connect('g-properties-changed', () => this._propsChanged()));
                this._ids.push(this._proxy.connect('g-signal', (_p, _sender, signal, params) => {
                    if (signal !== 'Seeked')
                        return;
                    const [pos] = params.deepUnpack();
                    this._setPos(Number(pos));
                    this._onChange(this);
                }));
                this.ready = true;
                this._readMeta();
                this.syncPosition();
                this._onChange(this);
            }
        );
    }

    _propsChanged() {
        const before = this._meta.trackId + this._meta.title;
        this._readMeta();
        if (before !== this._meta.trackId + this._meta.title)
            this._setPos(0);
        this.syncPosition();
        this._onChange(this);
    }

    _readMeta() {
        const v = this._proxy?.get_cached_property('Metadata');
        if (!v) {
            this._meta = EMPTY_META;
            return;
        }
        const m = v.recursiveUnpack();
        const artist = m['xesam:artist'];
        this._meta = {
            title: String(m['xesam:title'] ?? ''),
            artist: Array.isArray(artist) ? artist.join(', ') : String(artist ?? ''),
            album: String(m['xesam:album'] ?? ''),
            artUrl: String(m['mpris:artUrl'] ?? ''),
            length: Number(m['mpris:length'] ?? 0),
            trackId: String(m['mpris:trackid'] ?? ''),
        };
    }

    _prop(name, fallback) {
        const v = this._proxy?.get_cached_property(name);
        return v ? v.unpack() : fallback;
    }

    get metadata() { return this._meta; }
    get hasTrack() { return this._meta.title !== ''; }
    get status() { return this._prop('PlaybackStatus', 'Stopped'); }
    get canGoNext() { return this._prop('CanGoNext', true); }
    get canGoPrevious() { return this._prop('CanGoPrevious', true); }

    _setPos(us) {
        this._pos = Number.isFinite(us) ? us : 0;
        this._stamp = GLib.get_monotonic_time();
    }

    get positionUs() {
        let p = this._pos;
        if (this.status === 'Playing')
            p += GLib.get_monotonic_time() - this._stamp;
        const len = this._meta.length;
        if (len > 0 && p > len)
            p = len;
        return Math.max(0, p);
    }

    syncPosition() {
        Gio.DBus.session.call(
            this.busName, MPRIS_PATH, PROPS_IFACE, 'Get',
            new GLib.Variant('(ss)', [PLAYER_IFACE, 'Position']),
            new GLib.VariantType('(v)'), Gio.DBusCallFlags.NONE, 1000,
            this._cancellable,
            (conn, res) => {
                try {
                    const [v] = conn.call_finish(res).deepUnpack();
                    this._setPos(Number(v.deepUnpack()));
                } catch (_e) {
                }
            }
        );
    }

    _call(method, params = null) {
        this._proxy?.call(method, params, Gio.DBusCallFlags.NONE, -1, null, (p, res) => {
            try {
                p.call_finish(res);
            } catch (_e) {
            }
        });
    }

    playPause() { this._call('PlayPause'); }
    next() { this._call('Next'); }
    previous() { this._call('Previous'); }

    seekTo(targetUs) {
        const delta = Math.round(targetUs - this.positionUs);
        this._call('Seek', new GLib.Variant('(x)', [delta]));
        this._setPos(targetUs);
    }

    destroy() {
        this._cancellable.cancel();
        this._ids.forEach(id => this._proxy?.disconnect(id));
        this._ids = [];
        this._proxy = null;
        this.ready = false;
    }
}

export class MprisManager {
    constructor(onChanged) {
        this._onChanged = onChanged;
        this._players = new Map();
        this._lastActive = null;
        this._sub = 0;
        this._cancellable = new Gio.Cancellable();
    }

    start() {
        this._sub = Gio.DBus.session.signal_subscribe(
            'org.freedesktop.DBus', 'org.freedesktop.DBus', 'NameOwnerChanged',
            '/org/freedesktop/DBus', null, Gio.DBusSignalFlags.NONE,
            (_c, _s, _p, _i, _sig, params) => {
                const [name, , newOwner] = params.deepUnpack();
                if (!name.startsWith(BUS_PREFIX))
                    return;
                if (newOwner)
                    this._add(name);
                else
                    this._remove(name);
            }
        );

        Gio.DBus.session.call(
            'org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus',
            'ListNames', null, new GLib.VariantType('(as)'),
            Gio.DBusCallFlags.NONE, -1, this._cancellable,
            (conn, res) => {
                try {
                    const [names] = conn.call_finish(res).deepUnpack();
                    names.filter(n => n.startsWith(BUS_PREFIX)).forEach(n => this._add(n));
                } catch (e) {
                    if (!isCancelled(e))
                        console.warn(`[Dind] ListNames lỗi: ${e.message}`);
                }
            }
        );
    }

    _add(name) {
        if (this._players.has(name))
            return;
        const player = new Player(name, p => this._playerChanged(p));
        this._players.set(name, player);
        player.init();
    }

    _remove(name) {
        const player = this._players.get(name);
        if (!player)
            return;
        this._players.delete(name);
        if (this._lastActive === player)
            this._lastActive = null;
        player.destroy();
        this._onChanged();
    }

    _playerChanged(player) {
        if (player.status === 'Playing')
            this._lastActive = player;
        this._onChanged();
    }

    get active() {
        const list = [...this._players.values()].filter(p => p.ready);
        const playing = list.filter(p => p.status === 'Playing');
        if (playing.length)
            return playing.includes(this._lastActive) ? this._lastActive : playing[playing.length - 1];
        if (this._lastActive && list.includes(this._lastActive) && this._lastActive.hasTrack)
            return this._lastActive;
        return list.reverse().find(p => p.hasTrack) ?? null;
    }

    destroy() {
        if (this._sub)
            Gio.DBus.session.signal_unsubscribe(this._sub);
        this._sub = 0;
        this._cancellable.cancel();
        this._players.forEach(p => p.destroy());
        this._players.clear();
        this._lastActive = null;
    }
}
