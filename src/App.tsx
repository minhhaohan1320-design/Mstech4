import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { BottomNavigation } from './components/BottomNavigation';
import { Dashboard } from './components/Dashboard';
import { HistoryChart } from './components/HistoryChart';
import { AIAnalysis } from './components/AIAnalysis';
import { AIChat } from './components/AIChat';
import { WifiConfig } from './components/WifiConfig';
import { QRCodeDisplay } from './components/QRCodeDisplay';
import { QRScanner } from './components/QRScanner';
import { useStation } from './hooks/useStation';
import { parseStationId } from './utils/stationLogic';
import { QrCode, Image as ImageIcon } from 'lucide-react';

export default function App() {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [activeTab, setActiveTab] = useState('home');
  const [isScanning, setIsScanning] = useState(false);
  const [stationInput, setStationInput] = useState('');

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
        }
      }
    }
  }, []);

  const {
    sensorData,
    commandState,
    isOnline,
    lastUpdated,
    historyData,
    sendMeasureCommand,
    saveToHistory,
    updateWifi,
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
              onClick={() => setIsScanning(true)}
              className="flex flex-col items-center justify-center bg-white border border-emerald-100 text-emerald-700 rounded-3xl p-6 shadow-sm hover:bg-emerald-50 transition-all hover:scale-[1.02]"
            >
              <div className="bg-emerald-100 p-3 rounded-2xl mb-3">
                <QrCode className="w-7 h-7 text-emerald-600" />
              </div>
              <span className="text-sm font-bold">Quét QR</span>
            </button>
            <button
              type="button"
              onClick={() => setIsScanning(true)}
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
          </div>

          {isScanning && (
            <QRScanner
              onScanSuccess={(id) => {
                const clean = parseStationId(id);
                if (clean) {
                  setDeviceId(clean);
                  setIsScanning(false);
                }
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
                const clean = parseStationId(stationInput);
                if (clean) {
                  setDeviceId(clean);
                }
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
                onClick={() => setIsDemo(true)}
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

  return (
    <div className="flex min-h-screen bg-gray-50 font-sans">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        deviceId={isDemo ? 'DEMO_STATION' : deviceId}
        isOnline={isOnline}
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
              {isDemo ? 'DEMO_STATION' : deviceId}
            </span>
          </div>
          {(deviceId || isDemo) && (
            <button
              type="button"
              onClick={() => {
                setDeviceId(null);
                setIsDemo(false);
                setActiveTab('home');
              }}
              className="text-[11px] font-bold text-gray-600 bg-gray-100 px-3 py-2 rounded-xl hover:bg-gray-200 tracking-wider transition-colors"
            >
              ĐỔI TRẠM
            </button>
          )}
        </header>

        <main className="flex-1 p-3 md:p-6 max-w-4xl mx-auto w-full">
          {activeTab === 'home' && (
            <Dashboard
              deviceId={deviceId || 'DEMO_STATION'}
              data={sensorData}
              isOnline={isOnline}
              lastUpdated={lastUpdated}
              isDemo={isDemo}
              commandState={commandState}
              onMeasure={sendMeasureCommand}
              onSaveHistory={saveToHistory}
              onNavigateToAI={() => setActiveTab('ai')}
              historyData={historyData}
            />
          )}

          {activeTab === 'history' && (
            <div className="mt-4">
              <HistoryChart historyData={historyData} />
            </div>
          )}

          {activeTab === 'ai' && (
            <div className="space-y-6 mt-4">
              <AIAnalysis data={sensorData} />
              <AIChat data={sensorData} />
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="max-w-md mx-auto space-y-6 mt-4">
              <WifiConfig deviceId={deviceId || 'DEMO_STATION'} onUpdateWifi={updateWifi} />
            </div>
          )}

          {activeTab === 'stationInfo' && (
            <div className="max-w-md mx-auto space-y-6 mt-4">
              <QRCodeDisplay deviceId={deviceId || 'DEMO_STATION'} />
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
