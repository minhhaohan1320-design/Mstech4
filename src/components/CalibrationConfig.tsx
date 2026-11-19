import React, { useState, useEffect } from 'react';
import { Sliders, RotateCcw, CheckCircle2, AlertCircle } from 'lucide-react';
import { ChibiMarine } from './ChibiMarine';
import { CalibrationConfig as CalibrationData } from '../types';
import { DEFAULT_CALIBRATION, sanitizeCalibration } from '../utils/stationLogic';

interface CalibrationConfigProps {
  deviceId: string;
  calibration: CalibrationData;
  onUpdateCalibration: (config: CalibrationData) => Promise<boolean>;
}

export const CalibrationConfig: React.FC<CalibrationConfigProps> = ({
  deviceId,
  calibration,
  onUpdateCalibration,
}) => {
  const [form, setForm] = useState<CalibrationData>(calibration);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    setForm(calibration);
  }, [calibration]);

  const handleFieldChange = (field: keyof CalibrationData, rawVal: string) => {
    const parsed = parseFloat(rawVal);
    setForm((prev) => ({
      ...prev,
      [field]: Number.isFinite(parsed) ? parsed : 0,
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setStatusMessage(null);
    const cleaned = sanitizeCalibration(form);
    try {
      const ok = await onUpdateCalibration(cleaned);
      if (ok) {
        setForm(cleaned);
        setStatusMessage({
          type: 'success',
          text: `Đã đồng bộ hệ số hiệu chuẩn xuống trạm ${deviceId}. Thông số sẽ áp dụng ngay từ lần đo kế tiếp.`,
        });
      } else {
        setStatusMessage({
          type: 'error',
          text: 'Không thể lưu cấu hình hiệu chuẩn. Vui lòng thử lại.',
        });
      }
    } catch {
      setStatusMessage({
        type: 'error',
        text: 'Lỗi kết nối khi gửi lệnh hiệu chuẩn cảm biến.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    setIsSaving(true);
    setStatusMessage(null);
    try {
      const ok = await onUpdateCalibration(DEFAULT_CALIBRATION);
      if (ok) {
        setForm(DEFAULT_CALIBRATION);
        setStatusMessage({
          type: 'success',
          text: 'Đã khôi phục toàn bộ hệ số hiệu chuẩn về mặc định (0 / 1.0).',
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-3">
        <div className="w-12 h-12 shrink-0">
          <ChibiMarine
            chapter="ultramarine"
            bgColor="bg-blue-50"
            borderColor="border-blue-300"
          />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-800">Hiệu chuẩn Cảm biến</h2>
          <p className="text-xs text-gray-500">
            Bù trừ sai số RS485 lưu trực tiếp vào Flash ESP32-S3 ({deviceId})
          </p>
        </div>
      </div>

      <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
        <h3 className="font-bold text-gray-800 flex items-center mb-2">
          <Sliders className="w-5 h-5 mr-2 text-blue-600" />
          Hệ số Bù trừ (Calibration)
        </h3>
        <p className="text-xs text-gray-500 mb-5 leading-relaxed">
          Tinh chỉnh khi độ ẩm/nhiệt độ hoặc NPK của đầu đo RS485 có độ lệch nhẹ so với mẫu đối chứng đất đồi thực tế.
        </p>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="calibOffsetMoist"
                className="block text-xs font-bold text-gray-700 mb-1.5"
              >
                Bù Độ ẩm đất (%)
              </label>
              <input
                id="calibOffsetMoist"
                type="number"
                step="0.5"
                min="-30"
                max="30"
                value={form.offsetMoist}
                onChange={(e) => handleFieldChange('offsetMoist', e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none font-semibold text-gray-800"
              />
              <span className="text-[10px] text-gray-400">Giới hạn: -30% đến +30%</span>
            </div>

            <div>
              <label
                htmlFor="calibOffsetTemp"
                className="block text-xs font-bold text-gray-700 mb-1.5"
              >
                Bù Nhiệt độ đất (°C)
              </label>
              <input
                id="calibOffsetTemp"
                type="number"
                step="0.1"
                min="-15"
                max="15"
                value={form.offsetTemp}
                onChange={(e) => handleFieldChange('offsetTemp', e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none font-semibold text-gray-800"
              />
              <span className="text-[10px] text-gray-400">Giới hạn: -15°C đến +15°C</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label
                htmlFor="calibScaleN"
                className="block text-xs font-bold text-blue-700 mb-1.5"
              >
                Hệ số N
              </label>
              <input
                id="calibScaleN"
                type="number"
                step="0.05"
                min="0.5"
                max="2.0"
                value={form.scaleN}
                onChange={(e) => handleFieldChange('scaleN', e.target.value)}
                className="w-full px-3 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none font-semibold text-gray-800"
              />
            </div>

            <div>
              <label
                htmlFor="calibScaleP"
                className="block text-xs font-bold text-orange-600 mb-1.5"
              >
                Hệ số P
              </label>
              <input
                id="calibScaleP"
                type="number"
                step="0.05"
                min="0.5"
                max="2.0"
                value={form.scaleP}
                onChange={(e) => handleFieldChange('scaleP', e.target.value)}
                className="w-full px-3 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none font-semibold text-gray-800"
              />
            </div>

            <div>
              <label
                htmlFor="calibScaleK"
                className="block text-xs font-bold text-purple-600 mb-1.5"
              >
                Hệ số K
              </label>
              <input
                id="calibScaleK"
                type="number"
                step="0.05"
                min="0.5"
                max="2.0"
                value={form.scaleK}
                onChange={(e) => handleFieldChange('scaleK', e.target.value)}
                className="w-full px-3 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none font-semibold text-gray-800"
              />
            </div>
          </div>
          <p className="text-[10px] text-gray-400">
            Hệ số nhân NPK nằm trong khoảng 0.50 – 2.00 (mặc định 1.00 = giữ nguyên giá trị đo gốc).
          </p>

          <div className="flex flex-col space-y-2.5 pt-1">
            <button
              type="submit"
              disabled={isSaving}
              className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors text-xs uppercase tracking-wider"
            >
              {isSaving ? 'ĐANG ĐỒNG BỘ HIỆU CHUẨN...' : 'LƯU HIỆU CHUẨN XUỐNG TRẠM'}
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={isSaving}
              className="w-full bg-gray-50 text-gray-600 font-bold py-3 rounded-xl border border-gray-200 hover:bg-gray-100 disabled:opacity-50 transition-colors flex items-center justify-center space-x-1.5 text-xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Đặt về mặc định (0 / 1.0)</span>
            </button>
          </div>

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
    </div>
  );
};
