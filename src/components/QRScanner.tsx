import React, { useState } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { X, Image as ImageIcon } from 'lucide-react';
import jsQR from 'jsqr';

interface QRScannerProps {
  onScanSuccess: (deviceId: string) => void;
  onClose: () => void;
}

export const QRScanner: React.FC<QRScannerProps> = ({ onScanSuccess, onClose }) => {
  const [error, setError] = useState<string | null>(null);

  const handleScan = (text: string) => {
    if (text) {
      onScanSuccess(text.trim());
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        
        if (code && code.data) {
          onScanSuccess(code.data.trim());
        } else {
          setError('Không tìm thấy mã QR trong ảnh. Vui lòng thử ảnh khác.');
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-[2rem] w-full max-w-md overflow-hidden flex flex-col shadow-2xl relative">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-gray-800">Quét mã QR</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="relative bg-black w-full aspect-square flex items-center justify-center overflow-hidden">
          <Scanner 
            onScan={(result) => handleScan(result[0].rawValue)} 
            onError={(err) => console.error(err)}
            components={{
              audio: false,
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
              onChange={handleFileUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <button className="w-full flex items-center justify-center space-x-2 bg-gray-50 text-gray-700 font-bold py-4 rounded-2xl border border-gray-200 hover:bg-gray-100 transition-colors">
              <ImageIcon className="w-5 h-5 text-emerald-600" />
              <span>Tải ảnh QR từ thư viện</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
