require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const net = require('net');
const { GuacTunnelServer } = require('./guac-tunnel');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { pipeline } = require('stream');

const STANDALONE_MODE = process.env.STANDALONE_MODE === 'true';
const requiredEnv = STANDALONE_MODE
    ? ['JWT_SECRET', 'GUAC_CLIENT_KEY', 'GUACD_HOST', 'GUACD_PORT', 'ADMIN_PASSWORD']
    : ['JWT_SECRET', 'AGENT_SECRET', 'GUAC_CLIENT_KEY', 'GUACD_HOST', 'GUACD_PORT', 'ADMIN_PASSWORD'];
const missingEnv = requiredEnv.filter((name) => !process.env[name]);
if (missingEnv.length > 0) {
    throw new Error(`Missing required environment variables: ${missingEnv.join(', ')}`);
}

const PORT = process.env.PORT || 3000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const GUAC_CLIENT_KEY = process.env.GUAC_CLIENT_KEY.padEnd(32, '\0').substring(0, 32);
const GUACD_PORT = Number(process.env.GUACD_PORT);
const RDP_SECURITY = process.env.RDP_SECURITY || 'nla';
const RDP_BRIDGE_BIND_HOST = process.env.RDP_BRIDGE_BIND_HOST || '127.0.0.1';
const RDP_BRIDGE_CONNECT_HOST = process.env.RDP_BRIDGE_CONNECT_HOST || RDP_BRIDGE_BIND_HOST;
const GUACAMOLE_LOG_LEVEL = process.env.GUACAMOLE_LOG_LEVEL || 'NORMAL';
const RDP_SECURITY_TYPES = new Set(['any', 'nla', 'nla-ext', 'tls', 'rdp', 'vmconnect']);

// Tuning constants
const HEARTBEAT_INTERVAL_MS = 60000;   // 60s — generous for busy 1-CPU event loop
const HEARTBEAT_MAX_MISSES = 2;        // tolerate 1 consecutive miss before terminate
// The agent aborts its control channel if ReceiveAsync sees no data message for 90s
// (WS ping frames never complete ReceiveAsync in .NET). A tiny binary frame, which the
// agent silently skips, keeps it alive without touching the agent build.
const AGENT_KEEPALIVE_MS = 30000;
const AGENT_KEEPALIVE_FRAME = Buffer.alloc(1);
const SESSION_BRIDGE_TIMEOUT_MS = 30000; // 30s for agent to establish data channel
const WS_MAX_PAYLOAD = 1 * 1024 * 1024; // 1MB — sufficient for RDP frames
const TCP_KEEPALIVE_DELAY_MS = 30000;  // 30s TCP keepalive probes

// Standalone mode: proxy + direct RDP in a single process (no agent bridge required)
const STANDALONE_RDP_HOST = process.env.STANDALONE_RDP_HOST || '127.0.0.1';
const STANDALONE_RDP_PORT = Number(process.env.STANDALONE_RDP_PORT) || 3389;
const STANDALONE_HOST_NAME = process.env.STANDALONE_HOST_NAME || 'local';

if (!Number.isInteger(GUACD_PORT) || GUACD_PORT <= 0) {
    throw new Error('GUACD_PORT must be a valid TCP port number');
}

console.log(`[Config] CLIENT_ORIGIN=${CLIENT_ORIGIN}`);
console.log(`[Config] GUACD=${process.env.GUACD_HOST}:${GUACD_PORT}`);
console.log(`[Config] RDP_SECURITY=${RDP_SECURITY}`);
console.log(`[Config] RDP_BRIDGE_BIND_HOST=${RDP_BRIDGE_BIND_HOST}`);
console.log(`[Config] RDP_BRIDGE_CONNECT_HOST=${RDP_BRIDGE_CONNECT_HOST}`);
console.log(`[Config] GUACAMOLE_LOG_LEVEL=${GUACAMOLE_LOG_LEVEL}`);
if (STANDALONE_MODE) {
    console.log(`[Config] STANDALONE_MODE=true  RDP=${STANDALONE_RDP_HOST}:${STANDALONE_RDP_PORT}  host=${STANDALONE_HOST_NAME}`);
}

if (
    ['127.0.0.1', 'localhost'].includes(RDP_BRIDGE_CONNECT_HOST)
    && ['127.0.0.1', 'localhost'].includes(process.env.GUACD_HOST)
) {
    console.warn('[Config] WARNING: If guacd runs in Docker, RDP_BRIDGE_CONNECT_HOST=127.0.0.1 will point to the guacd container, not this Node host. Use host.docker.internal with --add-host=host.docker.internal:host-gateway.');
}

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true, perMessageDeflate: false, maxPayload: WS_MAX_PAYLOAD });

// State Maps
const agents = new Map(); // agentId -> { controlWs, id, passcodeHash, pendingRequests }
const pendingSessions = new Map(); // dataToken -> { agentId, agentWs, tcpSocket, sessionId, tcpServer, tokenUsed, cleanupTimer }
const loginAttempts = new Map(); // ip -> { count, firstAttempt }

// Prune stale loginAttempts entries every 5 minutes to prevent unbounded growth
setInterval(() => {
    const cutoff = Date.now() - 60 * 1000;
    for (const [ip, entry] of loginAttempts) {
        if (entry.firstAttempt < cutoff) loginAttempts.delete(ip);
    }
}, 5 * 60 * 1000).unref();

// Track event-loop lag to dynamically loosen heartbeat timeout under GC/CPU pressure.
// High lag (>300ms) means V8 GC or CPU spikes are stalling the event loop — in that
// case we expand maxSilence so agents aren't falsely disconnected.
let recentEventLoopLagMs = 0;
setInterval(() => {
    const start = Date.now();
    setImmediate(() => {
        const lag = Date.now() - start;
        recentEventLoopLagMs = lag;
        if (lag > 300) console.warn(`[Perf] Event loop lag ${lag}ms — GC/CPU pressure detected`);
    });
}, 5000).unref();

function isLoginRateLimited(ip) {
    const now = Date.now();
    const windowMs = 60 * 1000;
    const maxAttempts = 10;
    const entry = loginAttempts.get(ip);

    if (!entry || now - entry.firstAttempt > windowMs) {
        loginAttempts.set(ip, { count: 1, firstAttempt: now });
        return false;
    }

    entry.count += 1;
    return entry.count > maxAttempts;
}

function cleanupSession(session, reason = 'closed') {
    if (!session || session.closed) return;

    session.closed = true;
    pendingSessions.delete(session.dataToken);

    if (session.cleanupTimer) clearTimeout(session.cleanupTimer);
    if (session.agentWs && session.agentWs.readyState === WebSocket.OPEN) session.agentWs.close();
    if (session.tcpSocket && !session.tcpSocket.destroyed) session.tcpSocket.destroy();
    if (session.tcpServer && session.tcpServer.listening) session.tcpServer.close();

    console.log(`[Session ${session.sessionId}] Cleaned up (${reason})`);
}

function maybeBridgeSession(session) {
    if (!session || session.bridged || session.closed) return;
    if (!session.agentWs || !session.tcpSocket) return;

    session.bridged = true;
    if (session.cleanupTimer) {
        clearTimeout(session.cleanupTimer);
        session.cleanupTimer = null;
    }
    pipeSockets(session.agentWs, session.tcpSocket, session);
}

function maskValue(value) {
    if (!value) return '(empty)';
    return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

// Authentication Middleware
const authenticateJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader) {
        const token = authHeader.split(' ')[1];
        jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
            if (err) return res.sendStatus(403);
            req.user = user;
            next();
        });
    } else {
        res.sendStatus(401);
    }
};

// --- REST API ---
app.post('/api/login', (req, res) => {
    const { password } = req.body;

    if (isLoginRateLimited(req.ip)) {
        return res.status(429).json({ message: 'Too many login attempts' });
    }

    if (typeof password === 'string' && password === process.env.ADMIN_PASSWORD) {
        const token = jwt.sign({ username: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.json({ token });
    } else {
        res.status(401).json({ message: 'Invalid credentials' });
    }
});

app.get('/api/hosts', authenticateJWT, (req, res) => {
    if (STANDALONE_MODE) {
        return res.json([{ id: STANDALONE_HOST_NAME, name: STANDALONE_HOST_NAME, status: 'online' }]);
    }
    const hostList = Array.from(agents.keys()).map(id => ({
        id,
        name: id,
        status: 'online'
    }));
    res.json(hostList);
});

app.get('/api/ping', (req, res) => {
    res.json({ pong: true, timestamp: Date.now() });
});

// Send a command to agent via control channel and wait for its response.
function sendToAgentWithReply(agentId, message, timeoutMs = 10000) {
    const agent = agents.get(agentId);
    if (!agent || agent.controlWs.readyState !== WebSocket.OPEN) {
        return Promise.reject(new Error('Agent not available'));
    }
    const requestId = uuidv4();
    message.requestId = requestId;
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            agent.pendingRequests.delete(requestId);
            reject(new Error('Agent request timed out'));
        }, timeoutMs);
        agent.pendingRequests.set(requestId, { resolve, reject, timer });
        agent.controlWs.send(JSON.stringify(message));
    });
}

app.get('/api/hosts/:agentId/windows', authenticateJWT, async (req, res) => {
    if (STANDALONE_MODE) return res.status(501).json({ message: 'Not available in standalone mode' });
    const { agentId } = req.params;
    if (!agents.has(agentId)) return res.status(404).json({ message: 'Agent not found' });
    try {
        const reply = await sendToAgentWithReply(agentId, { action: 'GET_WINDOWS' });
        res.json(reply.windows || []);
    } catch (err) {
        console.error(`[API] GET /windows error for ${agentId}:`, err.message);
        res.status(502).json({ message: err.message });
    }
});

app.post('/api/hosts/:agentId/focus-window', authenticateJWT, async (req, res) => {
    if (STANDALONE_MODE) return res.status(501).json({ message: 'Not available in standalone mode' });
    const { agentId } = req.params;
    const { hwnd, clientWidth, clientHeight, sizePercent } = req.body;
    if (!hwnd) return res.status(400).json({ message: 'hwnd required' });
    if (!agents.has(agentId)) return res.status(404).json({ message: 'Agent not found' });
    try {
        const reply = await sendToAgentWithReply(agentId, {
            action: 'FOCUS_WINDOW', hwnd,
            clientWidth: clientWidth || null,
            clientHeight: clientHeight || null,
            sizePercent: sizePercent || 0
        });
        res.json({ success: reply.success, resizable: reply.resizable ?? false, rect: reply.rect || null });
    } catch (err) {
        console.error(`[API] POST /focus-window error for ${agentId}:`, err.message);
        res.status(502).json({ message: err.message });
    }
});

app.post('/api/hosts/:agentId/upload', authenticateJWT, async (req, res) => {
    if (STANDALONE_MODE) return res.status(501).json({ message: 'Not available in standalone mode' });
    const { agentId } = req.params;
    if (!agents.has(agentId)) return res.status(404).json({ message: 'Agent not found' });

    // Collect raw body (base64-encoded file bytes sent as JSON)
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
        try {
            const { fileName, data } = JSON.parse(body); // data = base64 string
            if (!fileName || !data) return res.status(400).json({ message: 'fileName and data required' });
            // Enforce max 50 MB
            const bytes = Buffer.from(data, 'base64');
            if (bytes.length > 50 * 1024 * 1024) return res.status(413).json({ message: 'File too large (max 50 MB)' });
            const reply = await sendToAgentWithReply(agentId, {
                action: 'UPLOAD_FILE',
                fileName,
                data  // base64 forwarded as-is; agent decodes
            }, 30000);
            res.json({ ok: true, path: reply.path });
        } catch (err) {
            console.error(`[API] POST /upload error for ${agentId}:`, err.message);
            res.status(502).json({ message: err.message });
        }
    });
});

app.post('/api/debug/bridge-listener', authenticateJWT, (req, res) => {
    const debugId = uuidv4();
    const debugServer = net.createServer((socket) => {
        console.log(`[BridgeDebug ${debugId}] Incoming TCP connection from ${socket.remoteAddress}:${socket.remotePort}`);
        socket.end('rdp-proxy bridge debug ok\n');
        debugServer.close();
    });

    const timer = setTimeout(() => {
        debugServer.close();
        console.log(`[BridgeDebug ${debugId}] Closed after timeout`);
    }, 60000);

    debugServer.on('close', () => clearTimeout(timer));
    debugServer.on('error', (err) => {
        console.error(`[BridgeDebug ${debugId}] Error:`, err);
        res.status(500).json({ message: 'Failed to start bridge debug listener' });
    });

    debugServer.listen(0, RDP_BRIDGE_BIND_HOST, () => {
        const port = debugServer.address().port;
        console.log(`[BridgeDebug ${debugId}] Listening on ${RDP_BRIDGE_BIND_HOST}:${port}, test from guacd container to ${RDP_BRIDGE_CONNECT_HOST}:${port}`);
        res.json({
            id: debugId,
            bindHost: RDP_BRIDGE_BIND_HOST,
            connectHost: RDP_BRIDGE_CONNECT_HOST,
            port
        });
    });
});

app.post('/api/session', authenticateJWT, (req, res) => {
    const {
        agentId,
        encryptedCredentials,
        iv,
        passcode,
        rdpSecurity,
        colorDepth,
        enableWallpaper,
        enableTheming,
        enableFontSmoothing,
        enableFullWindowDrag,
        enableDesktopComposition,
        enableMenuAnimations,
        enableAudio,
        enableGfx,
        wsCompression,
        imageWebp
    } = req.body;
    let agent = null;
    if (STANDALONE_MODE) {
        if (agentId !== STANDALONE_HOST_NAME) {
            return res.status(404).json({ message: 'Host not found' });
        }
    } else {
        agent = agents.get(agentId);
        if (!agent) {
            return res.status(404).json({ message: 'Agent not found' });
        }
        // Verify passcode if agent has passcodeHash set
        if (agent.passcodeHash) {
            if (!passcode) {
                return res.status(400).json({ message: 'Agent passcode is required' });
            }
            const calculatedHash = crypto.createHash('sha256').update(passcode).digest('hex');
            if (calculatedHash !== agent.passcodeHash) {
                return res.status(401).json({ message: 'Invalid agent passcode' });
            }
        }
    }

    let rdpUsername = '';
    let rdpPassword = '';
    let rdpDomain = '';

    if (encryptedCredentials && iv && passcode) {
        try {
            const decryptedData = decryptAesGcm(encryptedCredentials, iv, passcode);
            const credentials = JSON.parse(decryptedData);
            rdpUsername = credentials.username || '';
            rdpPassword = credentials.password || '';
            rdpDomain = credentials.domain || '';
        } catch (err) {
            console.error('[Session] Failed to decrypt credentials:', err);
            return res.status(400).json({ message: 'Failed to decrypt credentials. Check passcode.' });
        }
    }

    if (rdpUsername !== undefined && (typeof rdpUsername !== 'string' || rdpUsername.length > 256)) {
        return res.status(400).json({ message: 'Invalid RDP username' });
    }

    if (rdpPassword !== undefined && (typeof rdpPassword !== 'string' || rdpPassword.length > 1024)) {
        return res.status(400).json({ message: 'Invalid RDP password' });
    }

    if (rdpDomain !== undefined && (typeof rdpDomain !== 'string' || rdpDomain.length > 256)) {
        return res.status(400).json({ message: 'Invalid RDP domain' });
    }

    const selectedRdpSecurity = rdpSecurity || RDP_SECURITY;
    if (typeof selectedRdpSecurity !== 'string' || !RDP_SECURITY_TYPES.has(selectedRdpSecurity)) {
        return res.status(400).json({ message: 'Invalid RDP security type' });
    }

    const displayOptions = {
        colorDepth, enableWallpaper, enableTheming, enableFontSmoothing, enableFullWindowDrag,
        enableDesktopComposition, enableMenuAnimations, enableAudio, enableGfx, wsCompression, imageWebp
    };

    // Standalone fast-path: guacd connects directly to the local RDP host — no bridge needed
    if (STANDALONE_MODE) {
        const sessionId = uuidv4();
        const guacClientOptions = buildGuacConnection(STANDALONE_RDP_HOST, STANDALONE_RDP_PORT, selectedRdpSecurity, displayOptions);
        if (rdpUsername) guacClientOptions.connection.settings.username = rdpUsername;
        if (rdpPassword) guacClientOptions.connection.settings.password = rdpPassword;
        if (rdpDomain) guacClientOptions.connection.settings.domain = rdpDomain;
        console.log(`[Standalone ${sessionId}] ${STANDALONE_RDP_HOST}:${STANDALONE_RDP_PORT} security=${selectedRdpSecurity} username=${maskValue(rdpUsername)}`);
        return res.json({ token: encryptGuacToken(guacClientOptions) });
    }

    const sessionId = uuidv4();
    const dataToken = uuidv4(); // One-time token
    let responded = false;

    // Create a temporary TCP server for guacd to connect to
    const tcpServer = net.createServer((socket) => {
        console.log(`[Session ${sessionId}] guacd connected to local TCP bridge`);

        // Stop accepting new connections — only one guacd connection needed
        tcpServer.close();

        const pending = pendingSessions.get(dataToken);
        if (!pending || pending.closed) {
            socket.destroy();
            return;
        }

        if (pending.tcpSocket) {
            socket.destroy();
            return;
        }

        // TCP keepalive detects silent dead connections (NAT timeout, kernel gc)
        socket.setKeepAlive(true, TCP_KEEPALIVE_DELAY_MS);
        socket.setNoDelay(true);

        pending.tcpSocket = socket;
        console.log(`[Session ${sessionId}] Waiting for Agent Data Channel...`);
        maybeBridgeSession(pending);
    });

    tcpServer.on('error', (err) => {
        console.error(`[Session ${sessionId}] TCP bridge error:`, err);
        if (!responded) {
            responded = true;
            res.status(500).json({ message: 'Failed to create TCP bridge' });
        }
    });

    tcpServer.listen(0, RDP_BRIDGE_BIND_HOST, () => {
        const port = tcpServer.address().port;
        console.log(`[Session ${sessionId}] TCP Bridge listening on ${RDP_BRIDGE_BIND_HOST}:${port}, advertised to guacd as ${RDP_BRIDGE_CONNECT_HOST}:${port}`);

        const session = {
            agentId,
            agentWs: null,
            tcpSocket: null,
            sessionId,
            dataToken,
            tcpServer,
            tokenUsed: false,
            bridged: false,
            closed: false,
            cleanupTimer: setTimeout(() => {
                cleanupSession(session, 'timeout waiting for bridge endpoints');
            }, SESSION_BRIDGE_TIMEOUT_MS)
        };

        pendingSessions.set(dataToken, session);

        // Tell the Agent to connect
        if (agent.controlWs.readyState === WebSocket.OPEN) {
            agent.controlWs.send(JSON.stringify({
                action: 'CONNECT_SESSION',
                sessionId: sessionId,
                dataToken: dataToken
            }));
        }

        const guacClientOptions = buildGuacConnection(RDP_BRIDGE_CONNECT_HOST, port, selectedRdpSecurity, displayOptions);

        if (rdpUsername) guacClientOptions.connection.settings.username = rdpUsername;
        if (rdpPassword) guacClientOptions.connection.settings.password = rdpPassword;
        if (rdpDomain) guacClientOptions.connection.settings.domain = rdpDomain;

        console.log(`[Session ${sessionId}] RDP settings: bridge=${RDP_BRIDGE_CONNECT_HOST}:${port}, security=${selectedRdpSecurity}, username=${maskValue(rdpUsername)}, domain=${rdpDomain || '(empty)'}`);

        responded = true;
        res.json({ token: encryptGuacToken(guacClientOptions) });
    });
});

// --- Static Web Client ---
const clientDistPath = path.join(__dirname, 'public', 'client');
app.use('/client', express.static(clientDistPath));
app.get(['/client', '/client/*'], (req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
});

// Connection description consumed by guac-tunnel.js (encrypted into the browser's token)
function buildGuacConnection(hostname, port, security, opts) {
    const gfx = !!opts.enableGfx;
    return {
        connection: {
            type: 'rdp',
            // Negotiated at WebSocket upgrade: permessage-deflate towards the browser
            wsCompression: !!opts.wsCompression,
            settings: {
                hostname,
                port,
                security,
                'ignore-cert': true,
                'enable-wallpaper': !!opts.enableWallpaper,
                'enable-theming': !!opts.enableTheming,
                'enable-font-smoothing': !!opts.enableFontSmoothing,
                'enable-full-window-drag': !!opts.enableFullWindowDrag,
                'enable-desktop-composition': !!opts.enableDesktopComposition,
                'enable-menu-animations': !!opts.enableMenuAnimations,
                // RDP 8 graphics pipeline: better-compressed updates from the host; requires 32-bit colour
                'disable-gfx': !gfx,
                'resize-method': 'display-update',
                'color-depth': gfx ? 32 : (opts.colorDepth ? Number(opts.colorDepth) : 16),
                // Audio is uncompressed PCM (~1.9 Mbps while the host plays sound): opt-in only
                'disable-audio': !opts.enableAudio,
                audio: opts.enableAudio ? ['audio/L16'] : [],
                image: opts.imageWebp ? ['image/webp', 'image/jpeg', 'image/png'] : ['image/jpeg', 'image/png'],
            }
        }
    };
}

// Helper to decrypt AES-256-GCM credentials
function decryptAesGcm(hexCiphertext, hexIv, passcode) {
    const key = crypto.createHash('sha256').update(passcode).digest();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(hexIv, 'hex'));
    
    const cipherBuffer = Buffer.from(hexCiphertext, 'hex');
    const authTag = cipherBuffer.subarray(cipherBuffer.length - 16);
    const encryptedData = cipherBuffer.subarray(0, cipherBuffer.length - 16);
    
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedData, 'binary', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

// Helper to encrypt the connection token consumed by guac-tunnel.js
function encryptGuacToken(value) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('AES-256-CBC', Buffer.from(GUAC_CLIENT_KEY), iv);
    let encrypted = cipher.update(JSON.stringify(value), 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return Buffer.from(JSON.stringify({ iv: iv.toString('base64'), value: encrypted })).toString('base64');
}

// --- WebSocket Routing ---
server.on('upgrade', (request, socket, head) => {
    const { pathname } = new URL(request.url, 'http://localhost');

    if (!STANDALONE_MODE && pathname === '/agent/control') {
        wss.handleUpgrade(request, socket, head, (ws) => handleAgentControl(ws, request));
    } else if (!STANDALONE_MODE && pathname === '/agent/data') {
        wss.handleUpgrade(request, socket, head, (ws) => handleAgentData(ws, request));
    } else if (pathname && pathname.startsWith('/guac')) {
        guacServer.handleUpgrade(request, socket, head);
    } else {
        socket.destroy();
    }
});

// --- Guacamole tunnel (browser <-> guacd) ---
const guacServer = new GuacTunnelServer({
    guacdHost: process.env.GUACD_HOST,
    guacdPort: GUACD_PORT,
    cryptKey: GUAC_CLIENT_KEY,
    logLevel: GUACAMOLE_LOG_LEVEL,
});

guacServer.on('open', (conn) => {
    console.log(`[Guacamole #${conn.id}] Client connection opened (${conn.type})`);
});

guacServer.on('error', (conn, error) => {
    console.error(`[Guacamole #${conn.id}] Connection error:`, error?.message || error || 'unknown error');
});

// Periodic resource log while sessions are active — makes memory/CPU trends visible in journalctl
setInterval(() => {
    const { connections, inflight, paused } = guacServer.stats();
    if (connections === 0) return;
    const mem = process.memoryUsage();
    const mb = (n) => Math.round(n / 1048576);
    console.log(`[Perf] guac=${connections} buffered=${Math.round(inflight / 1024)}KB paused=${paused} rss=${mb(mem.rss)}MB heap=${mb(mem.heapUsed)}MB ext=${mb(mem.external)}MB lag=${recentEventLoopLagMs}ms`);
}, 60000).unref();

// --- Agent Channels ---
function handleAgentControl(ws, req) {
    const query = Object.fromEntries(new URL(req.url, 'http://localhost').searchParams);
    const { agentId, token, passcodeHash } = query;

    if (!agentId || token !== process.env.AGENT_SECRET) {
        ws.close(1008, 'Invalid authentication');
        return;
    }

    console.log(`Agent ${agentId} connected to Control Channel (passcodeHash: ${passcodeHash ? 'present' : 'absent'})`);
    agents.set(agentId, { controlWs: ws, id: agentId, passcodeHash: passcodeHash || '', pendingRequests: new Map() });

    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data.toString());
            const agent = agents.get(agentId);
            if (!agent || !msg.requestId) return;
            const pending = agent.pendingRequests.get(msg.requestId);
            if (!pending) return;
            agent.pendingRequests.delete(msg.requestId);
            clearTimeout(pending.timer);
            pending.resolve(msg);
        } catch (err) {
            console.error(`[Agent ${agentId}] Error parsing control response:`, err.message);
        }
    });

    // Wall-clock heartbeat: immune to GC/CPU pauses that delay pong delivery.
    // Instead of counting missed pings (fragile when event loop stalls), we measure
    // elapsed silence since the last pong. maxSilence expands dynamically when
    // recentEventLoopLagMs is high so that temporary GC pressure never falsely
    // terminates a healthy agent.
    let lastPongAt = Date.now();
    ws.on('pong', () => { lastPongAt = Date.now(); });
    const checkInterval = setInterval(() => {
        const silenceMs = Date.now() - lastPongAt;
        // gcGrace: up to 30s extra headroom proportional to recent event-loop lag
        const gcGrace = Math.min(30000, recentEventLoopLagMs * 20);
        const maxSilence = HEARTBEAT_INTERVAL_MS * HEARTBEAT_MAX_MISSES + gcGrace;
        if (silenceMs > maxSilence) {
            console.log(`Agent ${agentId} heartbeat timeout (silent ${silenceMs}ms > max ${maxSilence}ms). Terminating.`);
            return ws.terminate();
        }
        ws.ping();
    }, HEARTBEAT_INTERVAL_MS);

    const keepAliveInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(AGENT_KEEPALIVE_FRAME);
    }, AGENT_KEEPALIVE_MS);

    ws.on('close', () => {
        clearInterval(checkInterval);
        clearInterval(keepAliveInterval);

        const agent = agents.get(agentId);
        // A reconnected agent may already have replaced this entry; leave the new one alone.
        if (!agent || agent.controlWs !== ws) {
            console.log(`Agent ${agentId} stale control channel closed (already reconnected)`);
            return;
        }
        console.log(`Agent ${agentId} disconnected`);
        for (const [, pending] of agent.pendingRequests) {
            clearTimeout(pending.timer);
            pending.reject(new Error('Agent disconnected'));
        }
        agent.pendingRequests.clear();
        agents.delete(agentId);

        // Bridged sessions run over their own data channel and survive a control-channel
        // reconnect; only sessions still waiting for the agent are abandoned.
        for (const session of pendingSessions.values()) {
            if (session.agentId === agentId && !session.bridged) cleanupSession(session, 'agent disconnected');
        }
    });
}

function handleAgentData(ws, req) {
    const query = Object.fromEntries(new URL(req.url, 'http://localhost').searchParams);
    const { token } = query;

    if (!token || !pendingSessions.has(token)) {
        ws.close(1008, 'Invalid or expired data token');
        return;
    }

    const session = pendingSessions.get(token);
    if (session.tokenUsed) {
        ws.close(1008, 'Data token already used');
        return;
    }

    session.tokenUsed = true;
    session.agentWs = ws;
    console.log(`[Session ${session.sessionId}] Agent Data Channel connected`);

    ws.on('close', (code, reason) => {
        const detail = reason ? reason.toString() : '';
        console.log(`[Session ${session.sessionId}] Agent Data Channel closed (${code}${detail ? `: ${detail}` : ''})`);
        if (!session.bridged) cleanupSession(session, 'agent data channel closed before bridge');
    });
    ws.on('error', (err) => {
        console.error(`[Session ${session.sessionId}] Agent Data Channel error:`, err);
        cleanupSession(session, 'agent data channel error');
    });

    maybeBridgeSession(session);
}

function pipeSockets(ws, tcpSocket, session) {
    console.log(`[Session ${session.sessionId}] Bridging Agent Data WS and guacd TCP`);

    // Enable keepalive on the underlying WS socket to detect silent agent disconnects
    if (ws._socket) {
        ws._socket.setKeepAlive(true, TCP_KEEPALIVE_DELAY_MS);
        ws._socket.setNoDelay(true);
    }

    const wsStream = WebSocket.createWebSocketStream(ws, { binary: true });
    const startTime = Date.now();

    let cleanedUp = false;
    const cleanup = (reason) => {
        if (cleanedUp) return;
        cleanedUp = true;
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(`[Session ${session.sessionId}] Bridge ended after ${elapsed}s (${reason})`);
        wsStream.destroy();
        if (!tcpSocket.destroyed) tcpSocket.destroy();
        cleanupSession(session, reason);
    };

    // ECONNRESET = remote closed abruptly — treat as normal close, not error
    const normalizeErr = (err) => err && err.code === 'ECONNRESET' ? null : err;

    pipeline(wsStream, tcpSocket, (err) => {
        const e = normalizeErr(err);
        cleanup(e ? `ws->tcp: ${e.message}` : 'ws->tcp ended');
    });

    pipeline(tcpSocket, wsStream, (err) => {
        const e = normalizeErr(err);
        cleanup(e ? `tcp->ws: ${e.message}` : 'tcp->ws ended');
    });
}

server.keepAliveTimeout = 65000;  // slightly above nginx default 60s
server.headersTimeout = 70000;    // must be > keepAliveTimeout

server.on('error', (err) => {
    console.error('[Server] HTTP server error:', err);
});

server.listen(PORT, () => {
    console.log(`Proxy Server running on port ${PORT}`);
});

// Graceful shutdown: allow systemd SIGTERM to drain active sessions
function gracefulShutdown(signal) {
    console.log(`[Shutdown] ${signal} received, closing ${pendingSessions.size} session(s)...`);
    for (const session of pendingSessions.values()) {
        cleanupSession(session, `server shutdown (${signal})`);
    }
    server.close(() => {
        console.log('[Shutdown] HTTP server closed');
        process.exit(0);
    });
    // Force exit after 10s if something hangs
    setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (err) => {
    console.error('[Fatal] Uncaught exception:', err);
    gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
    console.error('[Fatal] Unhandled rejection:', reason);
});
