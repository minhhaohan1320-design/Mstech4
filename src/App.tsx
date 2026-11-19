import React, { useState, useEffect, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { BottomNavigation } from './components/BottomNavigation';
import { Dashboard } from './components/Dashboard';
import { HistoryChart } from './components/HistoryChart';
import { AIAnalysis } from './components/AIAnalysis';
import { AIChat } from './components/AIChat';
import { WifiConfig } from './components/WifiConfig';
import { CalibrationConfig } from './components/CalibrationConfig';
import { StationHealthCard } from './components/StationHealthCard';
import { OfflineBanner } from './components/OfflineBanner';
import { PWAInstallButton } from './components/PWAInstallButton';
import { QRCodeDisplay } from './components/QRCodeDisplay';
import { QRScanner, decodeQrFromImageFile } from './components/QRScanner';
import { useStation } from './hooks/useStation';
import { parseStationId } from './utils/stationLogic';
import { QrCode, Image as ImageIcon } from 'lucide-react';

const SESSION_DEVICE_KEY = 'mstech_active_device_id';
const SESSION_DEMO_KEY = 'mstech_active_demo';

export default function App() {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [activeTab, setActiveTab] = useState('home');
  const [isScanning, setIsScanning] = useState(false);
  const [stationInput, setStationInput] = useState('');
  const [qrUploadError, setQrUploadError] = useState<string | null>(null);
  const [zoneContext, setZoneContext] = useState<{ cropName: string; location: string }>({
    cropName: 'Vải thiều',
    location: 'Bắc Giang',
  });
  const qrFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1' || params.get('demo') === '1') {
        setIsDemo(true);
        return;
      }

      const pathParts = window.location.pathname.split('/');
      const stationIndex = pathParts.indexOf('station');
      if (stationIndex !== -1 && pathParts.length > stationIndex + 1) {
        const parsed = parseStationId(pathParts[stationIndex + 1]);
        if (parsed) {
          setDeviceId(parsed);
          return;
        }
      }

      try {
        const savedDevice = sessionStorage.getItem(SESSION_DEVICE_KEY);
        const savedDemo = sessionStorage.getItem(SESSION_DEMO_KEY);
        if (savedDevice) {
          setDeviceId(savedDevice);
        } else if (savedDemo === '1') {
          setIsDemo(true);
        }
      } catch {
        // Bỏ qua nếu trình duyệt chặn sessionStorage
      }
    }
  }, []);

  const handleSelectDevice = (id: string) => {
    const clean = parseStationId(id);
    if (!clean) return;
    setDeviceId(clean);
    setIsDemo(false);
    setQrUploadError(null);
    try {
      sessionStorage.setItem(SESSION_DEVICE_KEY, clean);
      sessionStorage.removeItem(SESSION_DEMO_KEY);
    } catch {
      // ignore
    }
  };

  const handleSelectDemo = () => {
    setIsDemo(true);
    setDeviceId(null);
    setQrUploadError(null);
    try {
      sessionStorage.setItem(SESSION_DEMO_KEY, '1');
      sessionStorage.removeItem(SESSION_DEVICE_KEY);
    } catch {
      // ignore
    }
  };

  const handleSwitchStation = () => {
    setDeviceId(null);
    setIsDemo(false);
    setActiveTab('home');
    setQrUploadError(null);
    try {
      sessionStorage.removeItem(SESSION_DEVICE_KEY);
      sessionStorage.removeItem(SESSION_DEMO_KEY);
    } catch {
      // ignore
    }
  };

  const handleDirectQrImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setQrUploadError(null);
    const decoded = await decodeQrFromImageFile(file);
    if (decoded) {
      handleSelectDevice(decoded);
    } else {
      setQrUploadError('Không tìm thấy mã QR trạm hợp lệ trong ảnh đã chọn.');
    }
    e.target.value = '';
  };

  const {
    sensorData,
    commandState,
    status,
    calibration,
    error,
    clearError,
    isOnline,
    lastUpdated,
    historyData,
    sendMeasureCommand,
    saveToHistory,
    deleteHistoryRecord,
    updateWifi,
    updateCalibration,
    rebootStation,
  } = useStation(deviceId, isDemo);

  if (!deviceId && !isDemo) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col p-4 font-sans">
        <div className="flex-1 flex flex-col max-w-md w-full mx-auto justify-center space-y-8">
          <div className="text-center mb-2">
            <h1 className="text-4xl font-bold text-gray-900 flex items-center justify-center space-x-3">
              <span className="bg-emerald-600 text-white px-3 py-1 rounded-2xl text-2xl shadow-sm">
                MS
              </span>
              <span>M.S.Tech</span>
            </h1>
            <p className="text-[11px] font-bold tracking-[0.25em] text-gray-500 mt-4 uppercase">
              SMART AGRICULTURE
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => {
                setQrUploadError(null);
                setIsScanning(true);
              }}
              className="flex flex-col items-center justify-center bg-white border border-emerald-100 text-emerald-700 rounded-3xl p-6 shadow-sm hover:bg-emerald-50 transition-all hover:scale-[1.02]"
            >
              <div className="bg-emerald-100 p-3 rounded-2xl mb-3">
                <QrCode className="w-7 h-7 text-emerald-600" />
              </div>
              <span className="text-sm font-bold">Quét QR</span>
            </button>
            <button
              type="button"
              onClick={() => qrFileInputRef.current?.click()}
              className="flex flex-col items-center justify-center bg-white border border-emerald-100 text-emerald-700 rounded-3xl p-6 shadow-sm hover:bg-emerald-50 transition-all hover:scale-[1.02]"
            >
              <div className="bg-emerald-100 p-3 rounded-2xl mb-3">
                <ImageIcon className="w-7 h-7 text-emerald-600" />
              </div>
              <span className="text-sm font-bold text-center leading-tight">
                Tải ảnh QR
                <br />
                từ thư viện
              </span>
            </button>
            <input
              ref={qrFileInputRef}
              type="file"
              accept="image/*"
              aria-label="Tải ảnh QR từ thư viện"
              onChange={handleDirectQrImageUpload}
              className="sr-only"
            />
          </div>

          {qrUploadError && (
            <div className="p-3 bg-red-50 border border-red-100 text-red-600 text-xs font-semibold rounded-2xl text-center">
              {qrUploadError}
            </div>
          )}

          {isScanning && (
            <QRScanner
              onScanSuccess={(id) => {
                handleSelectDevice(id);
                setIsScanning(false);
              }}
              onClose={() => setIsScanning(false)}
            />
          )}

          <div className="flex items-center text-sm text-gray-400">
            <div className="flex-1 border-t border-gray-200"></div>
            <span className="px-4 font-medium">Hoặc nhập thủ công</span>
            <div className="flex-1 border-t border-gray-200"></div>
          </div>

          <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSelectDevice(stationInput);
              }}
            >
              <div className="mb-6 text-left">
                <label
                  htmlFor="stationIdInput"
                  className="block text-sm font-bold text-gray-700 mb-3 ml-1"
                >
                  Mã Trạm (Thiết bị ESP32)
                </label>
                <input
                  id="stationIdInput"
                  name="stationId"
                  type="text"
                  value={stationInput}
                  onChange={(e) => setStationInput(e.target.value)}
                  placeholder="Ví dụ: TRAM_BG_01"
                  className="w-full px-5 py-4 rounded-2xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-gray-800 font-medium placeholder:text-gray-400 uppercase"
                  required
                />
              </div>
              <button
                type="submit"
                className="w-full bg-emerald-600 text-white font-bold py-4 rounded-2xl hover:bg-emerald-700 transition-colors mb-3 shadow-md shadow-emerald-200"
              >
                Kết nối
              </button>
              <button
                type="button"
                onClick={handleSelectDemo}
                className="w-full bg-gray-50 text-gray-500 font-bold py-4 rounded-2xl border border-gray-200 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              >
                Xem bản Demo
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  const currentStationId = isDemo ? 'DEMO_STATION' : deviceId || 'TRAM_BG_01';

  return (
    <div className="flex min-h-screen bg-gray-50 font-sans">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        deviceId={currentStationId}
        isOnline={isOnline}
        rssi={status?.rssi}
        firmwareVersion={status?.firmwareVersion}
        className="hidden md:flex"
      />

      <div className="flex-1 pb-20 md:pb-0 relative flex flex-col w-full min-w-0">
        <header className="bg-white px-4 py-3.5 shadow-sm border-b border-gray-100 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center space-x-2">
            <span className="bg-emerald-600 text-white px-2 py-0.5 rounded-lg text-sm font-bold shadow-sm">
              MS
            </span>
            <span className="text-lg font-bold text-gray-900">M.S.Tech</span>
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-0.5 rounded-full">
              {currentStationId}
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <PWAInstallButton />
            {(deviceId || isDemo) && (
              <button
                type="button"
                onClick={handleSwitchStation}
                className="text-[11px] font-bold text-gray-600 bg-gray-100 px-3 py-2 rounded-xl hover:bg-gray-200 tracking-wider transition-colors"
              >
                ĐỔI TRẠM
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 p-3 md:p-6 max-w-4xl mx-auto w-full">
          <OfflineBanner firebaseError={error} onDismissError={clearError} />

          {activeTab === 'home' && (
            <Dashboard
              deviceId={currentStationId}
              data={sensorData}
              isOnline={isOnline}
              rssi={status?.rssi}
              firmwareVersion={status?.firmwareVersion}
              lastUpdated={lastUpdated}
              isDemo={isDemo}
              commandState={commandState}
              onMeasure={sendMeasureCommand}
              onSaveHistory={saveToHistory}
              onNavigateToAI={() => setActiveTab('ai')}
              historyData={historyData}
              onZoneContextChange={setZoneContext}
            />
          )}

          {activeTab === 'history' && (
            <div className="mt-4">
              <HistoryChart
                historyData={historyData}
                deviceId={currentStationId}
                onDeleteRecord={deleteHistoryRecord}
              />
            </div>
          )}

          {activeTab === 'ai' && (
            <div className="space-y-6 mt-4">
              <AIAnalysis
                data={sensorData}
                defaultCrop={zoneContext.cropName}
                defaultLocation={zoneContext.location}
              />
              <AIChat
                data={sensorData}
                cropType={zoneContext.cropName}
                location={zoneContext.location}
              />
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="max-w-md mx-auto space-y-6 mt-4 pb-8">
              <WifiConfig deviceId={currentStationId} onUpdateWifi={updateWifi} />
              <CalibrationConfig
                deviceId={currentStationId}
                calibration={calibration}
                onUpdateCalibration={updateCalibration}
              />
              <StationHealthCard
                deviceId={currentStationId}
                status={status}
                onReboot={rebootStation}
              />
            </div>
          )}

          {activeTab === 'stationInfo' && (
            <div className="max-w-md mx-auto space-y-6 mt-4">
              <QRCodeDisplay deviceId={currentStationId} />
            </div>
          )}
        </main>

        <BottomNavigation
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          className="md:hidden fixed bottom-0 left-0 right-0 z-40"
        />
      </div>
    </div>
  );
}
