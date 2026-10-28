# Web RDP Run Manual

Manual nay mo ta cau truc moi:

- Khong deploy web client rieng.
- Proxy server va web client nam chung trong source `rdp-proxy-server`.
- Public domain duy nhat: `https://rdp.yourdomain.com` port `443`.
- Web client truy cap tai: `https://rdp.yourdomain.com/client`.
- API/WebSocket cung domain:
  - REST API: `https://rdp.yourdomain.com/api/...`
  - Guacamole WebSocket: `wss://rdp.yourdomain.com/guac`
  - Agent control: `wss://rdp.yourdomain.com/agent/control`
  - Agent data: `wss://rdp.yourdomain.com/agent/data`

## 1. Architecture

```text
Browser
  -> https://rdp.yourdomain.com/client
  -> Nginx :443
  -> Node Proxy :3000
  -> /client static files from rdp-proxy-server/public/client
  -> /api REST
  -> /guac WebSocket
  -> guac-tunnel.js (built-in Guacamole tunnel)
  -> guacd
  -> temporary TCP bridge
  -> Agent Data WebSocket
  -> Windows Agent
  -> 127.0.0.1:3389
```

## 2. Proxy Server On Ubuntu

### 2.1. Install Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v
npm -v
```

Node.js should be `>=20.19` or `>=22.12`.

### 2.2. Run guacd

```bash
sudo apt-get update
sudo apt-get install -y docker.io
sudo systemctl enable --now docker
sudo docker run -d --name guacd --restart unless-stopped \
  --add-host=host.docker.internal:host-gateway \
  -p 127.0.0.1:4822:4822 \
  guacamole/guacd
sudo docker ps
```

Important: guacd runs inside Docker, so `127.0.0.1` from guacd means the container itself, not the Ubuntu host. The `host.docker.internal` mapping lets guacd connect back to the Node TCP bridge on the host.

### 2.3. Deploy Proxy Source

Copy folder `rdp-proxy-server` to Ubuntu:

```bash
sudo mkdir -p /opt/rdp-proxy-server
sudo chown -R $USER:$USER /opt/rdp-proxy-server
```

Then install dependencies:

```bash
cd /opt/rdp-proxy-server
npm ci
```

If `package-lock.json` is not available:

```bash
npm install
```

### 2.4. Proxy `.env`

Create `/opt/rdp-proxy-server/.env`:

```env
PORT=3000
CLIENT_ORIGIN=https://rdp.yourdomain.com
JWT_SECRET=change-this-long-random-jwt-secret
AGENT_SECRET=change-this-agent-secret
GUAC_CLIENT_KEY=change-this-32-byte-or-longer-secret
GUACD_HOST=127.0.0.1
GUACD_PORT=4822
ADMIN_PASSWORD=change-this-admin-password
RDP_SECURITY=nla
RDP_BRIDGE_BIND_HOST=0.0.0.0
RDP_BRIDGE_CONNECT_HOST=host.docker.internal
GUACAMOLE_LOG_LEVEL=NORMAL
```

Important:

- `CLIENT_ORIGIN` must be `https://rdp.yourdomain.com`.
- `AGENT_SECRET` must match `SecretToken` in `RdpHostAgent/appsettings.json`.
- Do not use demo/default secrets on the public internet.
- `RDP_SECURITY=nla` is only the server default. The web client can override it per connection.
- If `guacd` runs in Docker, set `RDP_BRIDGE_BIND_HOST=0.0.0.0` and `RDP_BRIDGE_CONNECT_HOST=host.docker.internal`.
- Keep `GUACAMOLE_LOG_LEVEL=NORMAL` in production. `DEBUG` logs can expose RDP username/password in journal output.

## 3. Build And Embed Web Client Into Proxy Source

The Vue client is built from `rdp-web-client`, but the release artifact must be copied into:

```text
rdp-proxy-server/public/client
```

### 3.1. Build On Development Machine

```powershell
cd .\rdp-web-client
npm install
npm run build
```

Then copy everything from:

```text
rdp-web-client/dist
```

to:

```text
rdp-proxy-server/public/client
```

Deploy the whole `rdp-proxy-server` folder to Ubuntu.

### 3.2. Build Directly On Ubuntu

If you also copy `rdp-web-client` to Ubuntu:

```bash
cd /opt/rdp-web-client
npm ci
npm run build
rm -rf /opt/rdp-proxy-server/public/client
mkdir -p /opt/rdp-proxy-server/public/client
rsync -a --delete dist/ /opt/rdp-proxy-server/public/client/
```

The web client will be available at:

```text
https://rdp.yourdomain.com/client
```

## 4. Nginx HTTPS Reverse Proxy

Install Nginx and Certbot:

```bash
sudo apt-get update
sudo apt-get install -y nginx certbot python3-certbot-nginx
```

Point DNS `rdp.yourdomain.com` to the Ubuntu proxy IP, then issue SSL:

```bash
sudo certbot --nginx -d rdp.yourdomain.com
```

Create Nginx site:

```bash
sudo nano /etc/nginx/sites-available/rdp-proxy
```

Config:

```nginx
server {
    listen 80;
    server_name rdp.yourdomain.com;

    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name rdp.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/rdp.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/rdp.yourdomain.com/privkey.pem;

    client_max_body_size 10m;

    proxy_http_version 1.1;
    proxy_buffering off;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;

    # Forward everything to the Node proxy.
    # Node serves:
    # - /client static web app
    # - /api REST endpoints
    # - /guac WebSocket
    # - /agent/control and /agent/data WebSocket
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;

        # WebSocket support for /guac and /agent/*
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Sec-WebSocket-Extensions "";
    }
}
```

Enable and reload:

```bash
sudo ln -s /etc/nginx/sites-available/rdp-proxy /etc/nginx/sites-enabled/rdp-proxy
sudo nginx -t
sudo systemctl reload nginx
```

## 5. systemd Service For Proxy

Create:

```bash
sudo nano /etc/systemd/system/rdp-proxy.service
```

Content:

```ini
[Unit]
Description=RDP Web Proxy Server
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/rdp-proxy-server
ExecStart=/usr/bin/node --max-old-space-size=256 /opt/rdp-proxy-server/server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
```

Start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now rdp-proxy
sudo systemctl status rdp-proxy
```

Logs:

```bash
journalctl -u rdp-proxy -f
```

## 6. Windows Host Agent

### 6.1. Enable RDP

Run PowerShell as Administrator:

```powershell
Set-ItemProperty -Path 'HKLM:\System\CurrentControlSet\Control\Terminal Server' -Name "fDenyTSConnections" -Value 0
Enable-NetFirewallRule -DisplayGroup "Remote Desktop"
Test-NetConnection 127.0.0.1 -Port 3389
```

### 6.2. Agent Config

`RdpHostAgent/appsettings.json`:

```json
{
  "AgentConfig": {
    "ProxyControlUrl": "wss://rdp.yourdomain.com/agent/control",
    "ProxyDataUrl": "wss://rdp.yourdomain.com/agent/data",
    "AgentId": "HOST-WIN10-OFFICE01",
    "SecretToken": "same-value-as-AGENT_SECRET"
  }
}
```

### 6.3. Run Agent In Console

```powershell
dotnet run --project .\RdpHostAgent\RdpHostAgent.csproj
```

Expected log:

```text
Connected to Control Channel.
```

### 6.4. Publish Agent

```powershell
dotnet publish .\RdpHostAgent\RdpHostAgent.csproj -c Release -r win-x64 --self-contained false -o .\publish\RdpHostAgent
```

Run:

```powershell
.\publish\RdpHostAgent\RdpHostAgent.exe
```

## 7. End-To-End Test

1. `guacd` is running.
2. `rdp-proxy` service is running.
3. Nginx is serving `https://rdp.yourdomain.com`.
4. Windows agent is connected.
5. Open:

```text
https://rdp.yourdomain.com/client
```

6. Login with `ADMIN_PASSWORD`.
7. Dashboard should show `HOST-WIN10-OFFICE01`.
8. Click `Connect`.
9. Enter Windows RDP username/password/domain.
10. Choose Security:
    - `Automatic`: try known working type first, then `nla`, `tls`, `rdp`, `nla-ext`, `any`.
    - A specific value: try only that value.

Useful logs:

```bash
journalctl -u rdp-proxy -f
sudo docker logs guacd --tail 100 -f
sudo tail -f /var/log/nginx/access.log /var/log/nginx/error.log
```

## 8. Quick Checks

Check proxy route:

```bash
curl -I https://rdp.yourdomain.com/api/hosts
```

Expected: `401 Unauthorized`, because JWT is required.

Check client route:

```bash
curl -I https://rdp.yourdomain.com/client
```

Expected: `200 OK`.

Check public WebSocket route from a test machine if needed:

```text
wss://rdp.yourdomain.com/agent/control
```

The request must be a WebSocket upgrade and must include valid `agentId` and `token` query params.

## 9. Troubleshooting Black Screen / Connecting

If browser opens `/client`, host is visible, but RDP screen stays black or stuck at connecting:

1. Hard refresh browser:

```text
Ctrl+F5
```

2. Confirm the deployed client bundle is new. The generated JS file under proxy should change after build:

```bash
ls -lah /opt/rdp-proxy-server/public/client/assets
```

3. Restart proxy after deploying `server.js` or `public/client`:

```bash
sudo systemctl restart rdp-proxy
journalctl -u rdp-proxy -f
```

4. Watch guacd logs in another terminal:

```bash
sudo docker logs guacd --tail 100 -f
```

5. In browser DevTools, check Console and Network:

```text
WebSocket should connect to wss://rdp.yourdomain.com/guac
Console should show Guacamole Client State changes
```

6. Check Windows Agent log. A healthy connection should not end immediately after:

```text
Connected to Proxy Data Channel.
```

If it ends immediately, compare with proxy logs. New proxy logs show whether the close came from `guacd tcp bridge`, `agent data ws`, or `Guacamole`.

7. If the bridge is healthy but guacd disconnects quickly, verify Windows RDP authentication mode. Windows with NLA enabled needs credentials before desktop can start, so enter the Windows RDP credentials in the connect dialog.

### 9.1. Test Docker guacd -> Node TCP Bridge

If proxy logs show:

```text
TCP Bridge listening on 0.0.0.0:xxxxx, advertised to guacd as host.docker.internal:xxxxx
Agent Data Channel connected
Cleaned up (timeout waiting for bridge endpoints)
```

but there is no:

```text
guacd connected to local TCP bridge
```

then guacd cannot connect back to Node. Create a debug listener:

```bash
TOKEN='paste-admin-jwt-from-browser-local-storage'
curl -s -X POST https://rdp.yourdomain.com/api/debug/bridge-listener \
  -H "Authorization: Bearer $TOKEN"
```

The response contains `connectHost` and `port`. Test from the guacd container:

```bash
sudo docker exec -it guacd sh -lc 'getent hosts host.docker.internal || cat /etc/hosts'
sudo docker exec -it guacd sh -lc 'nc -vz host.docker.internal PORT_FROM_RESPONSE'
```

If `nc` is not available inside `guacd`, use a temporary busybox container:

```bash
sudo docker run --rm --add-host=host.docker.internal:host-gateway busybox \
  nc -vz host.docker.internal PORT_FROM_RESPONSE
```

Expected proxy log:

```text
[BridgeDebug ...] Incoming TCP connection from ...
```

If the test fails, use Docker host networking for guacd as a fallback:

```bash
sudo docker rm -f guacd
sudo docker run -d --name guacd --restart unless-stopped --network host guacamole/guacd
```

Then set proxy `.env` back to same-host bridge:

```env
GUACD_HOST=127.0.0.1
GUACD_PORT=4822
RDP_BRIDGE_BIND_HOST=127.0.0.1
RDP_BRIDGE_CONNECT_HOST=127.0.0.1
```

Restart proxy:

```bash
sudo systemctl restart rdp-proxy
```

With the current web client, `Connect` opens a Windows login dialog first. Use:

```text
Username: Windows account name, for example Administrator or lucvd
Password: Windows account password
Domain: optional. For local account, this can usually be empty or the Windows computer name.
```

If guacd still logs:

```text
Server refused connection (wrong security type?)
```

try Security = `Automatic` first. The client will save the successful type per host and prioritize it next time.

For manual testing, select one explicit type in the connect dialog:

```bash
Automatic
NLA
TLS
RDP
NLA Extended
Any
```

If guacd was created before adding `host.docker.internal`, recreate it:

```bash
sudo docker rm -f guacd
sudo docker run -d --name guacd --restart unless-stopped \
  --add-host=host.docker.internal:host-gateway \
  -p 127.0.0.1:4822:4822 \
  guacamole/guacd
sudo systemctl restart rdp-proxy
```
