# Workspace Rules & Multi-Branch Guidelines

## 1. Branch Strategy & Repository Architecture

Dự án này được tổ chức thành 2 nhánh / 2 luồng repository:
- **`main` (Private / Nội bộ)**: Chứa toàn bộ tính năng đầy đủ của dự án nội bộ, bao gồm các kịch bản deploy server riêng (`deployscripts/`), các cấu hình bảo mật nội bộ và tính năng **ngụy trang tin tức (Fake News / Disguise Feature)**.
- **`public` (Public Open-Source)**: Nhánh được sử dụng để xuất bản ra repository công khai trên GitHub (`vdl_rdp_webproxy`). Nhánh này phải là mã nguồn sạch, an toàn, chuẩn mực và **loại bỏ hoàn toàn tính năng fake news**.

---

## 2. QUY TẮC BẮT BUỘC CHO NHÁNH `public`

> [!CRITICAL]
> **ĐIỂM CỐT LÕI: TUYỆT ĐỐI KHÔNG MANG TÍNH NĂNG FAKE NEWS VÀ DỮ LIỆU NHẠY CẢM VÀO NHÁNH `public`!**

Bất cứ khi nào Agent hoặc lập trình viên thực hiện sửa đổi mã nguồn (tính năng mới, sửa lỗi, cập nhật giao diện, tối ưu hóa) trên `main` và phản ánh sang `public` (hoặc trực tiếp thao tác trên `public`), **PHẢI TUÂN THỦ NGHIÊM NGẶT** các quy tắc sau:

### Quy tắc 2.1: Danh sách các thành phần Fake News BỊ CẤM trên `public`
1. **Các file BỊ XÓA HOÀN TOÀN (Không được tồn tại)**:
   - `rdp-proxy-server/news-fetcher.js`
   - `rdp-proxy-server/news-gate.js`
   - `rdp-proxy-server/tmp/news-*.json` hoặc bất kỳ cache tin tức nào.
2. **Mã nguồn trong `rdp-proxy-server/server.js`**:
   - **CẤM** import: `require('./news-fetcher')` và `require('./news-gate')`.
   - **CẤM** toàn bộ khối mã nguồn giữa `// @news-begin` và `// @news-end` (bao gồm: `FAKE_INDEX_ENABLED`, `newsGate`, middleware `newsGate.middleware`, `GET /`, `POST /news-refresh`, `GET/PUT/DELETE /news-read/:userId`).
   - **CẤM** kiểm tra `newsGate` trong WebSocket upgrade handler:
     ```javascript
     // TUYỆT ĐỐI KHÔNG CÓ DÒNG NÀY TRÊN PUBLIC:
     if (newsGate && !newsGate.isUnlocked(request)) return socket.destroy();
     ```
   - **CẤM** tiến trình làm mới tin ngầm:
     ```javascript
     // TUYỆT ĐỐI KHÔNG CÓ DÒNG NÀY TRÊN PUBLIC:
     if (FAKE_INDEX_ENABLED) newsFetcher.startDailyRefresh();
     ```
3. **Các file cấu hình môi trường**:
   - **CẤM** biến `FAKE_INDEX` trong `.env.standalone.example`, `.env.example` hoặc bất kỳ tài liệu hướng dẫn công khai nào.

### Quy tắc 2.2: Loại bỏ thông tin nhạy cảm và binary rác
- **Không commit file `.env` thực tế**: File `.env` chứa mật khẩu `ADMIN_PASSWORD`, khóa bí mật `JWT_SECRET`, `AGENT_SECRET`, `GUAC_CLIENT_KEY`. File `.gitignore` trên `public` phải luôn bao gồm `.env` và `*.env`.
- **Không commit thư mục build binary**: Bỏ qua hoặc xóa bỏ `publish/`, `RdpHostAgent/bin/`, `RdpHostAgent/obj/`. Người dùng public sẽ build từ mã nguồn thông qua hướng dẫn trong `README.md`.
- **Không đưa scripts deploy nội bộ riêng tư** (`deployscripts/`) vào nhánh public.

---

## 3. Quy trình phản ánh thay đổi từ `main` sang `public`

Khi Agent được yêu cầu đồng bộ / phản ánh các thay đổi mã nguồn từ `main` sang `public`, hãy thực hiện theo đúng 5 bước sau:

1. **Bước 1: Đảm bảo working directory sạch sẽ**
   ```bash
   git status
   ```
2. **Bước 2: Chuyển sang branch `public`**
   ```bash
   git checkout public
   ```
3. **Bước 3: Porting thay đổi**
   - Áp dụng các thay đổi từ `main` (có thể dùng `git cherry-pick`, `git merge`, hoặc copy/patch các file tính năng như `rdp-web-client/`, `RdpHostAgent/`, các hàm xử lý tunnel chung).
   - Nếu chỉnh sửa `rdp-proxy-server/server.js`, hãy kiểm tra kỹ để đảm bảo KHÔNG mang theo bất kỳ đoạn mã fake-news nào.
4. **Bước 4: Kiểm tra nghiêm ngặt (Sanity Check)**
   - Kiểm tra cú pháp JavaScript:
     ```bash
     node --check rdp-proxy-server/server.js
     ```
   - Quét từ khóa cấm trong git:
     ```bash
     git grep -i -E "news-fetcher|news-gate|fake_index|newsGate|newsFetcher"
     ```
     *(Kết quả phải hoàn toàn không xuất hiện trong mã nguồn `rdp-proxy-server`)*.
   - Kiểm tra các file staged:
     ```bash
     git status
     ```
     *(Đảm bảo không vô tình stage file `.env`, `news-*.js`, binary rác)*.
5. **Bước 5: Commit với thông điệp rõ ràng**
   - Commit thay đổi: `git commit -m "feat/fix: <mô tả thay đổi>"`
