# HƯỚNG DẪN TRIỂN KHAI VÀ VẬN HÀNH (RELEASE MANUAL)

Tài liệu hướng dẫn cấu hình, cài đặt và chạy hệ thống RDP Web Proxy với cơ chế mã hóa End-to-End nâng cao, hỗ trợ Windows Service và giao diện Client tối ưu hóa.

---

## 1. Windows Host Agent (RdpHostAgent)

Agent chạy trên máy chủ Windows để làm cầu nối trung chuyển dữ liệu RDP.

### Cài đặt và cấu hình Passcode
Mọi thông tin đăng nhập nhạy cảm (Username, Password, Domain) sẽ được mã hóa bằng AES-256-GCM ở phía Client thông qua **Passcode** và chỉ giải mã trên bộ nhớ RAM của Proxy.
1. **Thiết lập Passcode qua dòng lệnh**:
   Mở PowerShell hoặc Command Prompt với quyền Administrator tại thư mục chứa Agent đã build và chạy lệnh:
   ```cmd
   RdpHostAgent.exe --set-passcode
   ```
   Nhập passcode mong muốn (tối thiểu 6 ký tự) và xác nhận lại. Passcode này sẽ được băm SHA-256 và tự động lưu vào file `appsettings.json` của Agent dưới khóa `PasscodeHash`.
2. **Khởi chạy trực tiếp (Interactive Mode)**:
   Nếu chạy Agent bằng cách nhấp đúp hoặc từ CLI thông thường mà chưa cấu hình passcode, chương trình sẽ tự động hiển thị màn hình yêu cầu bạn thiết lập passcode trước khi bắt đầu kết nối về Proxy Server.

### Chuyển Agent thành Windows Service (Auto Start)
Để Agent có thể tự động chạy ngầm khi Windows khởi động mà không cần tài khoản người dùng đăng nhập trực tiếp:
1. **Đăng ký Service**:
   Mở PowerShell với quyền Administrator và chạy lệnh:
   ```powershell
   New-Service -Name "RdpHostAgent" -BinaryPathName "C:\Path\To\Your\RdpHostAgent.exe" -DisplayName "Rdp Host Agent Service" -StartupType Automatic
   ```
   *(Hãy thay thế `C:\Path\To\Your\RdpHostAgent.exe` bằng đường dẫn tuyệt đối đến file thực thi của bạn).*
2. **Khởi động Service**:
   ```powershell
   Start-Service -Name "RdpHostAgent"
   ```
3. **Gỡ bỏ Service (khi cần nâng cấp hoặc gỡ cài đặt)**:
   ```powershell
   Stop-Service -Name "RdpHostAgent"
   Remove-Service -Name "RdpHostAgent"
   ```

---

## 2. Proxy Server (rdp-proxy-server)

Proxy Server quản lý phiên kết nối, xác thực JWT, giải mã thông tin kết nối bằng mật mã và làm cổng trung chuyển WebSocket tới Guacd container.

### Cấu hình biến môi trường (`.env`)
Tạo hoặc cập nhật file `.env` ở thư mục `rdp-proxy-server` với cấu hình sau:
```env
PORT=5000
JWT_SECRET=your_jwt_secret_key_here
AGENT_SECRET=your_agent_websocket_token_here
GUAC_CLIENT_KEY=your_aes_cbc_key_exactly_32_bytes_
GUACD_HOST=host.docker.internal
GUACD_PORT=4822
RDP_BRIDGE_CONNECT_HOST=host.docker.internal
RDP_BRIDGE_START_PORT=10000
```
*(Lưu ý: `GUAC_CLIENT_KEY` cần có độ dài đúng 32 ký tự để dùng làm khóa mã hóa AES-256-CBC cho Token kết nối của Guacamole).*

### Khởi chạy Server
1. Cài đặt các thư viện Node.js:
   ```bash
   npm install
   ```
2. Chạy ứng dụng:
   ```bash
   npm start
   ```
   Hoặc chạy ở chế độ phát triển:
   ```bash
   npm run dev
   ```

---

## 3. Web Client (rdp-web-client)

Giao diện quản lý và điều khiển máy tính từ xa qua trình duyệt Web.

### Các nâng cấp mới trên giao diện
1. **Yêu cầu Passcode & Tối ưu màu (Color Depth)**:
   - Khi click **Connect** trên thiết bị mong muốn, màn hình đăng nhập Windows sẽ có thêm ô **Agent Passcode** và lựa chọn **Color Depth** (32-bit: Đẹp nhất, 24-bit: Mượt, 16-bit: Nhanh nhất - khuyên dùng cho mạng yếu).
2. **Chế độ hiển thị màn hình (Display Mode)**:
   - Khi tùy chỉnh kích thước tĩnh (ví dụ: 1920x1080, 1280x720...), bạn có thể chuyển đổi:
     - **Fit to viewport**: Tự động scale hiển thị màn hình RDP vừa vặn hoàn toàn với khung cửa sổ trình duyệt hiện tại.
     - **Scrollable**: Hiển thị tỷ lệ 1:1, hiển thị thanh cuộn của trình duyệt khi kích thước cửa sổ của bạn nhỏ hơn độ phân giải RDP.
3. **Ẩn/Hiện chuột (Hide Mouse)**:
   - Tùy chọn checkbox **Ẩn chuột** trên thanh công cụ cho phép ẩn con trỏ chuột cục bộ trên canvas điều khiển, giúp các tương tác trực tiếp nhạy bén và tự nhiên hơn.
4. **Latency (Tốc độ phản hồi mạng)**:
   - Góc phải thanh công cụ sẽ hiển thị độ trễ kết nối (Latency: XXms), hệ thống tự động kiểm tra định kỳ 3 giây để cập nhật trực quan tốc độ mạng của bạn.

### Biên dịch và Triển khai Production
1. Biên dịch source code Vue:
   ```bash
   npm run build
   ```
   Thư mục tĩnh biên dịch sẽ được tạo ra tại `rdp-web-client/dist/`.
2. Phục vụ tĩnh:
   - Mặc định Proxy Server (`server.js`) đã cấu hình để phục vụ các file tĩnh trong `../rdp-web-client/dist`. Bạn chỉ cần đặt thư mục `dist` này song song với thư mục `rdp-proxy-server` là hệ thống có thể chạy hoàn chỉnh cả frontend và backend trên cùng một cổng.
