// Lightweight Guacamole WebSocket tunnel (replacement for guacamole-lite).
//
// Why not guacamole-lite: it parses every guacd instruction into JS strings,
// re-serialises it and sends it as its own WebSocket message, and it never
// applies backpressure. When the browser link is slower than guacd produces
// frames, the unsent data piles up inside Node, GC runs constantly, CPU climbs
// and the session eventually times out.
//
// This tunnel only does what is necessary:
//   * performs the guacd handshake (select / args / size / ... / connect / ready)
//   * afterwards relays raw bytes, cutting only at instruction boundaries
//     (the browser tunnel requires whole instructions per WS message)
//   * pauses the guacd socket while too much data is waiting to be flushed to
//     the browser, so guacd itself slows down (same as the official Java tunnel)
//   * answers the browser's internal "ping" locally instead of forwarding it

const net = require('net');
const crypto = require('crypto');
const EventEmitter = require('events');
const WebSocket = require('ws');

// Pause guacd above HIGH and resume below LOW unflushed bytes. Kept small on purpose:
// everything queued here is delay between a user action and seeing its result, and
// guacd lowers its frame rate by itself once it has to wait.
const HIGH_WATER_MARK = 256 * 1024;
const LOW_WATER_MARK = 64 * 1024;
const GUACD_SILENCE_TIMEOUT_MS = 20000;  // guacd sends sync/nop regularly while healthy
const CLIENT_SILENCE_TIMEOUT_MS = 20000; // browser pings every 500ms / nop every 5s
const ACTIVITY_CHECK_INTERVAL_MS = 2000;
const HANDSHAKE_TIMEOUT_MS = 30000;

const DEFAULT_RDP_SETTINGS = {
    port: '3389',
    width: 1024,
    height: 768,
    dpi: 96,
    audio: ['audio/L16'],
    video: null,
    image: ['image/png', 'image/jpeg'],
    timezone: null,
};

// Settings the browser may pass in the query string (not inside the encrypted token)
const ALLOWED_QUERY_SETTINGS = ['width', 'height', 'dpi', 'audio', 'video', 'image', 'timezone'];

const SEMICOLON = 0x3b;
const COMMA = 0x2c;
const PERIOD = 0x2e;

function encodeInstruction(elements) {
    return elements.map((e) => {
        const s = e === null || e === undefined ? '' : String(e);
        return `${[...s].length}.${s}`;
    }).join(',') + ';';
}

// Incremental byte-level scanner that tracks Guacamole instruction boundaries.
// Element lengths are in Unicode codepoints; UTF-8 continuation bytes
// (10xxxxxx) are therefore not counted.
class InstructionScanner {
    constructor() {
        this.state = 0;        // 0 = length digits, 1 = value, 2 = terminator
        this.length = 0;
        this.remaining = 0;
    }

    // Returns the offset just past the last complete instruction in buf, or -1.
    scan(buf) {
        let boundary = -1;
        let i = 0;
        const n = buf.length;
        let state = this.state;
        let remaining = this.remaining;
        let length = this.length;

        while (i < n) {
            if (state === 1) {
                while (remaining > 0 && i < n) {
                    if ((buf[i++] & 0xc0) !== 0x80) remaining--;
                }
                if (remaining === 0) state = 2;
            } else if (state === 2) {
                const b = buf[i++];
                if ((b & 0xc0) === 0x80) continue; // tail of the last multi-byte char
                if (b === SEMICOLON) boundary = i;
                else if (b !== COMMA) throw new Error('Invalid Guacamole instruction terminator');
                state = 0;
                length = 0;
            } else {
                const b = buf[i++];
                if (b === PERIOD) {
                    remaining = length;
                    state = remaining > 0 ? 1 : 2;
                } else if (b >= 0x30 && b <= 0x39) {
                    length = length * 10 + (b - 0x30);
                    if (length > 0x7fffffff) throw new Error('Guacamole element too long');
                } else {
                    throw new Error('Non-numeric character in Guacamole element length');
                }
            }
        }

        this.state = state;
        this.remaining = remaining;
        this.length = length;
        return boundary;
    }
}

// Parses one instruction from the start of buf. Only used during the handshake
// (a handful of small instructions), so simplicity beats speed here.
// Returns { elements, bytes } or null if no complete instruction is buffered yet.
function parseHandshakeInstruction(buf) {
    const text = buf.toString('utf8');
    const elements = [];
    let pos = 0;
    for (;;) {
        const dot = text.indexOf('.', pos);
        if (dot === -1) return null;
        const len = parseInt(text.substring(pos, dot), 10);
        if (Number.isNaN(len)) throw new Error('Invalid Guacamole handshake data');
        const cps = [...text.substring(dot + 1)];
        if (cps.length <= len) return null;
        const value = cps.slice(0, len).join('');
        const term = cps[len];
        elements.push(value);
        pos = dot + 1 + value.length + 1;
        if (term === ';') return { elements, bytes: Buffer.byteLength(text.substring(0, pos)) };
        if (term !== ',') throw new Error('Invalid Guacamole handshake terminator');
    }
}

class GuacTunnelServer extends EventEmitter {
    constructor({ guacdHost, guacdPort, cryptKey, logLevel = 'NORMAL' }) {
        super();
        this.guacdHost = guacdHost;
        this.guacdPort = guacdPort;
        this.cryptKey = cryptKey;
        this.verbose = logLevel === 'VERBOSE' || logLevel === 'DEBUG';
        this.connections = new Set();
        this.nextId = 1;
        const common = { noServer: true, maxPayload: 1024 * 1024 };
        this.webSocketServer = new WebSocket.Server({ ...common, perMessageDeflate: false });
        // Optional per-session compression towards the browser: image data (base64) shrinks
        // to ~75%, drawing instructions to ~20%, for roughly 30ms CPU per MB at level 1.
        this.compressedWebSocketServer = new WebSocket.Server({
            ...common,
            perMessageDeflate: { zlibDeflateOptions: { level: 1 }, threshold: 256 },
        });
        for (const wss of [this.webSocketServer, this.compressedWebSocketServer]) {
            wss.on('connection', (ws, req) => this.handleConnection(ws, req));
        }
    }

    // Picks the WebSocket server matching the session's compression setting.
    handleUpgrade(req, socket, head) {
        let wss = this.webSocketServer;
        try {
            const token = new URL(req.url, 'http://localhost').searchParams.get('token');
            if (token && this.decryptToken(token).connection?.wsCompression) wss = this.compressedWebSocketServer;
        } catch { /* invalid token: reported by handleConnection */ }
        wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
    }

    decryptToken(token) {
        const outer = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
        const iv = Buffer.from(outer.iv, 'base64');
        const decipher = crypto.createDecipheriv('AES-256-CBC', Buffer.from(this.cryptKey), iv);
        let json = decipher.update(outer.value, 'base64', 'utf8');
        json += decipher.final('utf8');
        return JSON.parse(json);
    }

    buildSettings(req) {
        const url = new URL(req.url, 'http://localhost');
        const token = url.searchParams.get('token');
        if (!token) throw new Error('Missing token');

        const decoded = this.decryptToken(token);
        const connection = decoded.connection || {};
        const type = connection.type || 'rdp';
        const settings = { ...DEFAULT_RDP_SETTINGS, ...(connection.settings || {}) };

        for (const key of ALLOWED_QUERY_SETTINGS) {
            const values = url.searchParams.getAll(key);
            if (values.length === 0) continue;
            settings[key] = ['audio', 'video', 'image'].includes(key) ? values : values[0];
        }
        return { type, settings };
    }

    handleConnection(ws, req) {
        const id = this.nextId++;
        let config;
        try {
            config = this.buildSettings(req);
        } catch (err) {
            console.error(`[Guac #${id}] Token validation failed: ${err.message}`);
            ws.send(encodeInstruction(['error', 'Token validation failed', '769']));
            ws.close(1008, 'Invalid token');
            return;
        }
        const conn = new GuacConnection(this, id, ws, config);
        this.connections.add(conn);
        conn.once('close', () => this.connections.delete(conn));
    }

    stats() {
        let inflight = 0;
        let paused = 0;
        for (const c of this.connections) {
            inflight += c.inflight;
            if (c.guacdPaused) paused++;
        }
        return { connections: this.connections.size, inflight, paused };
    }
}

class GuacConnection extends EventEmitter {
    constructor(server, id, ws, { type, settings }) {
        super();
        this.server = server;
        this.id = id;
        this.ws = ws;
        this.type = type;
        this.settings = settings;
        this.closed = false;
        this.ready = false;
        this.startedAt = Date.now();

        this.handshakeBuf = Buffer.alloc(0);
        this.pendingClientMessages = [];
        this.scanner = new InstructionScanner();
        this.carry = [];           // bytes after the last complete instruction
        this.carryLength = 0;

        this.inflight = 0;         // bytes handed to ws but not yet flushed to the socket
        this.guacdPaused = false;
        this.pauseCount = 0;
        this.maxInflight = 0;
        this.bytesToClient = 0;

        this.lastGuacdActivity = Date.now();
        this.lastClientActivity = Date.now();

        this.guacd = net.connect(server.guacdPort, server.guacdHost);
        this.guacd.setNoDelay(true);
        this.guacd.on('connect', () => {
            this.log(`guacd connected, selecting "${type}"`);
            this.guacd.write(encodeInstruction(['select', type]));
        });
        this.guacd.on('data', (chunk) => this.onGuacdData(chunk));
        this.guacd.on('error', (err) => this.close(err));
        this.guacd.on('close', () => this.close());

        ws.on('message', (data) => this.onClientMessage(data));
        ws.on('close', () => this.close());
        ws.on('error', (err) => this.close(err));

        this.handshakeTimer = setTimeout(() => {
            if (!this.ready) this.close(new Error('guacd handshake timed out'));
        }, HANDSHAKE_TIMEOUT_MS);

        this.activityTimer = setInterval(() => this.checkActivity(), ACTIVITY_CHECK_INTERVAL_MS);
    }

    log(msg) {
        if (this.server.verbose) console.log(`[Guac #${this.id}] ${msg}`);
    }

    checkActivity() {
        const now = Date.now();
        // While guacd is paused by us, its silence is expected — don't count it.
        if (this.guacdPaused) this.lastGuacdActivity = now;
        if (now - this.lastGuacdActivity > GUACD_SILENCE_TIMEOUT_MS) {
            this.close(new Error('guacd was inactive for too long'));
        } else if (now - this.lastClientActivity > CLIENT_SILENCE_TIMEOUT_MS) {
            this.close(new Error('client was inactive for too long'));
        }
    }

    // ---- guacd -> browser --------------------------------------------------

    onGuacdData(chunk) {
        this.lastGuacdActivity = Date.now();
        if (this.closed) return;
        try {
            if (!this.ready) this.processHandshake(chunk);
            else this.relay(chunk);
        } catch (err) {
            this.close(err);
        }
    }

    processHandshake(chunk) {
        this.handshakeBuf = Buffer.concat([this.handshakeBuf, chunk]);
        for (;;) {
            const parsed = parseHandshakeInstruction(this.handshakeBuf);
            if (!parsed) return;
            this.handshakeBuf = this.handshakeBuf.subarray(parsed.bytes);
            const [opcode, ...args] = parsed.elements;

            if (opcode === 'args') {
                this.sendHandshakeReply(args);
            } else if (opcode === 'ready') {
                this.onReady(args[0]);
                const rest = this.handshakeBuf;
                this.handshakeBuf = null;
                if (rest.length) this.relay(rest);
                return;
            } else if (opcode === 'error') {
                // Forward guacd's error so the browser shows the real reason
                this.sendToClient(Buffer.from(encodeInstruction(parsed.elements)));
                this.close(new Error(`guacd error during handshake: ${args[0]}`));
                return;
            }
        }
    }

    sendHandshakeReply(argNames) {
        let protocolVersion = '1_0_0';
        const values = argNames.map((name) => {
            if (name.startsWith('VERSION_')) {
                const v = name.substring(8);
                protocolVersion = v === '1_0_0' || v === '1_1_0' ? v : '1_1_0';
                return `VERSION_${protocolVersion}`;
            }
            const v = this.settings[name];
            return v === undefined || v === null ? '' : v;
        });

        const s = this.settings;
        const list = (v) => (Array.isArray(v) ? v : v ? [v] : []);
        let out = encodeInstruction(['size', s.width, s.height, s.dpi]);
        out += encodeInstruction(['audio', ...list(s.audio)]);
        out += encodeInstruction(['video', ...list(s.video)]);
        out += encodeInstruction(['image', ...list(s.image)]);
        if (protocolVersion === '1_1_0') out += encodeInstruction(['timezone', ...list(s.timezone)]);
        out += encodeInstruction(['connect', ...values]);
        this.guacd.write(out);
        this.log(`handshake reply sent (protocol ${protocolVersion})`);
    }

    onReady(connectionId) {
        this.ready = true;
        clearTimeout(this.handshakeTimer);
        this.connectionId = connectionId;
        this.log(`ready, guacd connection ${connectionId}`);
        this.server.emit('open', this);

        // Empty opcode carrying the connection ID: tells the browser the tunnel is open
        this.sendToClient(Buffer.from(encodeInstruction(['', connectionId])));

        for (const msg of this.pendingClientMessages) this.guacd.write(msg);
        this.pendingClientMessages = null;
    }

    relay(chunk) {
        const boundary = this.scanner.scan(chunk);
        if (boundary === -1) {
            this.carry.push(chunk);
            this.carryLength += chunk.length;
            if (this.carryLength > 16 * 1024 * 1024) throw new Error('Guacamole instruction too large');
            return;
        }

        let out;
        if (this.carryLength === 0) {
            out = boundary === chunk.length ? chunk : chunk.subarray(0, boundary);
        } else {
            this.carry.push(chunk.subarray(0, boundary));
            out = Buffer.concat(this.carry, this.carryLength + boundary);
            this.carry = [];
            this.carryLength = 0;
        }
        if (boundary < chunk.length) {
            this.carry.push(chunk.subarray(boundary));
            this.carryLength = chunk.length - boundary;
        }
        this.sendToClient(out);
    }

    sendToClient(buf) {
        if (this.ws.readyState !== WebSocket.OPEN) return;
        const len = buf.length;
        this.inflight += len;
        this.bytesToClient += len;
        if (this.inflight > this.maxInflight) this.maxInflight = this.inflight;

        this.ws.send(buf, { binary: false }, (err) => {
            this.inflight -= len;
            if (err) {
                // Send failures after the browser went away are handled by ws 'close'
                if (this.ws.readyState === WebSocket.OPEN) this.close(err);
                return;
            }
            if (this.guacdPaused && this.inflight <= LOW_WATER_MARK && !this.closed) {
                this.guacdPaused = false;
                this.guacd.resume();
            }
        });

        if (!this.guacdPaused && this.inflight >= HIGH_WATER_MARK) {
            this.guacdPaused = true;
            this.pauseCount++;
            this.guacd.pause();
        }
    }

    // ---- browser -> guacd --------------------------------------------------

    onClientMessage(data) {
        this.lastClientActivity = Date.now();
        if (this.closed) return;
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);

        // Internal tunnel instruction (empty opcode, e.g. "0.,4.ping,13.1700000000000;"):
        // handled here like the Java tunnel does; guacd doesn't need it.
        if (buf.length >= 3 && buf[0] === 0x30 && buf[1] === PERIOD && buf[2] === COMMA) {
            if (buf.includes('4.ping,')) this.sendToClient(buf);
            return;
        }

        if (!this.ready) {
            this.pendingClientMessages.push(buf);
            return;
        }
        this.guacd.write(buf);
    }

    // ---- teardown ----------------------------------------------------------

    close(error) {
        if (this.closed) return;
        this.closed = true;
        clearTimeout(this.handshakeTimer);
        clearInterval(this.activityTimer);

        if (!this.guacd.destroyed) this.guacd.destroy();

        if (this.ws.readyState === WebSocket.OPEN) {
            if (error) {
                this.ws.close(1011, 'Internal server error');
            } else {
                this.ws.close(1000, 'Connection closed normally');
            }
        }

        const secs = Math.round((Date.now() - this.startedAt) / 1000);
        const mb = (this.bytesToClient / 1048576).toFixed(1);
        console.log(`[Guac #${this.id}] Closed after ${secs}s, sent ${mb}MB, max buffered ${Math.round(this.maxInflight / 1024)}KB, guacd paused ${this.pauseCount}x${error ? ` — ${error.message}` : ''}`);

        if (error) this.server.emit('error', this, error);
        this.server.emit('close', this, error);
        this.emit('close');
    }
}

module.exports = { GuacTunnelServer, InstructionScanner, encodeInstruction };
