import React, { useState } from 'react';
import {
  Activity,
  HardDrive,
  Cpu,
  Clock,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  DatabaseBackup,
} from 'lucide-react';
import { StationStatus } from '../types';
import { ChibiMarine } from './ChibiMarine';
import { formatUptime, translateHardwareError } from '../utils/stationLogic';

interface StationHealthCardProps {
  deviceId: string;
  status: StationStatus;
  onReboot: () => Promise<boolean>;
}

export const StationHealthCard: React.FC<StationHealthCardProps> = ({
  deviceId,
  status,
  onReboot,
}) => {
  const [confirmReboot, setConfirmReboot] = useState(false);
  const [isRebooting, setIsRebooting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const errInfo = translateHardwareError(status.lastError);
  const freeHeapKb =
    typeof status.freeHeap === 'number' && status.freeHeap > 0
      ? `${Math.round(status.freeHeap / 1024)} KB`
      : '--';

  const handleConfirmReboot = async () => {
    setIsRebooting(true);
    setFeedback(null);
    try {
      const ok = await onReboot();
      if (ok) {
        setFeedback({
          type: 'success',
          text: `Đã gửi lệnh khởi động lại xuống trạm ${deviceId}. Trạm sẽ tự kết nối lại sau ~15 giây.`,
        });
      } else {
        setFeedback({
          type: 'error',
          text: 'Không thể gửi lệnh khởi động lại. Vui lòng kiểm tra kết nối mạng.',
        });
      }
    } finally {
      setIsRebooting(false);
      setConfirmReboot(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-3">
        <div className="w-12 h-12 shrink-0">
          <ChibiMarine chapter="bloodAngel" bgColor="bg-red-50" borderColor="border-red-300" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-800">Chẩn đoán Phần cứng</h2>
          <p className="text-xs text-gray-500">
            Giám sát sức khỏe ESP32-S3, thẻ nhớ SD & khởi động lại từ xa ({deviceId})
          </p>
        </div>
      </div>

      <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-800 flex items-center text-sm">
            <Activity className="w-4 h-4 mr-2 text-red-500" />
            Trạng thái Thiết bị
          </h3>
          {status.firmwareVersion && (
            <span className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-100 text-[10px] font-bold text-emerald-700">
              Firmware {status.firmwareVersion}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 rounded-2xl p-3.5 border border-gray-100">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase mb-1">
              <HardDrive className="w-3.5 h-3.5" />
              <span>Thẻ nhớ Micro SD</span>
            </div>
            <div
              className={`text-sm font-bold ${
                status.sdOk === false
                  ? 'text-red-600'
                  : status.sdOk === true
                  ? 'text-emerald-700'
                  : 'text-gray-500'
              }`}
            >
              {status.sdOk === true ? 'Hoạt động tốt' : status.sdOk === false ? 'Lỗi / Chưa gắn' : '--'}
            </div>
          </div>

          <div className="bg-gray-50 rounded-2xl p-3.5 border border-gray-100">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase mb-1">
              <DatabaseBackup className="w-3.5 h-3.5" />
              <span>Hàng đợi đồng bộ SD</span>
            </div>
            <div className="text-sm font-bold text-gray-800">
              {typeof status.pendingSyncCount === 'number'
                ? `${status.pendingSyncCount} bản ghi`
                : '0 bản ghi'}
            </div>
          </div>

          <div className="bg-gray-50 rounded-2xl p-3.5 border border-gray-100">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase mb-1">
              <Clock className="w-3.5 h-3.5" />
              <span>Thời gian chạy liên tục</span>
            </div>
            <div className="text-sm font-bold text-gray-800">{formatUptime(status.uptimeSec)}</div>
          </div>

          <div className="bg-gray-50 rounded-2xl p-3.5 border border-gray-100">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase mb-1">
              <Cpu className="w-3.5 h-3.5" />
              <span>RAM trống (Heap)</span>
            </div>
            <div className="text-sm font-bold text-gray-800">{freeHeapKb}</div>
          </div>
        </div>

        <div
          className={`p-3.5 rounded-2xl border text-xs font-semibold flex items-center gap-2 ${
            errInfo.isError
              ? 'bg-red-50 border-red-200 text-red-700'
              : 'bg-emerald-50 border-emerald-100 text-emerald-700'
          }`}
        >
          {errInfo.isError ? (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          )}
          <span>Cảm biến & Kết nối: {errInfo.label}</span>
        </div>

        <div className="pt-2 border-t border-gray-100">
          {!confirmReboot ? (
            <button
              type="button"
              onClick={() => {
                setFeedback(null);
                setConfirmReboot(true);
              }}
              className="w-full py-3 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Khởi động lại ESP32-S3 từ xa</span>
            </button>
          ) : (
            <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 space-y-3">
              <p className="text-xs font-semibold text-red-700">
                Xác nhận khởi động lại trạm <strong>{deviceId}</strong>? Thiết bị sẽ tạm ngắt khoảng 15 giây.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmReboot(false)}
                  disabled={isRebooting}
                  className="py-2.5 rounded-xl bg-white border border-gray-200 text-gray-700 font-bold text-xs hover:bg-gray-50"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReboot}
                  disabled={isRebooting}
                  className="py-2.5 rounded-xl bg-red-600 text-white font-bold text-xs hover:bg-red-700 disabled:opacity-50"
                >
                  {isRebooting ? 'ĐANG GỬI...' : 'XÁC NHẬN REBOOT'}
                </button>
              </div>
            </div>
          )}

          {feedback && (
            <div
              className={`mt-3 p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-red-50 text-red-600 border border-red-200'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <span>{feedback.text}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
