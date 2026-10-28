# TÀI LIỆU PHÂN TÍCH THIẾT KẾ VÀ ĐẶC TẢ MÃ NGUỒN HỆ THỐNG WEB-BASED RDP PROXY

Tài liệu này được thiết kế cấu trúc chi tiết nhằm cung cấp đầy đủ bối cảnh, kiến trúc luồng dữ liệu, cấu trúc thư mục và logic nghiệp vụ cho Gemini CLI có thể đọc và khởi tạo toàn bộ source code cho hệ thống Web-based Remote Desktop thông qua kỹ thuật Reverse Tunnel.

---

## 1. TỔNG QUAN KIẾN TRÚC HỆ THỐNG (SYSTEM ARCHITECTURE)

Hệ thống cho phép người dùng điều khiển máy tính Windows (Host) từ xa thông qua trình duyệt Web (Client) mà không yêu cầu máy Host phải mở cổng mạng (Port Forwarding) hoặc có IP công cộng. Hệ thống giải quyết bằng cơ chế **Reverse Proxy qua WebSocket & TCP Bridging**.

### Luồng Di Chuyển Của Dữ Liệu (Data Flow)
1. **Khởi tạo Kênh điều khiển (Control Channel):** `Host Agent (.NET 8)` khởi động như một Windows Service -> Chủ động kết nối Outbound qua WebSocket tới `Proxy Server (Node.js)` -> Đăng ký định danh máy (Host ID) và duy trì trạng thái Online (Keep-Alive).
2. **Yêu cầu Kết nối từ Trình duyệt:** Người dùng truy cập giao diện `Vue 3 Frontend` -> Xem danh sách Host Online -> Nhấn "Connect" vào một Host cụ thể.
3. **Kích hoạt Kênh Dữ liệu (Data Tunnel Kicking):** `Proxy Server` gửi một lệnh điều khiển qua Control Channel yêu cầu `Host Agent` tạo một kết nối WebSocket mới dành riêng cho luồng dữ liệu (Data Channel).
4. **Bắc cầu mạng (Bridging):**
   - Tại máy Host: `Host Agent` mở một kết nối TCP nội bộ (`TCP Socket`) tới cổng RDP gốc của Windows (`127.0.0.1:3389`). Sau đó, Agent liên tục đọc/ghi dữ liệu nhị phân (Raw Bytes) qua lại giữa TCP Socket này và WebSocket Data Channel.
   - Tại Proxy Server: `Proxy Server` tích hợp một RDP Client Engine (Sử dụng giải pháp giải mã giao thức RDP thô thành hình ảnh). Server nhận dữ liệu thô từ Agent, giải mã các gói tin đồ họa RDP thành các khung hình ảnh (JPEG/PNG hoặc WebP) và truyền tín hiệu hình ảnh này tới `Vue 3 Frontend` qua mạng WebSocket.
5. **Tương tác từ Client:** Trình duyệt nhận hình ảnh -> Vẽ lên `HTML5 Canvas`. Khi người dùng di chuyển chuột hoặc bấm phím -> Sự kiện được đóng gói và gửi về `Proxy Server` -> Proxy dịch thành lệnh RDP chuẩn gửi qua Tunnel về cho máy Host thực thi.

---

## 2. THÀNH PHẦN 1: HOST AGENT (.NET 8 WINDOWS SERVICE)

### Cấu trúc thư mục dự án (Folder Structure)
```text
RdpHostAgent/
│
├── RdpHostAgent.sln
├── RdpHostAgent/
│   ├── RdpHostAgent.csproj
│   ├── Program.cs
│   ├── AppSettings.cs
│   ├── Worker.cs
│   ├── Services/
│   │   ├── BaseWebSocketService.cs
│   │   ├── ControlChannelService.cs
│   │   └── DataTunnelBridge.cs
│   └── appsettings.json


Đặc tả Logic & Mã Nguồn Cần Triển khai
1. Cấu hình (appsettings.json)

Lưu trữ thông tin địa chỉ Proxy Server và Khóa bảo mật (Secret Key) để xác thực Agent.
JSON

{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.Hosting.Lifetime": "Information"
    }
  },
  "AgentConfig": {
    "ProxyControlUrl": "ws://your-proxy-server-ip:3000/agent/control",
    "ProxyDataUrl": "ws://your-proxy-server-ip:3000/agent/data",
    "AgentId": "HOST-WIN10-OFFICE01",
    "SecretToken": "SecureAgentToken2026"
  }
}

2. Lớp điều khiển chính (Worker.cs)

Kế thừa BackgroundService của .NET để chạy ngầm như một Windows Service.

    Khi StartAsync: Gọi ControlChannelService để thiết lập kết nối WebSocket điều khiển bền vững.

    Lắng nghe các thông điệp từ Proxy Server. Nếu nhận được thông điệp dạng JSON: {"action": "CONNECT_SESSION", "sessionId": "12345"} -> Khởi tạo một luồng xử lý bất đồng bộ (Task) mới chạy DataTunnelBridge.

3. Bộ bắc cầu dữ liệu thô (Services/DataTunnelBridge.cs)

Đây là trái tim của Agent, thực hiện luân chuyển dữ liệu phi trạng thái (Stateless Raw Byte Piping) giữa RDP gốc và Proxy.

    Bước 1: Khởi tạo một TcpClient kết nối tới 127.0.0.1:3389.

    Bước 2: Khởi tạo một ClientWebSocket kết nối tới ProxyDataUrl kèm theo Query String ?sessionId=12345&agentId=....

    Bước 3: Kích hoạt đồng thời hai luồng đọc/ghi bất đồng bộ (Bi-directional Stream Piping):

        Luồng Xuống (Tunnel to RDP): Đọc dữ liệu nhị phân nhận được từ WebSocket -> Ghi trực tiếp vào NetworkStream của TCP Client.

        Luồng Lên (RDP to Tunnel): Đọc dữ liệu nhị phân từ NetworkStream của TCP Client -> Đóng gói thành WebSocketMessageType.Binary và gửi lên Proxy Server.

    Yêu cầu xử lý lỗi: Khi một trong hai kết nối (TCP hoặc WebSocket) bị đứt, phải chủ động Close() kết nối còn lại để giải phóng tài nguyên hệ thống, tránh rò rỉ bộ nhớ (Memory Leak).

3. THÀNH PHẦN 2: PROXY SERVER (NODE.JS + EXPRESS + WS)
Cấu trúc thư mục dự án (Folder Structure)
Plaintext

rdp-proxy-server/
│
├── package.json
├── server.js
├── config/
│   └── default.json
├── src/
│   ├── app.js
│   ├── controllers/
│   │   └── hostController.js
│   ├── routes/
│   │   └── api.js
│   └── websocket/
│       ├── controlHub.js
│       ├── dataHub.js
│       └── clientHub.js
└── node_modules/

Đặc tả Logic & Mã Nguồn Cần Triển khai
1. Quản lý Thư viện (package.json)

Các thư viện cốt lõi cần cài đặt:
JSON

{
  "name": "rdp-proxy-server",
  "version": "1.0.0",
  "main": "server.js",
  "dependencies": {
    "express": "^4.19.2",
    "ws": "^8.16.0",
    "cors": "^2.8.5",
    "config": "^3.3.11"
  }
}

2. Quản lý Kết nối WebSocket (src/websocket/)

Proxy Server cần chạy một HTTP Server chung cổng kết nối (ví dụ: Port 3000), sau đó phân tách các luồng WebSocket bằng URL Endpoint Routing:

    /agent/control: Dành cho Kênh điều khiển của Agent.

        Duy trì một Map<string, WebSocket> để lưu danh sách các Agent đang online (Key là agentId).

        Có cơ chế Heartbeat (Ping/Pong) cứ mỗi 30 giây để phát hiện và xóa bỏ các Agent mất kết nối đột ngột khỏi danh sách trực tuyến.

    /agent/data: Dành cho Luồng truyền dữ liệu thô từ Agent lên.

        Nhận dữ liệu nhị phân thô từ giao thức RDP mà Agent đẩy lên.

    /client/rdp: Dành cho Web Browser (Vue 3) kết nối vào để nhận luồng hiển thị desktop.

3. Bộ xử lý dịch chuyển giao thức (RDP Decoding & Event Translation)

Để Vue Frontend hiển thị được màn hình Windows mà không cần cài thêm plugin, Proxy Server đóng vai trò dịch giao thức (Protocol Translator).

    Bộ giải mã hình ảnh (Graphics Stream): Proxy Server sẽ tiếp nhận luồng dữ liệu nhị phân RDP từ /agent/data. Thông qua một RDP Parser logic (môphỏng theo đặc tả của FreeRDP), Proxy dịch các lệnh đồ họa (như vẽ Bitmap, cập nhật vùng màn hình) thành các chuỗi ảnh nén chất lượng cao (JPEG/PNG/WebP) hoặc mảng Pixel nhị phân, sau đó gửi qua kênh /client/rdp tới Vue.

    Bộ dịch sự kiện tương tác (Input Translation): Khi nhận gói tin JSON từ Vue chứa thông tin chuột/bàn phím (ví dụ: {"type": "MOUSE_MOVE", "x": 100, "y": 150, "button": 0}), Proxy Server sẽ biên dịch cấu trúc này thành cấu trúc mảng byte RDP Input Event tương ứng theo chuẩn Microsoft RDP và đẩy ngược xuống kênh dữ liệu của Agent để truyền vào cổng 3389 của máy Host.

4. THÀNH PHẦN 3: CLIENT FRONTEND (VUE 3 + VITE)
Cấu trúc thư mục dự án (Folder Structure)
Plaintext

rdp-web-client/
│
├── package.json
├── vite.config.js
├── index.html
└── src/
    ├── main.js
    ├── App.vue
    ├── router/
    │   └── index.js
    ├── views/
    │   ├── Dashboard.vue
    │   └── RemoteViewer.vue
    └── components/
        └── RdpCanvas.vue

Đặc tả Logic & Mã Nguồn Cần Triển khai
1. Màn hình điều khiển (views/Dashboard.vue)

    Gửi yêu cầu HTTP GET tới API http://proxy-ip:3000/api/hosts để lấy danh sách máy Agent đang online.

    Hiển thị danh sách dưới dạng lưới (Grid Cards) gồm các thông tin: Tên máy, ID, Trạng thái.

    Khi người dùng nhấn nút "Connect", Router chuyển hướng sang trang /remote/:agentId.

2. Thành phần hiển thị chính (components/RdpCanvas.vue)

Thành phần này chứa một thẻ  chiếm toàn bộ không gian màn hình hiển thị để render khung hình Remote Desktop.

    Xử lý Nhận hình ảnh đồ họa:

        Mở kết nối WebSocket tới ws://proxy-ip:3000/client/rdp?agentId=....

        Cấu hình thuộc tính nhận dữ liệu là nhị phân: socket.binaryType = 'arraybuffer';

        Khi sự kiện socket.onmessage được kích hoạt, lấy dữ liệu ảnh thô nén, tạo đối tượng hình ảnh của Javascript và vẽ trực tiếp lên canvas bằng ngữ cảnh 2D:
        JavaScript

        const blob = new Blob([event.data], { type: 'image/jpeg' });
        const img = new Image();
        img.onload = () => {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(img.src);
        };
        img.src = URL.createObjectURL(blob);


* **Xử lý Bắt sự kiện người dùng (Input Events):**
    - **Chuột (Mouse):** Đăng ký lắng nghe sự kiện mousemove, mousedown, mouseup, và wheel trên thẻ canvas. Tính toán tỷ lệ tọa độ thực tế so với kích thước độ phân giải của máy host nhận được để đảm bảo con trỏ chuột bấm chính xác mục tiêu. Đóng gói dữ liệu và gửi qua WebSocket:
      ```javascript
      const sendMouseEvent = (type, e) => {
          const rect = canvas.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          socket.send(JSON.stringify({
              action: 'INPUT_MOUSE',
              type: type,
              x: Math.round(x),
              y: Math.round(y),
              button: e.button
          }));
      };
      

- **Bàn phím (Keyboard):** Đăng ký lắng nghe sự kiện keydown và keyup toàn cục (window.addEventListener). Ngăn chặn các hành vi mặc định của trình duyệt (ví dụ: Phím Tab, Phím F5) bằng e.preventDefault(). Gửi mã phím hệ thống (e.key hoặc e.keyCode) về Server để biên dịch sang mã quét bàn phím (Scan code) của Windows.

