# VDL RDP WebProxy

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Vue 3](https://img.shields.io/badge/Vue.js-3.x-42b883.svg)](https://vuejs.org/)
[![.NET](https://img.shields.io/badge/.NET-8.0-512bd4.svg)](https://dotnet.microsoft.com/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Donate with PayPal](https://img.shields.io/badge/Donate-PayPal-00457C?logo=paypal&logoColor=white)](https://paypal.me/LucDuy)

**VDL RDP WebProxy** is a self-hosted, web-based Remote Desktop solution that allows you to connect to and control Windows machines via RDP from any modern browser (desktop, tablet, or mobile phone) **without plugins, client software, or VPN**.

It supports **Reverse Tunneling**, allowing target Windows machines behind strict firewalls or NAT environments (such as home or office networks) to initiate outbound connections to the Proxy Server without requiring public IPs or inbound port forwarding.

---

## 📑 Table of Contents

- [Architecture](#-architecture)
- [Key Features](#-key-features)
- [Repository Structure](#-repository-structure)
- [Prerequisites](#-prerequisites)
- [Quick Start Guide](#-quick-start-guide)
  - [1. Start guacd Daemon](#1-start-guacd-daemon)
  - [2. Configure & Setup Proxy Server](#2-configure--setup-proxy-server)
  - [3. Build Web Client](#3-build-web-client)
  - [4. Start Proxy Server](#4-start-proxy-server)
  - [5. Setup Windows Host Agent (Optional)](#5-setup-windows-host-agent-optional)
- [Deployment Modes](#-deployment-modes)
- [Production Deployment (Nginx & SSL)](#-production-deployment-nginx--ssl)
- [Security](#-security)
- [Support the Project](#-support-the-project)
- [License](#-license)

---

## 🏛 Architecture

```text
┌─────────────────────────────────┐
│       Web Browser (Client)      │  (Vue 3 + HTML5 Canvas + guacamole-common-js)
└───────────────┬─────────────────┘
                │  HTTPS / WSS (WebSocket)
                ▼
┌─────────────────────────────────┐
│        Nginx Reverse Proxy      │  (SSL Termination & Port 443)
└───────────────┬─────────────────┘
                │  HTTP / WS
                ▼
┌─────────────────────────────────┐
│     rdp-proxy-server (Node.js)  │  (REST API, Auth, GuacTunnel & TCP Bridge)
└────────┬────────────────────────┘
         │               │
         │ (Guacamole)   │ (WebSocket Data Tunnel)
         ▼               ▼
┌─────────────────┐    ┌─────────────────────────────────┐
│  guacd daemon   │    │  RdpHostAgent (.NET 8 Service)  │
│    (Docker)     │    │  (Runs on target Windows PC)    │
└────────┬────────┘    └────────────────┬────────────────┘
         │                              │
         └────────── TCP 3389 ──────────┘
                         ▼
             ┌──────────────────────┐
             │  Windows RDP Server  │
             └──────────────────────┘
```

### Data Flow:
1. **Host Agent** initiates an outbound WebSocket connection (`/agent/control`) to the **Proxy Server** and maintains an online state with heartbeats.
2. The user signs in via the Web UI, selects a machine, and provides RDP credentials (protected by an encrypted Passcode).
3. The **Proxy Server** signals the **Host Agent** via the control channel to open a dedicated data channel.
4. The **Host Agent** opens an internal TCP socket to Windows RDP (`127.0.0.1:3389`) and pipes binary data bi-directionally over WebSocket (`/agent/data`).
5. **guacd** connects to the temporary TCP bridge on the Proxy Server, translates RDP graphics into Guacamole protocol frames, and streams them over WebSocket (`/guac`).
6. The browser renders the display on an HTML5 Canvas and relays user mouse, touch, and keyboard events back in real-time.

---

## ✨ Key Features

- 🌐 **Pure Web RDP**: Works out-of-the-box on HTML5 Canvas and WebSockets. No plugins, extensions, Flash, or Java required.
- 📱 **Mobile & Tablet Optimized**:
  - Direct Touch, Virtual Touchpad, and Virtual Mouse modes.
  - On-Screen Live Virtual Keyboard.
  - Quick action toolbar with essential modifier and system keys: `Ctrl`, `Alt`, `Shift`, `Win`, `Tab`, `Esc`, `Enter`, `Del`, `F1`–`F12`.
- 🖥️ **Flexible Display Modes**:
  - **Fit to Viewport**: Dynamically auto-scales to fit your browser window.
  - **Scrollable (1:1)**: Preserves native remote resolution with browser scrollbars.
  - **Fullscreen**: Distraction-free full-screen experience.
  - **Window Crop**: Focus and zoom into a specific application window.
  - **Color Depth Tuning**: Choose between 16-bit (low bandwidth/high speed), 24-bit (balanced), and 32-bit (maximum quality).
- 📁 **File Upload & Clipboard Sync**: Seamlessly upload files to the remote desktop and synchronize clipboard contents.
- ⚡ **Real-time Latency Monitor**: Live ping measurement displayed directly on the top bar.
- 🔒 **Comprehensive Security**:
  - Admin authentication using JSON Web Tokens (JWT).
  - Rate-limiting to protect against brute-force login attempts.
  - End-to-end credential protection: RDP credentials (Username, Password, Domain) are encrypted using AES-256-GCM in the browser via an Agent Passcode.
  - Guacamole connection tokens encrypted using AES-256-CBC.

---

## 📂 Repository Structure

```text
├── rdp-proxy-server/          # Backend proxy server (Node.js + Express + ws)
│   ├── server.js              # Server entry point & session orchestration
│   ├── guac-tunnel.js         # WebSocket bridge for guacd Guacamole protocol
│   ├── public/client/         # Production-built web client assets
│   └── package.json
│
├── rdp-web-client/            # Frontend SPA (Vue 3 + Vite)
│   ├── src/
│   │   ├── components/
│   │   │   └── RdpCanvas.vue  # Canvas renderer, input handlers (mouse, touch, keyboard)
│   │   ├── views/
│   │   │   ├── Dashboard.vue  # Host management dashboard
│   │   │   ├── Login.vue      # Admin authentication page
│   │   │   └── RemoteViewer.vue
│   │   └── auth.js
│   ├── vite.config.js
│   └── package.json
│
└── RdpHostAgent/              # Windows background agent (C# .NET 8)
    ├── Program.cs             # Service host configuration
    ├── Worker.cs              # Control channel handler & connection events
    ├── Services/
    │   ├── BaseWebSocketService.cs
    │   └── DataTunnelBridge.cs # Bi-directional piping between TCP 3389 & WebSocket
    ├── appsettings.json       # Agent configuration
    └── RdpHostAgent.csproj
```

---

## 📋 Prerequisites

- **Proxy Server (Linux / Ubuntu / Debian or Windows)**:
  - Node.js: `>= 18.x` (Node.js 20 or 22 LTS recommended)
  - Docker: To run the `guacamole/guacd` container
- **Target Windows Host (Machine to control)**:
  - Windows 10 / 11 / Windows Server (Remote Desktop enabled)
  - .NET 8.0 Runtime (or .NET 8.0 SDK to build from source)

---

## 🚀 Quick Start Guide

### 1. Start guacd Daemon

Run the official Apache Guacamole daemon using Docker:

```bash
docker run -d --name guacd --restart unless-stopped \
  --add-host=host.docker.internal:host-gateway \
  -p 127.0.0.1:4822:4822 \
  guacamole/guacd
```

> **Note:** The `--add-host=host.docker.internal:host-gateway` flag enables the `guacd` container to reach the proxy server's temporary TCP bridge on the host machine.

### 2. Configure & Setup Proxy Server

Navigate to the `rdp-proxy-server` folder and install dependencies:

```bash
cd rdp-proxy-server
npm install
```

Create a `.env` configuration file (you can copy from `.env.example`):

```bash
cp .env.example .env
```

Configure your environment variables:

```env
PORT=3000
CLIENT_ORIGIN=http://localhost:3000

# Security Secrets (replace with strong, random strings of 32+ characters)
JWT_SECRET=your-secure-jwt-secret-key-32-chars-min
ADMIN_PASSWORD=your-admin-password-for-web-login
AGENT_SECRET=your-agent-websocket-shared-secret
GUAC_CLIENT_KEY=your-32-byte-secret-aes-key-here!

# Guacamole Daemon Configuration
GUACD_HOST=127.0.0.1
GUACD_PORT=4822

# TCP Bridge Configuration
RDP_SECURITY=any
RDP_BRIDGE_BIND_HOST=0.0.0.0
RDP_BRIDGE_CONNECT_HOST=host.docker.internal
```

### 3. Build Web Client

Navigate to `rdp-web-client` and build the frontend:

```bash
cd ../rdp-web-client
npm install
npm run build
```

Vite will compile and output the static bundle directly to `rdp-proxy-server/public/client`.

### 4. Start Proxy Server

Return to `rdp-proxy-server` and launch the application:

```bash
cd ../rdp-proxy-server
npm start
```

Open your browser and navigate to:
```text
http://localhost:3000/client
```

Log in using the `ADMIN_PASSWORD` you configured.

---

### 5. Setup Windows Host Agent (Optional)

If the target Windows machine is located behind NAT or firewall without an external IP:

1. **Publish the Agent**:
   ```powershell
   cd RdpHostAgent
   dotnet publish -c Release -r win-x64 --self-contained true -o ./publish
   ```

2. **Configure `appsettings.json`** inside the published directory:
   ```json
   {
     "AgentConfig": {
       "ProxyControlUrl": "wss://your-domain.com/agent/control",
       "ProxyDataUrl": "wss://your-domain.com/agent/data",
       "AgentId": "MY-OFFICE-PC",
       "SecretToken": "your-agent-websocket-shared-secret"
     }
   }
   ```

3. **Set Passcode**:
   Set an encryption passcode (used to decrypt connection credentials securely in RAM):
   ```cmd
   RdpHostAgent.exe --set-passcode
   ```

4. **Register as Windows Service (Recommended)**:
   Open PowerShell as Administrator:
   ```powershell
   New-Service -Name "RdpHostAgent" -BinaryPathName "C:\Path\To\RdpHostAgent.exe" -DisplayName "RDP Host Agent Service" -StartupType Automatic
   Start-Service -Name "RdpHostAgent"
   ```

---

## 🔀 Deployment Modes

### 1. Reverse Tunnel Mode (Default)
- Target Windows machines run `RdpHostAgent` and connect outbound to the proxy server.
- Ideal for remote PCs located across different local networks without port forwarding.
- Web dashboard lists all active hosts with real-time status.

### 2. Standalone Mode (Agentless)
- For scenarios where the proxy server can reach the target RDP machine directly via local network or VPN.
- Enable the following in `rdp-proxy-server/.env`:
  ```env
  STANDALONE_MODE=true
  STANDALONE_RDP_HOST=127.0.0.1
  STANDALONE_RDP_PORT=3389
  STANDALONE_HOST_NAME=Local-Machine
  ```
- No Windows Agent required; `guacd` connects directly to `STANDALONE_RDP_HOST`.

---

## 🛡️ Production Deployment (Nginx & SSL)

For public production deployments, use Nginx as a reverse proxy with HTTPS and WebSocket upgrades:

```nginx
server {
    listen 80;
    server_name rdp.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name rdp.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/rdp.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/rdp.yourdomain.com/privkey.pem;

    # Static Web Client & REST API
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket Endpoints
    location ~* ^/(guac|agent/control|agent/data) {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

---

## 🔐 Security

- **Zero Inbound Ports**: Target Windows machines require no open inbound ports (port 3389 remains local).
- **End-to-End Encryption**: User credentials are encrypted client-side using AES-256-GCM with the Agent Passcode and decrypted solely in transient memory on the proxy server.
- **Brute-Force Protection**: IP-based rate limiting on administrative endpoints prevents brute-force login attempts.

---

## ☕ Support the Project

If you find this project helpful and want to support its ongoing development and maintenance, you can donate via PayPal:

[![Donate with PayPal](https://img.shields.io/badge/Donate-PayPal-00457C?style=for-the-badge&logo=paypal&logoColor=white)](https://paypal.me/LucDuy)

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
