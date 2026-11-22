import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

const LRCLIB = 'https://lrclib.net/api';
const USER_AGENT = 'Dind-GNOME-Extension/1 (https://github.com/adfoxtheme/mactahoe-ubuntu)';

const DEBUG = true;
const dbg = (...a) => {
    if (DEBUG)
        console.log('[Dind][lyrics]', ...a);
};

function buildQuery(params) {
    return Object.entries(params)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&');
}

function sha1(text) {
    return GLib.compute_checksum_for_string(GLib.ChecksumType.SHA1, text, -1);
}

function readText(path) {
    try {
        const [ok, bytes] = GLib.file_get_contents(path);
        return ok ? new TextDecoder().decode(bytes) : null;
    } catch (_e) {
        return null;
    }
}

function makeSession() {
    const session = new Soup.Session({ timeout: 10, idle_timeout: 10 });
    session.user_agent = USER_AGENT;
    return session;
}

export function parseLrc(text) {
    const lines = [];
    for (const raw of text.split(/\r?\n/)) {
        const match = raw.match(/^((?:\[\d+:\d+(?:[.:]\d+)?\])+)\s*(.*)$/);
        if (!match)
            continue;
        const lyric = match[2].trim();
        for (const stamp of match[1].matchAll(/\[(\d+):(\d+)(?:[.:](\d+))?\]/g)) {
            const frac = stamp[3] ? Number(`0.${stamp[3]}`) : 0;
            lines.push({ t: Math.round((Number(stamp[1]) * 60 + Number(stamp[2]) + frac) * 1000), text: lyric });
        }
    }
    return lines.sort((a, b) => a.t - b.t);
}

function normalize(json) {
    if (!json)
        return null;
    const synced = json.syncedLyrics ? parseLrc(json.syncedLyrics) : [];
    if (synced.length)
        return { state: 'ok', lines: synced };
    if (json.plainLyrics)
        return { state: 'plain', lines: [] };
    return null;
}

function cleanTitle(title) {
    return title
        .replace(/\s*[([].*?[)\]]\s*/g, ' ')
        .replace(/\s+-\s+.*$/, '')
        .trim();
}

export class LyricsProvider {
    constructor(cacheDir) {
        this._dir = GLib.build_filenamev([cacheDir, 'lyrics']);
        GLib.mkdir_with_parents(this._dir, 0o755);
        this._mem = new Map();
        this._session = makeSession();
        this._cancellable = null;
    }

    fetch(meta, cb) {
        const key = sha1(`${meta.artist}|${meta.title}|${meta.album}|${Math.round(meta.length / 1e6)}`);
        dbg('fetch', `"${meta.title}" / "${meta.artist}" / "${meta.album}"`, `${Math.round(meta.length / 1e6)}s`);
        if (this._mem.has(key)) {
            dbg('trúng cache RAM');
            cb(this._mem.get(key));
            return () => {};
        }
        const file = GLib.build_filenamev([this._dir, `${key}.json`]);
        const cached = readText(file);
        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                this._mem.set(key, parsed);
                dbg('trúng cache đĩa');
                cb(parsed);
                return () => {};
            } catch (_e) {
            }
        }

        this._cancellable?.cancel();
        const cancellable = new Gio.Cancellable();
        this._cancellable = cancellable;

        let netError = false;
        const onNet = () => { netError = true; };

        const finish = result => {
            if (cancellable.is_cancelled())
                return;
            const final = result ?? { state: netError ? 'error' : 'none', lines: [] };
            dbg('kết quả:', final.state, `(${final.lines.length} dòng)`);
            if (final.state !== 'error')
                this._mem.set(key, final);
            if (final.state === 'ok' || final.state === 'plain') {
                try {
                    GLib.file_set_contents(file, JSON.stringify(final));
                } catch (_e) {
                }
            }
            cb(final);
        };

        const first = meta.artist.split(',')[0].trim() || meta.artist;
        const steps = [done => this._getExact(meta, meta.artist, cancellable, onNet, done)];
        if (first !== meta.artist)
            steps.push(done => this._getExact(meta, first, cancellable, onNet, done));
        steps.push(done => this._search(meta, first, cancellable, onNet, done));
        if (first !== meta.artist)
            steps.push(done => this._search(meta, meta.artist, cancellable, onNet, done));

        const run = i => {
            if (cancellable.is_cancelled())
                return;
            if (i >= steps.length) {
                finish(null);
                return;
            }
            dbg(`bước ${i + 1}/${steps.length}`);
            steps[i](found => (found ? finish(found) : run(i + 1)));
        };

        try {
            run(0);
        } catch (e) {
            console.error(`[Dind] lỗi khi tải lời: ${e.message}\n${e.stack}`);
            netError = true;
            finish(null);
        }
        return () => cancellable.cancel();
    }

    _getExact(meta, artist, cancellable, onNet, done) {
        const q = buildQuery({
            track_name: meta.title,
            artist_name: artist,
            album_name: meta.album,
            duration: Math.round(meta.length / 1e6),
        });
        this._getJson(`${LRCLIB}/get?${q}`, cancellable, onNet, json => done(normalize(json)));
    }

    _search(meta, artist, cancellable, onNet, done) {
        const q = buildQuery({ track_name: cleanTitle(meta.title), artist_name: artist });
        this._getJson(`${LRCLIB}/search?${q}`, cancellable, onNet, json => {
            if (!Array.isArray(json))
                return done(null);
            const seconds = meta.length / 1e6;
            const synced = json.filter(r => r.syncedLyrics);
            const best = seconds
                ? synced.find(r => Math.abs((r.duration ?? 0) - seconds) <= 3) ?? synced[0]
                : synced[0];
            return done(normalize(best ?? json.find(r => r.plainLyrics)));
        });
    }

    _getJson(url, cancellable, onNet, cb) {
        dbg('GET', url);
        let msg = null;
        try {
            msg = Soup.Message.new('GET', url);
        } catch (e) {
            console.warn(`[Dind] URL lrclib không hợp lệ: ${e.message}`);
        }
        if (!msg) {
            onNet();
            cb(null);
            return;
        }
        this._session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, cancellable, (session, res) => {
            let json = null;
            try {
                const bytes = session.send_and_read_finish(res);
                const status = msg.get_status();
                dbg('HTTP', status);
                if (status === Soup.Status.OK)
                    json = JSON.parse(new TextDecoder().decode(bytes.get_data()));
                else if (status !== Soup.Status.NOT_FOUND)
                    onNet();
            } catch (e) {
                if (!cancellable.is_cancelled()) {
                    dbg('lỗi mạng/parse:', e.message);
                    onNet();
                }
            }
            cb(json);
        });
    }

    destroy() {
        this._cancellable?.cancel();
        this._cancellable = null;
        this._session.abort();
        this._mem.clear();
    }
}

export class ArtCache {
    constructor(cacheDir) {
        this._dir = GLib.build_filenamev([cacheDir, 'art']);
        GLib.mkdir_with_parents(this._dir, 0o755);
        this._mem = new Map();
        this._pending = new Map();
        this._session = makeSession();
        this._cancellable = new Gio.Cancellable();
    }

    get(url, cb) {
        if (!url)
            return cb(null);
        if (this._mem.has(url))
            return cb(this._mem.get(url));

        if (url.startsWith('file://')) {
            const path = Gio.File.new_for_uri(url).get_path();
            this._mem.set(url, path);
            return cb(path);
        }
        if (!/^https?:\/\//.test(url))
            return cb(null);

        const path = GLib.build_filenamev([this._dir, sha1(url)]);
        if (GLib.file_test(path, GLib.FileTest.EXISTS)) {
            this._mem.set(url, path);
            return cb(path);
        }

        if (this._pending.has(url)) {
            this._pending.get(url).push(cb);
            return null;
        }
        this._pending.set(url, [cb]);

        const msg = Soup.Message.new('GET', url);
        const done = result => {
            const callbacks = this._pending.get(url) ?? [];
            this._pending.delete(url);
            if (result)
                this._mem.set(url, result);
            callbacks.forEach(fn => fn(result));
        };
        if (!msg) {
            done(null);
            return null;
        }
        this._session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, this._cancellable, (session, res) => {
            try {
                const bytes = session.send_and_read_finish(res);
                if (msg.get_status() !== Soup.Status.OK)
                    return done(null);
                GLib.file_set_contents(path, bytes.get_data());
                done(path);
            } catch (_e) {
                done(null);
            }
        });
        return null;
    }

    destroy() {
        this._cancellable.cancel();
        this._session.abort();
        this._pending.clear();
        this._mem.clear();
    }
}
