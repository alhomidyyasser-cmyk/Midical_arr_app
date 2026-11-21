import React, { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import {
  Camera,
  CheckCircle2,
  Download,
  Printer,
  QrCode,
  ScanLine,
  X,
} from 'lucide-react';
import type {
  Courier,
  MedicalCenter,
  MovementStatus,
  SampleMovement,
} from '../types.ts';
import { formatCurrency } from '../utils/calculations.ts';

const STATUS_AR: Record<MovementStatus, string> = {
  requested: 'بانتظار الاستلام',
  picked_up: 'تم الاستلام من المركز',
  delivered_to_lab: 'وصل للمختبر المركزي',
  returned_to_center: 'مكتمل الإرجاع للمركز',
  cancelled: 'ملغي',
};

interface SampleQrLabelModalProps {
  movement: SampleMovement | null;
  center?: MedicalCenter;
  courier?: Courier;
  onClose: () => void;
}

export const SampleQrLabelModal: React.FC<SampleQrLabelModalProps> = ({
  movement,
  center,
  courier,
  onClose,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  useEffect(() => {
    if (!movement) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [movement, onClose]);

  useEffect(() => {
    if (!movement) return;
    let active = true;
    const payload = JSON.stringify({
      batchCode: movement.batchCode,
      centerId: movement.centerId,
      courierId: movement.courierId,
    });
    QRCode.toDataURL(payload, {
      width: 240,
      margin: 2,
      color: {
        dark: '#0B6E63',
        light: '#FFFFFF',
      },
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrDataUrl('');
      });
    return () => {
      active = false;
    };
  }, [movement]);

  if (!movement) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-label-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[1px] print:static print:block print:bg-white print:p-0"
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl print:max-w-none print:rounded-none print:border-none print:shadow-none">
        <div className="no-print flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <QrCode className="h-4 w-4 text-[#0B6E63]" />
            <h3 id="qr-label-title" className="font-display text-base font-bold text-slate-900">
              ملصق باركود دفعة العينات
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-900"
            aria-label="إغلاق"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="print-only-container p-6">
          <div className="rounded-xl border-2 border-dashed border-slate-300 bg-[#F8FAFC] p-5 text-center">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 text-xs">
              <span className="font-display font-bold text-[#0B6E63]">مسار العينات</span>
              <span className="font-mono-num font-bold text-slate-900">
                {movement.batchCode}
              </span>
            </div>

            <div className="my-4 flex justify-center">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt={`QR ${movement.batchCode}`}
                  className="h-44 w-44 rounded-lg border border-slate-200 bg-white p-2"
                />
              ) : (
                <div className="flex h-44 w-44 items-center justify-center rounded-lg border border-slate-200 bg-white text-xs text-slate-400">
                  جارٍ توليد الرمز...
                </div>
              )}
            </div>

            <div className="space-y-1.5 text-right text-xs border-t border-slate-200 pt-3">
              <div className="flex justify-between">
                <span className="text-slate-500">المركز الطبي:</span>
                <span className="font-bold text-slate-900">{center?.name || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">المراسل المسؤول:</span>
                <span className="font-bold text-[#0B6E63]">{courier?.name || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">عدد العينات / القيمة:</span>
                <span className="font-mono-num font-semibold text-slate-900">
                  {movement.sampleCount} عينات · {formatCurrency(movement.estimatedValue)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">الحالة الحالية:</span>
                <span className="font-semibold text-slate-800">
                  {STATUS_AR[movement.status]}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="no-print flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3.5">
          {qrDataUrl && (
            <a
              href={qrDataUrl}
              download={`${movement.batchCode}.png`}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5" />
              <span>حفظ صورة</span>
            </a>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded-lg bg-[#0B6E63] px-4 py-2 text-xs font-semibold text-white hover:bg-[#09594f] whitespace-nowrap"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>طباعة الملصق</span>
          </button>
        </div>
      </div>
    </div>
  );
};

interface QrScannerModalProps {
  open: boolean;
  movements: SampleMovement[];
  centers: MedicalCenter[];
  onClose: () => void;
  onScanCode: (code: string) => Promise<{
    alreadyCompleted?: boolean;
    message: string;
    movement: SampleMovement;
  }>;
}

export const QrScannerModal: React.FC<QrScannerModalProps> = ({
  open,
  movements,
  centers,
  onClose,
  onScanCode,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const processingRef = useRef(false);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [scanResult, setScanResult] = useState<{
    type: 'success' | 'info' | 'error';
    text: string;
    batchCode?: string;
    status?: MovementStatus;
  } | null>(null);

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  const submitScannedValue = useCallback(
    async (rawCode: string) => {
      if (!rawCode.trim() || processingRef.current) return;
      processingRef.current = true;
      setSubmitting(true);
      try {
        const res = await onScanCode(rawCode.trim());
        setScanResult({
          type: res.alreadyCompleted ? 'info' : 'success',
          text: res.message,
          batchCode: res.movement.batchCode,
          status: res.movement.status,
        });
        setManualCode('');
      } catch (err) {
        setScanResult({
          type: 'error',
          text: err instanceof Error ? err.message : 'تعذر قراءة رمز العينة',
        });
      } finally {
        setSubmitting(false);
        setTimeout(() => {
          processingRef.current = false;
        }, 1200);
      }
    },
    [onScanCode]
  );

  const startCamera = useCallback(async () => {
    setCameraError(null);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('المتصفح لا يدعم الوصول المباشر للكاميرا، استخدم الإدخال السريع أدناه.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);

      const tick = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const decoded = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: 'dontInvert',
            });
            if (decoded && decoded.data && !processingRef.current) {
              submitScannedValue(decoded.data);
            }
          }
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      setCameraError('تعذر تشغيل الكاميرا أو لم يتم منح الإذن. يمكنك إدخال رمز الدفعة يدوياً.');
      stopCamera();
    }
  }, [stopCamera, submitScannedValue]);

  useEffect(() => {
    if (!open) {
      stopCamera();
      setScanResult(null);
      setCameraError(null);
    }
    return () => {
      stopCamera();
    };
  }, [open, stopCamera]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        stopCamera();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose, stopCamera]);

  if (!open) return null;

  const activeBatches = movements
    .filter((m) => m.status !== 'returned_to_center')
    .slice(0, 5);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-scanner-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[1px]"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <ScanLine className="h-4 w-4 text-[#0B6E63]" />
            <h3 id="qr-scanner-title" className="font-display text-base font-bold text-slate-900">
              مسح باركود العينات (استلام / تسليم / إرجاع)
            </h3>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"
            aria-label="إغلاق"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-950">
            <video
              ref={videoRef}
              playsInline
              muted
              className={`h-56 w-full object-cover ${cameraActive ? 'block' : 'hidden'}`}
            />
            <canvas ref={canvasRef} className="hidden" />

            {!cameraActive && (
              <div className="flex h-56 flex-col items-center justify-center gap-3 p-4 text-center text-slate-300">
                <Camera className="h-9 w-9 text-teal-400" />
                <p className="text-xs leading-relaxed text-slate-300 max-w-xs">
                  وجّه كاميرا الهاتف أو الحاسوب نحو ملصق باركود العينة لنقلها تلقائياً للمرحلة التالية في الدورة
                </p>
                <button
                  type="button"
                  onClick={startCamera}
                  className="flex items-center gap-1.5 rounded-lg bg-[#0B6E63] px-4 py-2 text-xs font-semibold text-white hover:bg-[#09594f] whitespace-nowrap"
                >
                  <Camera className="h-3.5 w-3.5" />
                  <span>تشغيل الكاميرا للمسح</span>
                </button>
              </div>
            )}

            {cameraActive && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-36 w-36 rounded-xl border-2 border-teal-400/90 shadow-[0_0_0_9999px_rgba(2,6,23,0.38)]" />
              </div>
            )}
          </div>

          {cameraError && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
              {cameraError}
            </div>
          )}

          {scanResult && (
            <div
              className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-xs ${
                scanResult.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : scanResult.type === 'info'
                  ? 'border-blue-200 bg-blue-50 text-blue-900'
                  : 'border-red-200 bg-red-50 text-red-900'
              }`}
            >
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold">
                  {scanResult.batchCode ? `${scanResult.batchCode} · ` : ''}
                  {scanResult.status ? STATUS_AR[scanResult.status] : ''}
                </div>
                <div className="mt-0.5">{scanResult.text}</div>
              </div>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitScannedValue(manualCode);
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="أدخل رمز الدفعة أو امسح بقارئ الليزر (مثال: SMP-404)"
              className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono-num text-slate-900 focus:border-[#0B6E63] focus:outline-none"
            />
            <button
              type="submit"
              disabled={submitting || !manualCode.trim()}
              className="rounded-lg bg-[#0B6E63] px-4 py-2 text-xs font-semibold text-white hover:bg-[#09594f] disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              {submitting ? 'جارٍ التحديث...' : 'تنفيذ المسح'}
            </button>
          </form>

          {activeBatches.length > 0 && (
            <div className="border-t border-slate-100 pt-3">
              <div className="mb-2 text-[11px] font-semibold text-slate-500">
                مسح سريع لدفعات قيد الحركة:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {activeBatches.map((m) => {
                  const ctr = centers.find((c) => c.id === m.centerId);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={submitting}
                      onClick={() => submitScannedValue(m.batchCode)}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:border-[#0B6E63] hover:bg-teal-50/40 whitespace-nowrap"
                    >
                      <span className="font-mono-num font-bold text-[#0B6E63]">
                        {m.batchCode}
                      </span>{' '}
                      · {ctr?.name.replace('مركز ', '').replace('مستشفى ', '')}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
