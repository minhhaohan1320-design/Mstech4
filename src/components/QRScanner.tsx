import React, { useState } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { X, Image as ImageIcon } from 'lucide-react';
import jsQR from 'jsqr';
import { parseStationId } from '../utils/stationLogic';

interface QRScannerProps {
  onScanSuccess: (deviceId: string) => void;
  onClose: () => void;
}

/**
 * Giải mã QR từ file ảnh (hỗ trợ tự động thu phóng ảnh độ phân giải lớn từ điện thoại)
 */
export function decodeQrFromImageFile(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    reader.onload = (event) => {
      const img = new Image();
      img.onerror = () => resolve(null);
      img.onload = () => {
        const tryDecodeAtScale = (maxDim: number): string | null => {
          const canvas = document.createElement('canvas');
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            const ratio = Math.min(maxDim / width, maxDim / height);
            width = Math.max(1, Math.round(width * ratio));
            height = Math.max(1, Math.round(height * ratio));
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return null;
          ctx.drawImage(img, 0, 0, width, height);
          const imageData = ctx.getImageData(0, 0, width, height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          return code?.data ? parseStationId(code.data) : null;
        };

        const found = tryDecodeAtScale(1024) || tryDecodeAtScale(2048);
        resolve(found);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export const QRScanner: React.FC<QRScannerProps> = ({ onScanSuccess, onClose }) => {
  const [error, setError] = useState<string | null>(null);

  const handleScan = (text?: string) => {
    if (!text) return;
    const parsedId = parseStationId(text);
    if (parsedId) {
      onScanSuccess(parsedId);
    } else {
      setError('Mã QR không hợp lệ. Vui lòng thử lại.');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const parsedId = await decodeQrFromImageFile(file);
    if (parsedId) {
      onScanSuccess(parsedId);
    } else {
      setError('Không tìm thấy mã QR hợp lệ trong ảnh. Vui lòng thử ảnh khác.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-[2rem] w-full max-w-md overflow-hidden flex flex-col shadow-2xl relative">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-gray-800">Quét mã QR</h2>
          <button
            type="button"
            aria-label="Đóng cửa sổ quét QR"
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="relative bg-black w-full aspect-square flex items-center justify-center overflow-hidden">
          <Scanner
            onScan={(result) => {
              if (result && result.length > 0 && result[0]?.rawValue) {
                handleScan(result[0].rawValue);
              }
            }}
            onError={(err) => console.warn('QR Scanner warning:', err)}
            components={{
              onOff: true,
              torch: true,
              zoom: false,
              finder: true,
            }}
          />
        </div>

        {error && (
          <div className="p-3 m-4 mb-0 bg-red-50 text-red-600 text-sm font-medium rounded-xl text-center">
            {error}
          </div>
        )}

        <div className="p-6">
          <div className="relative">
            <input
              type="file"
              accept="image/*"
              aria-label="Chọn file ảnh mã QR"
              onChange={handleFileUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <button
              type="button"
              className="w-full flex items-center justify-center space-x-2 bg-gray-50 text-gray-700 font-bold py-4 rounded-2xl border border-gray-200 hover:bg-gray-100 transition-colors"
            >
              <ImageIcon className="w-5 h-5 text-emerald-600" />
              <span>Tải ảnh QR từ thư viện</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
