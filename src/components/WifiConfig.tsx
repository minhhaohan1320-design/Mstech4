import React, { useState } from 'react';
import { Wifi, Info, Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react';
import { ChibiMarine } from './ChibiMarine';

interface WifiConfigProps {
  deviceId: string;
  onUpdateWifi: (ssid: string, pass: string) => Promise<boolean> | void;
}

export const WifiConfig: React.FC<WifiConfigProps> = ({ deviceId, onUpdateWifi }) => {
  const [ssid, setSsid] = useState('');
  const [pass, setPass] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ssid.trim()) return;

    setIsUpdating(true);
    setStatusMessage(null);
    try {
      await onUpdateWifi(ssid.trim(), pass);
      setStatusMessage({
        type: 'success',
        text: `Đã gửi cấu hình Wi-Fi "${ssid.trim()}" tới trạm ${deviceId}. Đang chờ trạm khởi động lại...`,
      });
      setSsid('');
      setPass('');
    } catch {
      setStatusMessage({
        type: 'error',
        text: 'Lỗi khi gửi lệnh cập nhật Wi-Fi. Vui lòng thử lại.',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-3 mb-4">
        <div className="w-12 h-12 shrink-0">
          <ChibiMarine chapter="ironHand" bgColor="bg-gray-100" borderColor="border-gray-300" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-800">Cấu hình Trạm</h2>
          <p className="text-xs text-gray-500">Cài đặt kết nối Wi-Fi cho thiết bị ({deviceId})</p>
        </div>
      </div>

      <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
        <h3 className="font-bold text-gray-800 flex items-center mb-4">
          <Wifi className="w-5 h-5 mr-2 text-emerald-600" />
          Đổi mạng Wi-Fi
        </h3>
        <form onSubmit={handleUpdate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tên Wi-Fi mới (SSID)</label>
            <input
              type="text"
              value={ssid}
              onChange={(e) => setSsid(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none"
              placeholder="VD: Home_Network"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mật khẩu Wi-Fi</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                className="w-full px-4 py-3 pr-12 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                placeholder="Nhập mật khẩu"
              />
              <button
                type="button"
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={!ssid.trim() || isUpdating}
            className="w-full bg-emerald-600 text-white font-bold py-3 rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {isUpdating ? 'ĐANG GỬI CẤU HÌNH...' : 'LƯU & KẾT NỐI'}
          </button>

          {statusMessage && (
            <div
              className={`p-3.5 rounded-xl text-xs font-semibold flex items-center space-x-2 ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-red-50 text-red-600 border border-red-200'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}
        </form>
      </div>

      <div className="bg-amber-50 rounded-3xl p-6 shadow-sm border border-amber-100">
        <h3 className="font-bold text-amber-800 flex items-center mb-2">
          <Info className="w-5 h-5 mr-2" />
          CẤU HÌNH KHI MẤT WIFI
        </h3>
        <p className="text-sm text-amber-700 mb-4">
          Nếu trạm không kết nối được Wi-Fi, hãy kết nối điện thoại với mạng do trạm phát ra.
        </p>

        {showGuide ? (
          <div className="bg-white p-4 rounded-xl text-sm text-gray-700 space-y-2 border border-amber-200">
            <p>
              <strong>SSID:</strong> MSTech_Config
            </p>
            <p>
              <strong>Password:</strong> 12345678
            </p>
            <p className="mt-2 text-xs italic text-gray-500">
              Lưu ý: Khi kết nối vào mạng AP của ESP32-S3, truy cập 192.168.4.1 để cấu hình lại thông tin mạng.
            </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowGuide(true)}
            className="text-sm font-bold text-amber-600 hover:text-amber-800"
          >
            Hiển thị Hướng dẫn cấu hình
          </button>
        )}
      </div>
    </div>
  );
};
