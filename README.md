# M.S.TECH SMART AGRICULTURE

Dự án Hệ thống giám sát và phân tích nông nghiệp thông minh, giao tiếp với thiết bị ESP32-S3 thông qua Firebase Realtime Database.

## 1. Project là gì
Đây là một Web App quản lý trạm quan trắc nông nghiệp IoT, chuyên thu thập 5 thông số đất chuẩn gồm: Đạm (N), Lân (P), Kali (K), Độ ẩm đất, và Nhiệt độ đất.
Web App tích hợp M.S.AI (Google Gemini) để phân tích dữ liệu và cung cấp trợ lý ảo thông minh.

## 2. Architecture
Hệ thống tuân theo luồng giao tiếp một chiều thông qua Firebase:
- **Web App**: React, TypeScript, TailwindCSS (Mobile-first).
- **Backend/AI**: Express Server xử lý API phân tích (ẩn API Key Gemini).
- **Firebase**: Realtime Database đóng vai trò là cầu nối (Source of Truth).
- **Phần cứng**: ESP32-S3 giao tiếp với các cảm biến đất qua Modbus RTU/RS485.

Luồng đo cảm biến:
`USER -> Web -> Firebase -> ESP32-S3 -> Cảm biến -> ESP32-S3 -> Firebase -> Web -> M.S.AI`

## 3. Firebase Data Structure
```json
/Stations
  /{deviceId}
    /Data
      - n (number)
      - p (number)
      - k (number)
      - moisture (number)
      - soilTemp (number)
      - timestamp (number)
    /Command
      - read_soil (boolean)
      - update_wifi (boolean)
      - update_calib (boolean)
      - reboot (boolean)
      - wifi_ssid (string)
      - wifi_pass (string)
    /Calibration
      - offsetMoist (number)
      - offsetTemp (number)
      - scaleN (number)
      - scaleP (number)
      - scaleK (number)
    /Status
      - online (boolean)
      - rssi (number)
      - firmwareVersion (string)
      - sdOk (boolean)
      - lastError (string)
      - uptimeSec (number)
      - freeHeap (number)
      - pendingSyncCount (number)
      - lastSeen (number)
    /History
      /{recordId} ...
```

## 4. Firebase Rules Mẫu
Firebase Rules là thành phần bắt buộc để bảo vệ database trong production. Mẫu rules:

```json
{
  "rules": {
    "Stations": {
      ".read": "auth != null",
      ".write": "auth != null && root.child('Users').child(auth.uid).child('role').val() == 'admin'"
    }
  }
}
```

## 5. Bảng Firmware & Web Compatibility (v2.2)
| Tính năng | Firmware (v2.2) | Firebase | Web | Ghi chú |
| :--- | :--- | :--- | :--- | :--- |
| Đọc NPK + Ẩm/Nhiệt đất | Có | Có | Có | Nhớ thanh ghi NPK, xả nhiễu RS485, lọc Trung vị 3 mẫu |
| Tự động đo 30 phút & Lưu `/History` | Có | Có | Có | Đẩy thẳng `/History` + hàng đợi bù `/pending_sync.csv` |
| Đồng bộ giờ thực NTP (GMT+7) | Có | Server timestamp | Có | Ghi `YYYY-MM-DD HH:MM:SS` vào `/log_data.csv` |
| Heartbeat 45s + Chẩn đoán phần cứng | Có | Có | Có | Hiện RSSI, thẻ SD, lỗi cảm biến, Uptime, Free Heap |
| Khởi động lại từ xa (`reboot`) | Có | Có | Có | Bấm Reboot 2 bước xác nhận trong tab Cấu hình |
| Hiệu chuẩn từ xa (Calibration) | Có | Có | Có | Lưu Flash NVS `calib_cfg`, đồng bộ `/Calibration` |
| Hardware Watchdog Timer (30s) | Có | Không | Không | Tự reboot khi treo 4G/SSL (tương thích Core v2 & v3) |
| Đèn LED RGB chẩn đoán (GPIO 48) | Có | Không | Không | Xanh lá thở / Vàng đo / Xanh dương Wi-Fi / Tím AP / Đỏ lỗi |
| Lịch sử `limitToLast(200)` & Xuất CSV | Có | Có | Có | Lọc 24h / 7 ngày / 30 ngày / Tất cả, xuất Excel CSV, xóa bản ghi |
| Báo cáo PDF 12 tháng & M.S.AI nhớ ngữ cảnh | Không | Có | Có | Gom trung bình theo tháng, M.S.AI nhớ 6 lượt chat & giống cây |
| PWA cài đặt lên điện thoại | Không | Không | Có | `vite-plugin-pwa`, icon PNG chuẩn Android/iOS, hỗ trợ offline |
| OTA | Chưa có | Chưa có | Chưa triển khai | Dự kiến cho v2.3 |

## 6. Mã màu LED RGB chẩn đoán trên trạm ESP32-S3 (GPIO 48)
- **Xanh lá thở mượt**: Online, kết nối Firebase sẵn sàng.
- **Vàng nháy nhanh (150ms)**: Đang chạy chu kỳ đọc cảm biến RS485 (3 mẫu lọc trung vị).
- **Xanh dương nháy (400ms)**: Đang kết nối hoặc mất kết nối Wi-Fi/4G.
- **Tím nháy (500ms)**: Đang phát AP Mode cấu hình tại `http://192.168.4.1`.
- **Đỏ nháy nhanh (10s)**: Cảnh báo lỗi đọc cảm biến RS485, lỗi thẻ SD hoặc lỗi đẩy Firebase.

## 7. Command Table
| Web Action | Firebase Path | Value | ESP32 |
| :--- | :--- | :--- | :--- |
| Đo ngay | `/Command/read_soil` | `true` | Đo 3 lần Median -> SD -> Firebase |
| Wi-Fi SSID | `/Command/wifi_ssid` | `string` | SSID mới |
| Wi-Fi Password | `/Command/wifi_pass` | `string` | Password mới |
| Đổi Wi-Fi | `/Command/update_wifi` | `true` | Lưu Flash + restart |
| Hiệu chuẩn cảm biến | `/Command/update_calib` | `true` | Tải `/Calibration` + lưu Flash NVS |
| Khởi động lại trạm | `/Command/reboot` | `true` | Tự reset `false` + khởi động lại sau 1.5s |

## 9. Cách Chạy (Development)
1. Copy file `.env.example` thành `.env` và điền `GEMINI_API_KEY`.
2. Chạy `npm install` để tải thư viện.
3. Chạy lệnh `npm run dev` để khởi động Vite + Express middleware ở port `3000`.

## 10. Test Plan
- [x] Firebase initialization
- [x] Firebase Realtime Data
- [x] Firebase listener
- [x] ESP32 Data
- [x] read_soil command
- [x] command reset
- [x] measurement state
- [x] Wi-Fi update
- [x] restart state
- [x] Firebase disconnect
- [x] missing data
- [x] invalid data
- [x] QR
- [x] multi station
- [x] AI analysis
- [x] AI chat
- [x] Demo Mode
- [x] Mobile UI
- [x] Desktop UI
