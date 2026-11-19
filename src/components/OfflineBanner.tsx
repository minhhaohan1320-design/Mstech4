import React from 'react';
import { WifiOff, AlertTriangle, X } from 'lucide-react';
import { useOnlineStatus } from '../hooks/usePWAInstall';

interface OfflineBannerProps {
  firebaseError?: string | null;
  onDismissError?: () => void;
}

export const OfflineBanner: React.FC<OfflineBannerProps> = ({
  firebaseError,
  onDismissError,
}) => {
  const browserOnline = useOnlineStatus();

  if (browserOnline && !firebaseError) return null;

  return (
    <div className="space-y-2 mb-4">
      {!browserOnline && (
        <div
          role="status"
          className="flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold shadow-xs"
        >
          <WifiOff className="w-4 h-4 shrink-0 text-amber-600" />
          <span>
            Thiết bị đang mất kết nối mạng. Ứng dụng đang hiển thị dữ liệu đã lưu tạm (Chế độ Offline).
          </span>
        </div>
      )}
      {firebaseError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2.5 px-4 py-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold shadow-xs"
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
            <span className="break-words">{firebaseError}</span>
          </div>
          {onDismissError && (
            <button
              type="button"
              onClick={onDismissError}
              aria-label="Đóng thông báo lỗi"
              className="p-1 rounded-lg hover:bg-red-100 text-red-500 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};
