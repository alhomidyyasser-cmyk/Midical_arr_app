import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  Camera,
  CheckCircle2,
  FileCheck2,
  Loader2,
  Paperclip,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import type { Courier, MedicalCenter, SampleMovement, VoucherType } from '../types.ts';
import { formatCurrency } from '../utils/calculations.ts';

interface QuickVoucherFormProps {
  couriers: Courier[];
  centers: MedicalCenter[];
  movements: SampleMovement[];
  lockedCourierId?: string;
  enteredBy: 'courier' | 'admin' | 'supervisor';
  onSubmit: (payload: {
    courierId: string;
    centerId: string;
    sampleMovementId?: string;
    type: VoucherType;
    amount: number;
    voucherNumber?: string;
    date: string;
    enteredBy: 'courier' | 'admin' | 'supervisor';
    notes?: string;
    attachmentName?: string;
    aiExtracted?: boolean;
  }) => Promise<void>;
  onSuccess?: () => void;
}

interface AiScanResult {
  amount: number;
  voucherNumber: string;
  detectedType: 'cash' | 'deferred' | 'guarantee' | 'unknown';
  typeReason: string;
  centerNameGuess: string;
  matchedCenterId: string;
  date?: string;
  notes: string;
  confidence: number;
}

const labelClass = 'mb-1.5 block text-xs font-semibold text-slate-600';
const hintClass = 'text-[11px] font-normal leading-relaxed text-slate-400';
const fieldClass =
  'w-full rounded-xl border border-slate-200/90 bg-white px-3.5 py-2.5 text-sm leading-normal text-slate-800 placeholder:text-slate-400 transition-colors focus:border-[#0B6E63] focus:outline-none focus:ring-2 focus:ring-[#0B6E63]/10';

export const QuickVoucherForm: React.FC<QuickVoucherFormProps> = ({
  couriers,
  centers,
  movements,
  lockedCourierId,
  enteredBy,
  onSubmit,
  onSuccess,
}) => {
  const [courierId, setCourierId] = useState<string>(
    lockedCourierId || couriers[0]?.id || ''
  );

  const availableCenters = useMemo(() => {
    const selectedCourier = couriers.find((c) => c.id === courierId);
    if (lockedCourierId && selectedCourier) {
      return centers.filter((ctr) => selectedCourier.assignedCenterIds.includes(ctr.id));
    }
    return centers;
  }, [centers, couriers, courierId, lockedCourierId]);

  const [centerId, setCenterId] = useState<string>(
    availableCenters[0]?.id || centers[0]?.id || ''
  );
  const [type, setType] = useState<VoucherType | ''>('');
  const [amount, setAmount] = useState<string>('');
  const [voucherNumber, setVoucherNumber] = useState<string>('');
  const [voucherDate, setVoucherDate] = useState<string>(
    () => new Date().toISOString().slice(0, 10)
  );
  const [sampleMovementId, setSampleMovementId] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [attachmentName, setAttachmentName] = useState<string>('');
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string>('');
  const [aiScanning, setAiScanning] = useState(false);
  const [aiExtracted, setAiExtracted] = useState(false);
  const [aiNotice, setAiNotice] = useState<{
    kind: 'info' | 'warning' | 'error';
    text: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const effectiveCourierId = lockedCourierId || courierId;

  const matchingMovements = useMemo(() => {
    return movements.filter(
      (m) => m.centerId === centerId && m.courierId === effectiveCourierId
    );
  }, [movements, centerId, effectiveCourierId]);

  const handleCourierChange = (newCourierId: string) => {
    setCourierId(newCourierId);
    const c = couriers.find((x) => x.id === newCourierId);
    if (c && c.assignedCenterIds.length > 0 && !c.assignedCenterIds.includes(centerId)) {
      setCenterId(c.assignedCenterIds[0]);
    }
  };

  const handleScanVoucherImage = async (file: File) => {
    setAttachmentName(file.name);
    setAiNotice(null);
    setErrorMsg(null);
    setAiScanning(true);

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('تعذر قراءة الصورة'));
        reader.readAsDataURL(file);
      });

      setImagePreviewUrl(dataUrl);

      const res = await fetch('/api/ai/scan-voucher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: dataUrl,
          mimeType: file.type || 'image/jpeg',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'تعذر تحليل صورة السند');
      }

      const extracted = data as AiScanResult;
      if (extracted.amount > 0) setAmount(String(extracted.amount));
      if (extracted.voucherNumber) setVoucherNumber(extracted.voucherNumber);
      if (extracted.date && /^\d{4}-\d{2}-\d{2}$/.test(extracted.date)) {
        setVoucherDate(extracted.date);
      }
      if (extracted.notes) setNotes(extracted.notes);
      if (
        extracted.matchedCenterId &&
        availableCenters.some((c) => c.id === extracted.matchedCenterId)
      ) {
        setCenterId(extracted.matchedCenterId);
      }

      setAiExtracted(true);

      if (
        extracted.detectedType === 'cash' ||
        extracted.detectedType === 'deferred' ||
        extracted.detectedType === 'guarantee'
      ) {
        setType(extracted.detectedType);
        setAiNotice({
          kind: 'info',
          text: `تم تعبئة الحقول آلياً (${extracted.confidence}% ثقة).`,
        });
      } else {
        setType('');
        setAiNotice({
          kind: 'warning',
          text: `لم يتضح نوع السند (${extracted.typeReason}) — اختر النوع يدوياً.`,
        });
      }
    } catch (err) {
      setAiNotice({
        kind: 'error',
        text: err instanceof Error ? err.message : 'تعذر قراءة السند',
      });
    } finally {
      setAiScanning(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!effectiveCourierId || !centerId) {
      setErrorMsg('حدد المراسل والمركز.');
      return;
    }
    if (!type) {
      setErrorMsg('اختر نوع العملية.');
      return;
    }
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
      setErrorMsg('أدخل مبلغاً صحيحاً.');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        courierId: effectiveCourierId,
        centerId,
        sampleMovementId: sampleMovementId || undefined,
        type,
        amount: numericAmount,
        voucherNumber: voucherNumber.trim() || undefined,
        date: voucherDate,
        enteredBy,
        notes: notes.trim() || undefined,
        attachmentName: attachmentName || undefined,
        aiExtracted,
      });
      setAmount('');
      setVoucherNumber('');
      setVoucherDate(new Date().toISOString().slice(0, 10));
      setSampleMovementId('');
      setNotes('');
      setAttachmentName('');
      setImagePreviewUrl('');
      setAiExtracted(false);
      setAiNotice(null);
      setType('');
      setSuccessMsg('تم توثيق السند بنجاح.');
      if (onSuccess) onSuccess();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر حفظ السند');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="rounded-2xl border border-[#0B6E63]/15 bg-[#0B6E63]/[0.04] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-[#0B6E63] shadow-sm ring-1 ring-[#0B6E63]/10">
              {aiScanning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-slate-800">
                قراءة السند بالذكاء الاصطناعي
              </div>
              <div className={`mt-0.5 ${hintClass}`}>
                ارفع الصورة لتعبئة الحقول تلقائياً
              </div>
            </div>
          </div>

          <label className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-[#0B6E63] px-3 py-2 text-[11px] font-semibold text-white transition-colors hover:bg-[#09594f]">
            <Camera className="h-3.5 w-3.5" />
            <span>{aiScanning ? 'جارٍ القراءة...' : 'رفع صورة'}</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              disabled={aiScanning}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleScanVoucherImage(file);
                e.target.value = '';
              }}
            />
          </label>
        </div>

        {imagePreviewUrl && (
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white p-2">
            <img
              src={imagePreviewUrl}
              alt="معاينة السند"
              className="h-12 w-12 rounded-lg object-cover ring-1 ring-slate-200"
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium text-slate-700">{attachmentName}</div>
              <div className={`mt-0.5 ${hintClass}`}>
                {aiScanning
                  ? 'جارٍ تحليل الصورة...'
                  : aiExtracted
                  ? 'تم تعبئة الحقول'
                  : 'صورة مرفقة'}
              </div>
            </div>
          </div>
        )}

        {aiNotice && (
          <div
            className={`mt-3 flex items-start gap-2 rounded-xl border px-3 py-2 text-[11px] leading-relaxed ${
              aiNotice.kind === 'info'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : aiNotice.kind === 'warning'
                ? 'border-amber-200 bg-amber-50 text-amber-900'
                : 'border-red-200 bg-red-50 text-red-800'
            }`}
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0">{aiNotice.text}</span>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs leading-relaxed text-red-800">
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs leading-relaxed text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {!lockedCourierId && (
          <div>
            <label className={labelClass}>المراسل</label>
            <select
              value={courierId}
              onChange={(e) => handleCourierChange(e.target.value)}
              className={fieldClass}
            >
              {couriers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className={lockedCourierId ? 'sm:col-span-2' : ''}>
          <label className={labelClass}>المركز الطبي</label>
          <select
            value={centerId}
            onChange={(e) => setCenterId(e.target.value)}
            className={fieldClass}
          >
            {availableCenters.map((ctr) => (
              <option key={ctr.id} value={ctr.id}>
                {ctr.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelClass}>نوع العملية</label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <button
            type="button"
            aria-pressed={type === 'cash'}
            onClick={() => setType('cash')}
            className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors sm:text-sm ${
              type === 'cash'
                ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Banknote className="h-4 w-4 shrink-0" />
            <span>نقد مستلم</span>
          </button>

          <button
            type="button"
            aria-pressed={type === 'deferred'}
            onClick={() => setType('deferred')}
            className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors sm:text-sm ${
              type === 'deferred'
                ? 'border-blue-600 bg-blue-50 text-blue-900'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <FileCheck2 className="h-4 w-4 shrink-0" />
            <span>سند آجل</span>
          </button>

          <button
            type="button"
            aria-pressed={type === 'guarantee'}
            onClick={() => setType('guarantee')}
            className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors sm:text-sm ${
              type === 'guarantee'
                ? 'border-amber-600 bg-amber-50 text-amber-900'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>ضمان مركز</span>
          </button>
        </div>
        {type === 'guarantee' && (
          <p className={`mt-2 ${hintClass} text-amber-700`}>
            الضمان لا يدخل شرائح النقد، ويُعرض على الإدارة للاعتماد.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>المبلغ (ر.ي)</label>
          <input
            type="number"
            min={1}
            step={100}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className={`${fieldClass} tabular-nums`}
            required
          />
        </div>

        <div>
          <label className={labelClass}>
            رقم السند <span className="font-normal text-slate-400">اختياري</span>
          </label>
          <input
            type="text"
            value={voucherNumber}
            onChange={(e) => setVoucherNumber(e.target.value)}
            placeholder="REC-8812"
            className={`${fieldClass} font-mono-num`}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>ربط بعينة</label>
          <select
            value={sampleMovementId}
            onChange={(e) => setSampleMovementId(e.target.value)}
            className={fieldClass}
          >
            <option value="">بدون ربط</option>
            {matchingMovements.map((m) => (
              <option key={m.id} value={m.id}>
                {m.batchCode} · {m.sampleCount} عينات ({formatCurrency(m.estimatedValue)})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>
            مرفق إضافي <span className="font-normal text-slate-400">اختياري</span>
          </label>
          <label className="flex cursor-pointer items-center justify-between gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-3.5 py-2.5 text-xs text-slate-500 transition-colors hover:bg-slate-100">
            <span className="truncate">
              {attachmentName || 'إرفاق ملف'}
            </span>
            <Paperclip className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setAttachmentName(f.name);
              }}
            />
          </label>
        </div>
      </div>

      <div>
        <label className={labelClass}>ملاحظات</label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="اختياري"
          className={fieldClass}
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-xl bg-[#0B6E63] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#09594f] disabled:opacity-50"
      >
        {submitting ? 'جارٍ الحفظ...' : 'توثيق السند'}
      </button>
    </form>
  );
};
