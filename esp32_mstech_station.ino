// ============================================================================
// TRẠM QUAN TRẮC NÔNG NGHIỆP TỰ ĐỘNG M.S.TECH - BẮC GIANG
// Vi điều khiển: ESP32-S3 (Board trong Arduino IDE: "ESP32S3 Dev Module")
// Phiên bản Firmware: v2.1 Production (5 Chỉ số Đất: N, P, K, Độ ẩm, Nhiệt độ)
//
// NÂNG CẤP TRONG PHIÊN BẢN v2.1:
// 1. Heartbeat định kỳ mỗi 45 giây cập nhật /Status (online, rssi, lastSeen, firmwareVersion)
// 2. Đồng bộ giờ thực Việt Nam (GMT+7) qua NTP để ghi chuẩn YYYY-MM-DD HH:MM:SS vào thẻ SD
// 3. Tự động kích hoạt đo 3 lần thực tế mỗi 30 phút (lưu SD + đẩy Firebase)
// 4. Hardware Task Watchdog Timer (30s) tự khởi động lại nếu treo mạng 4G/SSL
// 5. Đèn LED RGB (GPIO 48) báo trạng thái hoạt động trực quan (non-blocking millis)
// 6. Hệ số bù trừ hiệu chuẩn cảm biến (Calibration) lưu Flash NVS & đồng bộ từ Web
//
// THƯ VIỆN CẦN CÀI ĐẶT TRONG ARDUINO IDE (Library Manager):
// 1. Firebase Arduino Client Library for ESP8266 and ESP32 (by Mobizt)
// 2. ModbusMaster (by Doc Walker)
// 3. Adafruit NeoPixel (by Adafruit)
// ============================================================================

#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <Preferences.h>
#include <Firebase_ESP_Client.h>
#include <SPI.h>
#include <SD.h>
#include <Adafruit_NeoPixel.h>
#include <ModbusMaster.h>
#include <time.h>
#include <esp_task_wdt.h>
#include <esp_idf_version.h>

// ==============================================================
// 1. CẤU HÌNH PHẦN CỨNG (Sơ đồ chân ESP32-S3)
// ==============================================================
#define SD_CS_PIN       10
#define SPI_SCK         12
#define SPI_MISO        13
#define SPI_MOSI        11

#define RS485_RX_PIN    18
#define RS485_TX_PIN    17
#define RS485_DE_RE_PIN 16 // Chân điều khiển hướng RS485 MAX485 (Mạch tự động đảo chiều thì bỏ trống)

#define RGB_LED_PIN     48
#define NUM_LEDS        1

#define WDT_TIMEOUT_SEC 30 // Tự khởi động lại nếu CPU/mạng treo quá 30 giây

// ==============================================================
// 2. CẤU HÌNH FIREBASE REALTIME DATABASE & MÃ TRẠM
// ==============================================================
#define API_KEY         "AIzaSyBqrME9oNfnBVHwL8ypJTtiTIPwe-NDyOM"
#define DATABASE_URL    "https://gen-lang-client-0249965989-default-rtdb.asia-southeast1.firebasedatabase.app"
#define DATABASE_SECRET "kxDR4vOgOeeGIWwLpoDUl6HXYkWJ3UwylatOdPe"

// Liên kết Firebase thứ 2 (Dự phòng - mở comment nếu đổi sang project mstech-48e0d):
// #define API_KEY         "AIzaSyA8xgz1Ay6JNu27uLP2lHOGzMq4S8-46NQ"
// #define DATABASE_URL    "https://mstech-48e0d-default-rtdb.firebaseio.com"
// #define DATABASE_SECRET ""

const char* FIRMWARE_VER    = "v2.1";
const char* DEVICE_ID       = "TRAM_BG_01";
const char* DEFAULT_SSID    = "4G-UFI-8152";
const char* DEFAULT_PASS    = "1234567890";
const char* AP_CONFIG_SSID  = "MSTech_Config";
const char* AP_CONFIG_PASS  = "12345678";

// Máy chủ thời gian NTP múi giờ Việt Nam (GMT+7 = 25200 giây)
const long  GMT_OFFSET_SEC      = 7 * 3600;
const int   DAYLIGHT_OFFSET_SEC = 0;
const char* NTP_SERVER_1        = "pool.ntp.org";
const char* NTP_SERVER_2        = "time.google.com";
const char* NTP_SERVER_3        = "time.nist.gov";

FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

// ==============================================================
// 3. BIẾN TOÀN CỤC, CALIBRATION & MÁY TRẠNG THÁI (NON-BLOCKING MILLIS)
// ==============================================================
Preferences preferences;
WebServer apServer(80); // Web Server cấu hình Wi-Fi nội bộ tại http://192.168.4.1
SPIClass spiSD(HSPI);
File dataFile;
const char* LOG_FILE_NAME = "/log_data.csv";
Adafruit_NeoPixel rgbLed(NUM_LEDS, RGB_LED_PIN, NEO_GRB + NEO_KHZ800);

HardwareSerial RS485Serial(1);
ModbusMaster nodeNPK;  // Cảm biến NPK đất (Modbus Slave ID = 1)
ModbusMaster nodeSoil; // Cảm biến Độ ẩm & Nhiệt độ đất (Modbus Slave ID = 2)

// Bộ định thời bằng millis() (Tuyệt đối không dùng delay() gây treo hệ thống)
unsigned long lastFirebaseCheck = 0;
unsigned long lastHeartbeat     = 0;
unsigned long lastAutoMeasure   = 0;
unsigned long previousLedMillis = 0;
unsigned long lastWifiRetry     = 0;
unsigned long errorLedStart     = 0;

const unsigned long CHECK_INTERVAL        = 2000;    // Kiểm tra lệnh từ Web mỗi 2 giây
const unsigned long HEARTBEAT_INTERVAL    = 45000;   // Gửi nhịp Heartbeat mỗi 45 giây (Web timeout 120s)
const unsigned long AUTO_MEASURE_INTERVAL = 1800000; // Tự động đo cảm biến thực tế mỗi 30 phút
const unsigned long LED_TICK_INTERVAL     = 25;      // Chu kỳ cập nhật đèn LED trạng thái (25ms)
const unsigned long WIFI_RETRY_INTERVAL   = 60000;   // Thử kết nối lại Wi-Fi mỗi 60 giây khi mất mạng
const unsigned long SAMPLE_INTERVAL       = 500;     // Khoảng cách giữa 3 lần lấy mẫu (500ms)
const unsigned long RS485_GUARD_TIME_MS   = 60;      // Thời gian xả bus RS485 giữa 2 cảm biến (60ms)
const unsigned long ERROR_LED_DURATION_MS = 10000;   // Báo đèn đỏ trong 10 giây khi phát hiện lỗi đọc

bool isAPMode          = false;
bool sdReady           = false;
bool firebaseBootReady = false;
bool initialSyncDone   = false;
bool errorLedActive    = false;

// Hệ số bù trừ hiệu chuẩn cảm biến (Lưu bền vững trong Flash NVS & đồng bộ từ Web)
float calibOffsetMoist = 0.0f; // Bù trừ độ ẩm đất (%), giới hạn [-30.0, +30.0]
float calibOffsetTemp  = 0.0f; // Bù trừ nhiệt độ đất (°C), giới hạn [-15.0, +15.0]
float calibScaleN      = 1.0f; // Hệ số nhân Nitơ (N), giới hạn [0.5, 2.0]
float calibScaleP      = 1.0f; // Hệ số nhân Phốt pho (P), giới hạn [0.5, 2.0]
float calibScaleK      = 1.0f; // Hệ số nhân Kali (K), giới hạn [0.5, 2.0]

// Máy trạng thái (State Machine) đọc cảm biến 3 lần không dùng delay()
enum SensorReadStep {
  STEP_IDLE = 0,
  STEP_WAIT_NEXT_SAMPLE,
  STEP_READ_SOIL,
  STEP_WAIT_RS485_BUS,
  STEP_READ_NPK
};

SensorReadStep sensorStep = STEP_IDLE;
int readCount             = 0;
int validSoilCount        = 0;
int validNpkCount         = 0;
unsigned long stepTimer   = 0;

// Biến cộng dồn và giá trị trung bình của 5 chỉ số đất
long sumN = 0, sumP = 0, sumK = 0;
float sumMoist = 0.0f, sumSoilTemp = 0.0f;

int currentN = 0, currentP = 0, currentK = 0;
float currentMoist = 0.0f, currentSoilTemp = 0.0f;

// Biến trạng thái hiệu ứng đèn LED chuẩn đoán
int ledBreathVal      = 10;
int ledBreathDir      = 4;
bool ledBlinkState    = false;
unsigned long lastBlinkToggle = 0;

// Cờ hẹn giờ khởi động lại không dùng delay()
bool pendingRestart              = false;
unsigned long restartScheduledAt = 0;

// Khai báo trước (Forward declarations) & hàm tiện ích an toàn (không bị tính lại 2 lần như macro)
void publishStatusHeartbeat();
void fetchCalibrationFromFirebase();

inline float clampFloat(float val, float lo, float hi) {
  if (isnan(val)) return lo;
  if (val < lo) return lo;
  if (val > hi) return hi;
  return val;
}

inline void triggerErrorLed() {
  errorLedActive = true;
  errorLedStart  = millis();
}

// ==============================================================
// 4. WATCHDOG TIMER & CALLBACK RS485
// ==============================================================
void initWatchdog() {
  // Tương thích cả 2 phiên bản gói Board ESP32 trên Arduino IDE (Core v2.x & Core v3.x / IDF 5)
#if ESP_IDF_VERSION_MAJOR >= 5
  esp_task_wdt_config_t wdtConfig = {
    .timeout_ms = WDT_TIMEOUT_SEC * 1000,
    .idle_core_mask = 0,
    .trigger_panic = true
  };
  if (esp_task_wdt_reconfigure(&wdtConfig) != ESP_OK) {
    esp_task_wdt_init(&wdtConfig);
  }
  if (esp_task_wdt_status(NULL) != ESP_OK) {
    esp_task_wdt_add(NULL);
  }
#else
  esp_task_wdt_init(WDT_TIMEOUT_SEC, true);
  esp_task_wdt_add(NULL);
#endif
  Serial.printf("[v] Da kich hoat Hardware Watchdog Timer (%ds).\n", WDT_TIMEOUT_SEC);
}

void preTransmission() {
  digitalWrite(RS485_DE_RE_PIN, HIGH);
}

void postTransmission() {
  // Đợi khung truyền UART đẩy hết bit cuối cùng ra khỏi phần cứng trước khi hạ DE/RE xuống LOW
  RS485Serial.flush();
  digitalWrite(RS485_DE_RE_PIN, LOW);
}

// ==============================================================
// 5. ĐỒNG BỘ GIỜ THỰC NTP (GMT+7) & BỘ NHỚ HIỆU CHUẨN (NVS)
// ==============================================================
void initNtpTime() {
  configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET_SEC, NTP_SERVER_1, NTP_SERVER_2, NTP_SERVER_3);
  Serial.println(">> Da gui yeu cau dong bo gio thuc Viet Nam (NTP GMT+7).");
}

String getFormattedTimestamp() {
  struct tm timeinfo;
  // Thời gian chờ tối đa 10ms để không làm chặn CPU
  if (getLocalTime(&timeinfo, 10)) {
    char buf[24];
    strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M:%S", &timeinfo);
    return String(buf);
  }
  // Fallback nếu thiết bị mất mạng từ lúc khởi động chưa đồng bộ được NTP
  return "Uptime_" + String(millis() / 1000) + "s";
}

void loadCalibrationFromFlash() {
  preferences.begin("calib_cfg", true);
  calibOffsetMoist = clampFloat(preferences.getFloat("offMoist", 0.0f), -30.0f, 30.0f);
  calibOffsetTemp  = clampFloat(preferences.getFloat("offTemp", 0.0f), -15.0f, 15.0f);
  calibScaleN      = clampFloat(preferences.getFloat("scaleN", 1.0f), 0.5f, 2.0f);
  calibScaleP      = clampFloat(preferences.getFloat("scaleP", 1.0f), 0.5f, 2.0f);
  calibScaleK      = clampFloat(preferences.getFloat("scaleK", 1.0f), 0.5f, 2.0f);
  preferences.end();

  Serial.printf("[v] He so hieu chuan (Flash): Moist%+.1f%% | Temp%+.1fC | Scale NPK: %.2f/%.2f/%.2f\n",
                calibOffsetMoist, calibOffsetTemp, calibScaleN, calibScaleP, calibScaleK);
}

void saveCalibrationToFlash() {
  preferences.begin("calib_cfg", false);
  preferences.putFloat("offMoist", calibOffsetMoist);
  preferences.putFloat("offTemp", calibOffsetTemp);
  preferences.putFloat("scaleN", calibScaleN);
  preferences.putFloat("scaleP", calibScaleP);
  preferences.putFloat("scaleK", calibScaleK);
  preferences.end();
}

void fetchCalibrationFromFirebase() {
  if (WiFi.status() != WL_CONNECTED || !Firebase.ready()) return;

  String calibPath = String("/Stations/") + DEVICE_ID + "/Calibration";
  if (Firebase.RTDB.getJSON(&fbdo, calibPath.c_str()) && fbdo.dataType() == "json") {
    FirebaseJson& json = fbdo.jsonObject();
    FirebaseJsonData val;
    bool updated = false;

    if (json.get(val, "offsetMoist") && val.success) {
      calibOffsetMoist = clampFloat(val.to<float>(), -30.0f, 30.0f);
      updated = true;
    }
    if (json.get(val, "offsetTemp") && val.success) {
      calibOffsetTemp = clampFloat(val.to<float>(), -15.0f, 15.0f);
      updated = true;
    }
    if (json.get(val, "scaleN") && val.success) {
      calibScaleN = clampFloat(val.to<float>(), 0.5f, 2.0f);
      updated = true;
    }
    if (json.get(val, "scaleP") && val.success) {
      calibScaleP = clampFloat(val.to<float>(), 0.5f, 2.0f);
      updated = true;
    }
    if (json.get(val, "scaleK") && val.success) {
      calibScaleK = clampFloat(val.to<float>(), 0.5f, 2.0f);
      updated = true;
    }

    if (updated) {
      saveCalibrationToFlash();
      Serial.printf("[v] Da dong bo hieu chuan tu Web: Moist%+.1f%% | Temp%+.1fC | Scale NPK: %.2f/%.2f/%.2f\n",
                    calibOffsetMoist, calibOffsetTemp, calibScaleN, calibScaleP, calibScaleK);
    }
  }
}

// ==============================================================
// 6. QUẢN LÝ WI-FI THÔNG MINH & CỔNG WEB CẤU HÌNH AP (192.168.4.1)
// ==============================================================
void setupAPWebServer() {
  apServer.on("/", HTTP_GET, []() {
    String html = "<!DOCTYPE html><html><head><meta charset='utf-8'>"
                  "<meta name='viewport' content='width=device-width,initial-scale=1'>"
                  "<title>M.S.Tech WiFi Config</title>"
                  "<style>body{font-family:sans-serif;padding:24px;max-width:400px;margin:auto;background:#f9fafb;}"
                  ".card{background:#fff;padding:20px;border-radius:16px;box-shadow:0 2px 8px rgba(0,0,0,0.08);}"
                  "input,button{width:100%;padding:12px;margin-top:10px;border-radius:10px;border:1px solid #d1d5db;box-sizing:border-box;}"
                  "button{background:#059669;color:#fff;font-weight:bold;border:none;cursor:pointer;}</style></head>"
                  "<body><div class='card'><h2>Cấu hình Wi-Fi Trạm " + String(DEVICE_ID) + "</h2>"
                  "<form method='POST' action='/save'>"
                  "<label>Tên Wi-Fi (SSID):</label><input name='ssid' required placeholder='Nhập tên Wi-Fi'>"
                  "<label style='display:block;margin-top:10px;'>Mật khẩu:</label><input name='pass' type='password' placeholder='Nhập mật khẩu'>"
                  "<button type='submit'>Lưu & Khởi động lại</button></form></div></body></html>";
    apServer.send(200, "text/html", html);
  });

  apServer.on("/save", HTTP_POST, []() {
    String newSsid = apServer.arg("ssid");
    String newPass = apServer.arg("pass");
    newSsid.trim();
    if (newSsid.length() > 0) {
      preferences.begin("wifi_config", false);
      preferences.putString("ssid", newSsid);
      preferences.putString("pass", newPass);
      preferences.end();

      apServer.send(200, "text/html",
                    "<meta charset='utf-8'><h3>Đã lưu Wi-Fi mới! Trạm đang khởi động lại...</h3>");
      pendingRestart     = true;
      restartScheduledAt = millis();
    } else {
      apServer.send(400, "text/plain", "SSID khong hop le");
    }
  });

  apServer.begin();
  Serial.println("[v] Da bat WebServer cau hinh tai http://192.168.4.1");
}

void initWiFi() {
  preferences.begin("wifi_config", true);
  String ssid = preferences.getString("ssid", "");
  String pass = preferences.getString("pass", "");
  preferences.end();

  if (ssid.length() == 0) {
    ssid = DEFAULT_SSID;
    pass = DEFAULT_PASS;
    Serial.println(">> Su dung WiFi mac dinh: " + ssid);
  } else {
    Serial.println(">> Su dung WiFi da luu trong Flash: " + ssid);
  }

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid.c_str(), pass.c_str());
  Serial.print("Dang ket noi WiFi: " + ssid);

  // Chờ kết nối tối đa 20 giây bằng millis() kết hợp nháy đèn Xanh dương và reset Watchdog
  unsigned long startAttempt = millis();
  unsigned long lastDot      = 0;
  bool blueOn                = false;
  while (WiFi.status() != WL_CONNECTED && (millis() - startAttempt < 20000)) {
    if (millis() - lastDot >= 300) {
      lastDot = millis();
      Serial.print(".");
      blueOn = !blueOn;
      rgbLed.setPixelColor(0, blueOn ? rgbLed.Color(0, 120, 255) : rgbLed.Color(0, 0, 0));
      rgbLed.show();
    }
    esp_task_wdt_reset();
    yield();
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("\n[!] Khong tim thay mang WiFi. Chuyen sang AP + STA Mode...");
    WiFi.mode(WIFI_AP_STA);
    WiFi.softAP(AP_CONFIG_SSID, AP_CONFIG_PASS);
    Serial.print("IP Cau hinh AP: ");
    Serial.println(WiFi.softAPIP());
    isAPMode = true;
    setupAPWebServer();
  } else {
    Serial.println("\n[v] WiFi KET NOI THANH CONG. IP: " + WiFi.localIP().toString());
    Serial.printf("[v] Cuong do song WiFi (RSSI): %d dBm\n", WiFi.RSSI());
    isAPMode = false;
    initNtpTime();
  }
}

void initFirebaseConnection() {
  if (firebaseBootReady) return;
  config.api_key = API_KEY;
  config.database_url = DATABASE_URL;

  if (strlen(DATABASE_SECRET) > 0) {
    config.signer.tokens.legacy_token = DATABASE_SECRET;
    Serial.println(">> Khoi tao Firebase voi Database Secret...");
  } else {
    Serial.println(">> Dang dang nhap Firebase Anonymous bang API_KEY...");
    if (Firebase.signUp(&config, &auth, "", "")) {
      Serial.println("[v] Dang nhap Firebase Anonymous thanh cong!");
    } else {
      Serial.printf("[!] Loi dang nhap Firebase: %s\n", config.signer.signupError.message.c_str());
    }
  }

  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);
  firebaseBootReady = true;
  Serial.println("[v] Da khoi tao ket noi Firebase RTDB: " + String(DATABASE_URL));
}

// ==============================================================
// 7. QUẢN LÝ LƯU & ĐỌC THẺ NHỚ MICRO SD (5 chỉ số đất chuẩn)
// ==============================================================
void initSDCard() {
  Serial.println(">> Dang kiem tra the Micro SD...");
  spiSD.begin(SPI_SCK, SPI_MISO, SPI_MOSI, SD_CS_PIN);
  if (!SD.begin(SD_CS_PIN, spiSD)) {
    Serial.println("[!] Khong thay the Micro SD (Bo qua luu/doc the SD).");
    sdReady = false;
    return;
  }
  sdReady = true;
  if (!SD.exists(LOG_FILE_NAME)) {
    Serial.println(">> Tao file log_data.csv moi tren SD.");
    dataFile = SD.open(LOG_FILE_NAME, FILE_WRITE);
    if (dataFile) {
      dataFile.println("timestamp,n,p,k,moisture,soilTemp");
      dataFile.close();
    }
  }
  Serial.println("[v] Khoi tao the SD thanh cong.");
}

void logDataToSD(const String& timestamp) {
  if (!sdReady) return;
  dataFile = SD.open(LOG_FILE_NAME, FILE_APPEND);
  if (dataFile) {
    String logLine = timestamp + "," +
                     String(currentN) + "," +
                     String(currentP) + "," +
                     String(currentK) + "," +
                     String(currentMoist, 1) + "," +
                     String(currentSoilTemp, 1);
    dataFile.println(logLine);
    dataFile.close();
    Serial.println("[v] Da LUU vao the nho SD: " + logLine);
  } else {
    Serial.println("[!] Loi mo file log_data.csv de ghi!");
  }
}

String readLastRecordFromSD() {
  if (!sdReady) return "";
  File readFile = SD.open(LOG_FILE_NAME, FILE_READ);
  if (!readFile) {
    Serial.println("[!] Loi mo file log_data.csv de doc!");
    return "";
  }

  size_t fileSize = readFile.size();
  if (fileSize > 256) {
    readFile.seek(fileSize - 256);
  }

  String lastLine = "";
  while (readFile.available()) {
    String line = readFile.readStringUntil('\n');
    line.trim();
    if (line.length() > 0 && !line.startsWith("timestamp")) {
      lastLine = line;
    }
  }
  readFile.close();

  if (lastLine.length() > 0) {
    Serial.println("[v] Da DOC tu the nho SD (Ban ghi moi nhat): " + lastLine);
  }
  return lastLine;
}

// ==============================================================
// 8. HEARTBEAT TRẠNG THÁI & MÁY TRẠNG THÁI ĐỌC CẢM BIẾN 3 LẦN
// ==============================================================
void publishStatusHeartbeat() {
  if (WiFi.status() != WL_CONNECTED || !Firebase.ready()) return;

  String statusPath = String("/Stations/") + DEVICE_ID + "/Status";
  FirebaseJson statusNode;
  statusNode.set("online", true);
  statusNode.set("rssi", WiFi.RSSI());
  statusNode.set("firmwareVersion", FIRMWARE_VER);
  statusNode.set("lastSeen/.sv", "timestamp");

  if (Firebase.RTDB.setJSON(&fbdo, statusPath.c_str(), &statusNode)) {
    Serial.printf("[♥] Heartbeat OK | RSSI: %d dBm | FW: %s\n", WiFi.RSSI(), FIRMWARE_VER);
  } else {
    Serial.println("[!] Loi gui Heartbeat: " + fbdo.errorReason());
    triggerErrorLed();
  }
}

void startSensorReadingCycle() {
  readCount      = 0;
  validSoilCount = 0;
  validNpkCount  = 0;
  sumN = 0; sumP = 0; sumK = 0;
  sumMoist = 0.0f; sumSoilTemp = 0.0f;

  sensorStep = STEP_READ_SOIL;
  stepTimer  = millis();
  Serial.println("\n[!] BAT DAU CHU KY DOC CAM BIEN DAT 3 LAN...");
}

void publishSensorDataToFirebase() {
  if (WiFi.status() != WL_CONNECTED || !Firebase.ready()) return;

  // 1. Đẩy 5 thông số đất đã tinh chỉnh vào /Stations/<DEVICE_ID>/Data
  String dataPath = String("/Stations/") + DEVICE_ID + "/Data";
  FirebaseJson dataNode;
  dataNode.set("n", currentN);
  dataNode.set("p", currentP);
  dataNode.set("k", currentK);
  dataNode.set("moisture", currentMoist);
  dataNode.set("soilTemp", currentSoilTemp);
  dataNode.set("timestamp/.sv", "timestamp");

  if (Firebase.RTDB.setJSON(&fbdo, dataPath.c_str(), &dataNode)) {
    Serial.println("[v] Da day ket qua trung binh len Firebase (/Data)!");
  } else {
    Serial.println("[!] Loi day /Data len Firebase: " + fbdo.errorReason());
    triggerErrorLed();
  }

  // 2. Đồng bộ luôn trạng thái Online & RSSI sau khi đo
  publishStatusHeartbeat();
  lastHeartbeat = millis();
}

void processSensorReading() {
  if (sensorStep == STEP_IDLE) return;

  unsigned long now = millis();

  switch (sensorStep) {
    case STEP_WAIT_NEXT_SAMPLE:
      if (now - stepTimer >= SAMPLE_INTERVAL) {
        sensorStep = STEP_READ_SOIL;
      }
      break;

    case STEP_READ_SOIL: {
      readCount++;
      Serial.printf("\n--- DANG DOC LAN THU %d/3 ---\n", readCount);

      // Đọc Cảm biến Đất (RS485 Slave ID = 2): 0x0000 (Độ ẩm), 0x0001 (Nhiệt độ đất)
      uint8_t resSoil = nodeSoil.readHoldingRegisters(0x0000, 2);
      if (resSoil == nodeSoil.ku8MBSuccess) {
        float moist = nodeSoil.getResponseBuffer(0) / 10.0f;
        int16_t rawTemp = (int16_t)nodeSoil.getResponseBuffer(1);
        float sTemp = rawTemp / 10.0f;

        sumMoist    += moist;
        sumSoilTemp += sTemp;
        validSoilCount++;
      } else {
        Serial.printf("[!] LOI DOC CAM BIEN DAT (ID 2). Ma loi: 0x%02X\n", resSoil);
      }

      stepTimer  = millis();
      sensorStep = STEP_WAIT_RS485_BUS;
      break;
    }

    case STEP_WAIT_RS485_BUS:
      if (now - stepTimer >= RS485_GUARD_TIME_MS) {
        sensorStep = STEP_READ_NPK;
      }
      break;

    case STEP_READ_NPK: {
      // Đọc Cảm biến NPK (RS485 Slave ID = 1): Ưu tiên 0x001E (JXCT), fallback về 0x0000
      uint8_t resNPK = nodeNPK.readHoldingRegisters(0x001E, 3);
      if (resNPK != nodeNPK.ku8MBSuccess) {
        resNPK = nodeNPK.readHoldingRegisters(0x0000, 3);
      }

      if (resNPK == nodeNPK.ku8MBSuccess) {
        sumN += nodeNPK.getResponseBuffer(0);
        sumP += nodeNPK.getResponseBuffer(1);
        sumK += nodeNPK.getResponseBuffer(2);
        validNpkCount++;
      } else {
        Serial.printf("[!] LOI DOC CAM BIEN NPK (ID 1). Ma loi: 0x%02X\n", resNPK);
      }

      // Sau đủ 3 lần lấy mẫu: Tính trung bình + Bù trừ Calibration -> Lưu SD -> Đọc SD -> Đẩy Firebase
      if (readCount >= 3) {
        if (validSoilCount > 0) {
          float avgMoist = (sumMoist / validSoilCount) + calibOffsetMoist;
          float avgTemp  = (sumSoilTemp / validSoilCount) + calibOffsetTemp;
          currentMoist    = clampFloat(roundf(avgMoist * 10.0f) / 10.0f, 0.0f, 100.0f);
          currentSoilTemp = roundf(avgTemp * 10.0f) / 10.0f;
        }
        if (validNpkCount > 0) {
          int calcN = (int)lroundf(((float)sumN / validNpkCount) * calibScaleN);
          int calcP = (int)lroundf(((float)sumP / validNpkCount) * calibScaleP);
          int calcK = (int)lroundf(((float)sumK / validNpkCount) * calibScaleK);
          currentN = (calcN > 0) ? calcN : 0;
          currentP = (calcP > 0) ? calcP : 0;
          currentK = (calcK > 0) ? calcK : 0;
        }

        // Nếu cả 3 lần đều không đọc được một trong hai cảm biến RS485 -> Nháy LED đỏ cảnh báo
        if (validSoilCount == 0 || validNpkCount == 0) {
          triggerErrorLed();
        }

        String tsNow = getFormattedTimestamp();
        Serial.println("\n[v] 1. HOAN THANH 3 LAN DOC (" + tsNow + "):");
        Serial.printf("Dat: %.1f%% - %.1fC (Hop le: %d/3) | NPK: %d/%d/%d mg/kg (Hop le: %d/3)\n",
                      currentMoist, currentSoilTemp, validSoilCount,
                      currentN, currentP, currentK, validNpkCount);

        // 2. Lưu kết quả (kèm giờ thực NTP GMT+7) vào thẻ nhớ Micro SD
        logDataToSD(tsNow);

        // 3. Đọc đối chiếu lại bản ghi mới nhất từ thẻ nhớ Micro SD
        readLastRecordFromSD();

        // 4. Cuối cùng: Gửi thông tin đo về Firebase Realtime Database
        publishSensorDataToFirebase();

        sensorStep = STEP_IDLE;
      } else {
        stepTimer  = millis();
        sensorStep = STEP_WAIT_NEXT_SAMPLE;
      }
      break;
    }

    default:
      sensorStep = STEP_IDLE;
      break;
  }
}

// ==============================================================
// 9. NHẬN LỆNH TỪ WEB QUA FIREBASE & ĐÈN LED CHẨN ĐOÁN TRẠNG THÁI
// ==============================================================
void handleFirebaseCommands() {
  if (WiFi.status() != WL_CONNECTED || !Firebase.ready()) return;
  if (sensorStep != STEP_IDLE) return;

  // Đồng bộ Heartbeat và hệ số Calibration ngay lần đầu kết nối Firebase thành công
  if (!initialSyncDone) {
    initialSyncDone = true;
    fetchCalibrationFromFirebase();
    publishStatusHeartbeat();
    lastHeartbeat = millis();
  }

  unsigned long now = millis();

  // Gửi Heartbeat định kỳ mỗi 45 giây để Web luôn nhận diện chính xác trạng thái ONLINE + RSSI
  if (now - lastHeartbeat >= HEARTBEAT_INTERVAL) {
    lastHeartbeat = now;
    publishStatusHeartbeat();
  }

  // Kiểm tra gói lệnh /Command mỗi 2 giây
  if (now - lastFirebaseCheck >= CHECK_INTERVAL) {
    lastFirebaseCheck = now;

    String cmdPath = String("/Stations/") + DEVICE_ID + "/Command";
    if (Firebase.RTDB.getJSON(&fbdo, cmdPath.c_str()) && fbdo.dataType() == "json") {
      FirebaseJsonData jsonData;
      FirebaseJson& json = fbdo.jsonObject();

      // 1. Lệnh đo đất từ Web (read_soil)
      json.get(jsonData, "read_soil");
      if (jsonData.success && jsonData.boolValue == true) {
        Firebase.RTDB.setBool(&fbdo, (cmdPath + "/read_soil").c_str(), false);
        startSensorReadingCycle();
        return;
      }

      // 2. Lệnh cập nhật hệ số hiệu chuẩn cảm biến từ Web (update_calib)
      json.get(jsonData, "update_calib");
      if (jsonData.success && jsonData.boolValue == true) {
        Firebase.RTDB.setBool(&fbdo, (cmdPath + "/update_calib").c_str(), false);
        fetchCalibrationFromFirebase();
      }

      // 3. Lệnh đổi mạng Wi-Fi từ Web (update_wifi)
      json.get(jsonData, "update_wifi");
      if (jsonData.success && jsonData.boolValue == true) {
        String newSsid = "";
        String newPass = "";

        json.get(jsonData, "wifi_ssid");
        if (jsonData.success) newSsid = jsonData.stringValue;

        json.get(jsonData, "wifi_pass");
        if (jsonData.success) newPass = jsonData.stringValue;

        newSsid.trim();
        if (newSsid.length() > 0) {
          preferences.begin("wifi_config", false);
          preferences.putString("ssid", newSsid);
          preferences.putString("pass", newPass);
          preferences.end();

          Serial.println("\n[!] DA LUU WIFI MOI VAO FLASH: " + newSsid);
          Firebase.RTDB.setBool(&fbdo, (cmdPath + "/update_wifi").c_str(), false);

          pendingRestart     = true;
          restartScheduledAt = millis();
        }
      }
    }
  }
}

void processStatusLed() {
  unsigned long now = millis();
  if (now - previousLedMillis < LED_TICK_INTERVAL) return;
  previousLedMillis = now;

  // Ưu tiên 1: Cảnh báo lỗi đọc cảm biến hoặc lỗi Firebase -> Đỏ nháy nhanh (200ms)
  if (errorLedActive) {
    if (now - errorLedStart >= ERROR_LED_DURATION_MS) {
      errorLedActive = false;
    } else {
      if (now - lastBlinkToggle >= 200) {
        lastBlinkToggle = now;
        ledBlinkState = !ledBlinkState;
        rgbLed.setPixelColor(0, ledBlinkState ? rgbLed.Color(255, 0, 0) : rgbLed.Color(0, 0, 0));
        rgbLed.show();
      }
      return;
    }
  }

  // Ưu tiên 2: Đang trong chu kỳ đo cảm biến RS485 -> Vàng nháy nhanh (150ms)
  if (sensorStep != STEP_IDLE) {
    if (now - lastBlinkToggle >= 150) {
      lastBlinkToggle = now;
      ledBlinkState = !ledBlinkState;
      rgbLed.setPixelColor(0, ledBlinkState ? rgbLed.Color(255, 180, 0) : rgbLed.Color(0, 0, 0));
      rgbLed.show();
    }
    return;
  }

  // Ưu tiên 3: Chế độ phát Wi-Fi cấu hình AP Mode (192.168.4.1) -> Tím nháy (500ms)
  if (isAPMode) {
    if (now - lastBlinkToggle >= 500) {
      lastBlinkToggle = now;
      ledBlinkState = !ledBlinkState;
      rgbLed.setPixelColor(0, ledBlinkState ? rgbLed.Color(180, 0, 255) : rgbLed.Color(0, 0, 0));
      rgbLed.show();
    }
    return;
  }

  // Ưu tiên 4: Mất kết nối Wi-Fi giữa chừng -> Xanh dương nháy (400ms)
  if (WiFi.status() != WL_CONNECTED) {
    if (now - lastBlinkToggle >= 400) {
      lastBlinkToggle = now;
      ledBlinkState = !ledBlinkState;
      rgbLed.setPixelColor(0, ledBlinkState ? rgbLed.Color(0, 120, 255) : rgbLed.Color(0, 0, 0));
      rgbLed.show();
    }
    return;
  }

  // Trạng thái chuẩn: Online & sẵn sàng -> Xanh lá thở mượt (Breathing Green)
  ledBreathVal += ledBreathDir;
  if (ledBreathVal >= 180) {
    ledBreathVal = 180;
    ledBreathDir = -4;
  } else if (ledBreathVal <= 15) {
    ledBreathVal = 15;
    ledBreathDir = 4;
  }
  rgbLed.setPixelColor(0, rgbLed.Color(0, ledBreathVal, 40));
  rgbLed.show();
}

// ==============================================================
// 10. SETUP & LOOP CHÍNH
// ==============================================================
void setup() {
  rgbLed.begin();
  rgbLed.setBrightness(60);
  rgbLed.setPixelColor(0, rgbLed.Color(0, 120, 255)); // Xanh dương báo bắt đầu khởi động
  rgbLed.show();

  Serial.begin(115200);

  unsigned long serialWait = millis();
  while (millis() - serialWait < 1500) {
    yield();
  }

  Serial.println("\n\n==============================================");
  Serial.println("  TRAM QUAN TRAC M.S.TECH (ESP32-S3) v2.1");
  Serial.println("==============================================");

  initWatchdog();
  loadCalibrationFromFlash();

  pinMode(RS485_DE_RE_PIN, OUTPUT);
  digitalWrite(RS485_DE_RE_PIN, LOW);

  RS485Serial.begin(4800, SERIAL_8N1, RS485_RX_PIN, RS485_TX_PIN);

  nodeNPK.begin(1, RS485Serial);
  nodeNPK.preTransmission(preTransmission);
  nodeNPK.postTransmission(postTransmission);

  nodeSoil.begin(2, RS485Serial);
  nodeSoil.preTransmission(preTransmission);
  nodeSoil.postTransmission(postTransmission);

  initSDCard();
  initWiFi();

  if (WiFi.status() == WL_CONNECTED) {
    initFirebaseConnection();
  }
}

void loop() {
  // 1. Nạp lại bộ đếm Watchdog mỗi vòng lặp (Nếu treo mạng >30s mạch sẽ tự khởi động lại)
  esp_task_wdt_reset();

  // 2. Khởi động lại có hẹn giờ bằng millis() sau khi lưu Wi-Fi mới
  if (pendingRestart && (millis() - restartScheduledAt >= 1500)) {
    Serial.println("[!] Dang khoi dong lai ESP32-S3...");
    ESP.restart();
  }

  // 3. Phục vụ WebServer cấu hình nội bộ (192.168.4.1) & tự kết nối lại Wi-Fi nếu đang ở AP Mode
  if (isAPMode) {
    apServer.handleClient();
    if (WiFi.status() == WL_CONNECTED) {
      Serial.println("\n[v] Da ket noi lai Wi-Fi thanh cong! Tat AP Mode...");
      apServer.stop();
      WiFi.softAPdisconnect(true);
      WiFi.mode(WIFI_STA);
      isAPMode = false;
      initNtpTime();
      initFirebaseConnection();
    } else if (millis() - lastWifiRetry >= WIFI_RETRY_INTERVAL) {
      lastWifiRetry = millis();
      Serial.println("[~] Dang thu ket noi lai Wi-Fi da luu...");
      WiFi.reconnect();
    }
  } else if (WiFi.status() != WL_CONNECTED) {
    // Nếu đang chạy bình thường mà mất sóng 4G giữa chừng -> Thử kết nối lại mỗi 60s
    if (millis() - lastWifiRetry >= WIFI_RETRY_INTERVAL) {
      lastWifiRetry = millis();
      Serial.println("[~] Mat song Wi-Fi giua chung. Dang thu ket noi lai...");
      WiFi.reconnect();
    }
  }

  // 4. Thực thi máy trạng thái đọc cảm biến, nhận lệnh Firebase, Heartbeat và LED trạng thái
  processSensorReading();
  handleFirebaseCommands();
  processStatusLed();

  // 5. Chu kỳ tự động đo thực tế mỗi 30 phút (Đo 3 lần -> Lưu SD kèm giờ thực NTP -> Đọc SD -> Đẩy Firebase)
  if (sensorStep == STEP_IDLE && (millis() - lastAutoMeasure >= AUTO_MEASURE_INTERVAL)) {
    lastAutoMeasure = millis();
    Serial.println("\n[⏰] Kich hoat chu ky tu dong do cam bien dinh ky 30 phut...");
    startSensorReadingCycle();
  }
}
