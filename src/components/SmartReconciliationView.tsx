import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  GitFork,
  Plus,
  Search,
  ShieldAlert,
  Upload,
} from 'lucide-react';
import type {
  CenterReconciliation,
  Courier,
  CourierEvaluation,
  GapAttribution,
} from '../types.ts';
import { formatCurrency } from '../utils/calculations.ts';
import {
  downloadLabReportTemplate,
  exportMonthlyReportExcel,
  parseLabExcelFile,
  type ParsedLabImportRow,
} from '../utils/excelHelper.ts';
import { Drawer } from './Drawer.tsx';

interface SmartReconciliationViewProps {
  period: string;
  reconciliations: CenterReconciliation[];
  evaluations: CourierEvaluation[];
  couriers: Courier[];
  onImportLabRows: (rows: ParsedLabImportRow[], replaceExisting: boolean) => Promise<void>;
  onVoucherDecision: (
    voucherId: string,
    decision: 'approved_as_deferred' | 'suspended' | 'rejected'
  ) => Promise<void>;
  onResolveGap: (payload: {
    centerId: string;
    courierId: string;
    amount: number;
    resolutionType: GapAttribution['resolutionType'];
    note: string;
  }) => Promise<void>;
  onOpenReport?: () => void;
}

type ReconFilter = 'all' | 'gap' | 'needs_review' | 'matched' | 'overlap';

export const SmartReconciliationView: React.FC<SmartReconciliationViewProps> = ({
  period,
  reconciliations,
  evaluations,
  couriers,
  onImportLabRows,
  onVoucherDecision,
  onResolveGap,
  onOpenReport,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [filter, setFilter] = useState<ReconFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCenterId, setSelectedCenterId] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [importing, setImporting] = useState(false);

  const [showManualModal, setShowManualModal] = useState(false);
  const [manualCenterName, setManualCenterName] = useState(
    reconciliations[0]?.center.name || ''
  );
  const [manualSamples, setManualSamples] = useState('10');
  const [manualAmount, setManualAmount] = useState('');
  const [manualType, setManualType] = useState('غير محدد');
  const [replaceOnManual, setReplaceOnManual] = useState(false);

  const [gapCourierId, setGapCourierId] = useState<string>('');
  const [gapAmountInput, setGapAmountInput] = useState<string>('');
  const [gapNoteInput, setGapNoteInput] = useState<string>('');
  const [busyActionId, setBusyActionId] = useState<string | null>(null);

  useEffect(() => {
    if (!showManualModal) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowManualModal(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [showManualModal]);

  const selectedRec =
    reconciliations.find((r) => r.center.id === selectedCenterId) || null;

  const openCenterDrawer = (rec: CenterReconciliation) => {
    setSelectedCenterId(rec.center.id);
    setGapCourierId(rec.center.primaryCourierId || couriers[0]?.id || '');
    setGapAmountInput(rec.gapAmount > 0 ? String(rec.gapAmount) : '');
    setGapNoteInput('');
  };

  const filtered = reconciliations.filter((r) => {
    if (filter === 'gap' && r.status !== 'gap') return false;
    if (filter === 'needs_review' && r.status !== 'needs_review') return false;
    if (filter === 'matched' && r.status !== 'matched') return false;
    if (filter === 'overlap' && !r.hasMultiCourierOverlap) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      return (
        r.center.name.toLowerCase().includes(q) ||
        r.sectorName.toLowerCase().includes(q) ||
        r.involvedCouriers.some((c) => c.courierName.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportMessage(null);
    try {
      const rows = await parseLabExcelFile(file);
      await onImportLabRows(rows, true);
      setImportMessage({
        type: 'success',
        text: `تم استيراد ${rows.length} سطراً من تقرير المختبر وتحديث المطابقة.`,
      });
    } catch (err) {
      setImportMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'تعذر قراءة الملف',
      });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmount = Number(manualAmount);
    if (!manualCenterName || numericAmount < 0) return;
    setImporting(true);
    try {
      await onImportLabRows(
        [
          {
            centerName: manualCenterName,
            sampleCount: Number(manualSamples) || 0,
            totalAmount: numericAmount,
            labType: manualType,
            date: new Date().toISOString().slice(0, 10),
          },
        ],
        replaceOnManual
      );
      setImportMessage({
        type: 'success',
        text: `تمت إضافة سطر المختبر لـ ${manualCenterName} وتحديث المطابقة.`,
      });
      setShowManualModal(false);
      setManualAmount('');
    } finally {
      setImporting(false);
    }
  };

  const counts = {
    all: reconciliations.length,
    gap: reconciliations.filter((r) => r.status === 'gap').length,
    needs_review: reconciliations.filter((r) => r.status === 'needs_review').length,
    matched: reconciliations.filter((r) => r.status === 'matched').length,
    overlap: reconciliations.filter((r) => r.hasMultiCourierOverlap).length,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200/80 bg-white p-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="font-display text-base font-bold text-slate-900">
            استيراد ومطابقة تقرير المختبر
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            ارفع ملف المختبر للمقارنة التلقائية مع سندات المراسلين وفرز المراكز المشتركة
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-2 rounded-lg bg-[#0B6E63] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#09594f] disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>{importing ? 'جارٍ القراءة...' : 'استيراد تقرير المختبر'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowManualModal(true)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>إدخال سطر</span>
          </button>

          <button
            type="button"
            onClick={downloadLabReportTemplate}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-700" />
            <span>نموذج Excel</span>
          </button>

          <button
            type="button"
            onClick={() => exportMonthlyReportExcel(reconciliations, evaluations, period)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <Download className="h-3.5 w-3.5 text-slate-600" />
            <span>تصدير Excel</span>
          </button>

          {onOpenReport && (
            <button
              type="button"
              onClick={onOpenReport}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-[#0B6E63] hover:bg-teal-50/40 whitespace-nowrap shrink-0"
            >
              <FileText className="h-3.5 w-3.5" />
              <span>تقرير PDF</span>
            </button>
          )}
        </div>
      </div>

      {importMessage && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs font-medium ${
            importMessage.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-red-200 bg-red-50 text-red-900'
          }`}
        >
          {importMessage.text}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200/80 bg-slate-100 p-1">
          {(
            [
              { key: 'all', label: `الكل (${counts.all})` },
              { key: 'gap', label: `فجوات (${counts.gap})` },
              { key: 'needs_review', label: `مراجعة وضمان (${counts.needs_review})` },
              { key: 'matched', label: `مطابق (${counts.matched})` },
              { key: 'overlap', label: `تداخل مراسلين (${counts.overlap})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilter(tab.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                filter === tab.key
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث بالمركز أو المراسل..."
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pr-9 pl-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-500">
                <th className="px-6 py-3.5">المركز الطبي</th>
                <th className="px-4 py-3.5">إجمالي المختبر</th>
                <th className="px-4 py-3.5">نقد موثق</th>
                <th className="px-4 py-3.5">آجل معتمد</th>
                <th className="px-4 py-3.5">ضمانات</th>
                <th className="px-4 py-3.5">الفجوة</th>
                <th className="px-4 py-3.5">الحالة</th>
                <th className="px-6 py-3.5">الإجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center text-sm text-slate-500">
                    لا توجد مراكز مطابقة للفلتر المحدد.
                  </td>
                </tr>
              ) : (
                filtered.map((rec) => (
                  <tr
                    key={rec.center.id}
                    onClick={() => openCenterDrawer(rec)}
                    className="cursor-pointer transition-colors hover:bg-slate-50"
                  >
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-2 font-semibold text-slate-900">
                        <span>{rec.center.name}</span>
                        {rec.hasMultiCourierOverlap && (
                          <span title="تداخل مراسلين مفروز">
                            <GitFork className="h-3.5 w-3.5 text-teal-700" />
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-400">
                        {rec.sectorName} · {rec.labSampleCount} عينة
                      </div>
                    </td>
                    <td className="px-4 py-3.5 font-semibold text-slate-900 tabular-nums">
                      {formatCurrency(rec.labTotalAmount)}
                    </td>
                    <td className="px-4 py-3.5 text-emerald-800 tabular-nums">
                      {formatCurrency(rec.courierCashTotal)}
                    </td>
                    <td className="px-4 py-3.5 text-blue-800 tabular-nums">
                      {formatCurrency(rec.courierDeferredTotal)}
                    </td>
                    <td className="px-4 py-3.5 text-amber-800 tabular-nums">
                      {formatCurrency(rec.courierGuaranteeTotal)}
                    </td>
                    <td className="px-4 py-3.5 font-bold tabular-nums">
                      <span className={rec.gapAmount > 0 ? 'text-red-700' : 'text-slate-300'}>
                        {formatCurrency(rec.gapAmount)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-xs font-semibold">
                      {rec.status === 'matched' && (
                        <span className="inline-flex items-center gap-1.5 text-emerald-700 whitespace-nowrap">
                          <CheckCircle2 className="h-4 w-4" />
                          <span>مطابق</span>
                        </span>
                      )}
                      {rec.status === 'needs_review' && (
                        <span className="inline-flex items-center gap-1.5 text-amber-700 whitespace-nowrap">
                          <ShieldAlert className="h-4 w-4" />
                          <span>مراجعة ضمان</span>
                        </span>
                      )}
                      {rec.status === 'gap' && (
                        <span className="inline-flex items-center gap-1.5 text-red-700 whitespace-nowrap">
                          <AlertCircle className="h-4 w-4" />
                          <span>فجوة مالية</span>
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openCenterDrawer(rec);
                        }}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                      >
                        فرز وإجراء
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Drawer
        open={Boolean(selectedRec)}
        onClose={() => setSelectedCenterId(null)}
        title={selectedRec?.center.name || ''}
        subtitle={
          selectedRec
            ? `${selectedRec.sectorName} · ${selectedRec.labSampleCount} عينة (${selectedRec.labTypesSummary})`
            : undefined
        }
      >
        {selectedRec && (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4 border-b border-slate-200 pb-5 tabular-nums">
              <div>
                <div className="text-xs text-slate-500">إجمالي المختبر</div>
                <div className="mt-1 text-lg font-bold text-slate-900">
                  {formatCurrency(selectedRec.labTotalAmount)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">المعتمد الموثق</div>
                <div className="mt-1 text-lg font-bold text-emerald-700">
                  {formatCurrency(selectedRec.approvedTotal)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">الفجوة المالية</div>
                <div
                  className={`mt-1 text-lg font-bold ${
                    selectedRec.gapAmount > 0 ? 'text-red-700' : 'text-slate-400'
                  }`}
                >
                  {formatCurrency(selectedRec.gapAmount)}
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-900">
                  فرز المراسلين ({selectedRec.involvedCouriers.length})
                </h4>
                {selectedRec.hasMultiCourierOverlap && (
                  <span className="text-xs font-medium text-teal-800">
                    مفروز حسب حركة كل مراسل
                  </span>
                )}
              </div>

              <div className="mt-3 space-y-3">
                {selectedRec.involvedCouriers.map((ic) => (
                  <div
                    key={ic.courierId}
                    className="rounded-lg border border-slate-200 bg-slate-50/70 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-900">
                        {ic.courierName}
                      </span>
                      <span className="font-mono-num text-xs font-bold text-teal-800">
                        سنداته: {formatCurrency(ic.vouchersTotal)}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500 tabular-nums">
                      {ic.movementsCount} حركة عينات · {ic.sampleCount} عينة · قيمة مقدرة{' '}
                      {formatCurrency(ic.movementsValue)}
                    </div>

                    <div className="mt-3 space-y-1.5 border-t border-slate-200/70 pt-2.5">
                      {selectedRec.centerMovements
                        .filter((m) => m.courierId === ic.courierId)
                        .map((m) => (
                          <div
                            key={m.id}
                            className="flex items-center justify-between text-xs text-slate-600"
                          >
                            <span>
                              <span className="font-mono-num font-semibold text-slate-800">
                                {m.batchCode}
                              </span>{' '}
                              · {m.notes}
                            </span>
                            <span className="font-mono-num font-semibold text-slate-900">
                              {formatCurrency(m.estimatedValue)}
                            </span>
                          </div>
                        ))}
                      {selectedRec.centerVouchers
                        .filter((v) => v.courierId === ic.courierId)
                        .map((v) => (
                          <div
                            key={v.id}
                            className="flex items-center justify-between text-xs text-slate-700"
                          >
                            <span>
                              سند{' '}
                              <span className="font-mono-num font-semibold">
                                {v.voucherNumber}
                              </span>{' '}
                              (
                              {v.type === 'cash'
                                ? 'نقد'
                                : v.type === 'deferred'
                                ? 'آجل'
                                : 'ضمان مركز'}
                              )
                            </span>
                            <span className="font-mono-num font-semibold">
                              {formatCurrency(v.amount)}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {selectedRec.centerVouchers.some(
              (v) =>
                v.type === 'guarantee' &&
                (v.approvalStatus === 'pending_review' ||
                  v.approvalStatus === 'suspended')
            ) && (
              <div className="border-t border-slate-200 pt-5">
                <h4 className="text-sm font-bold text-amber-900">
                  ضمانات بانتظار القرار الإداري
                </h4>
                <div className="mt-3 space-y-3">
                  {selectedRec.centerVouchers
                    .filter(
                      (v) =>
                        v.type === 'guarantee' &&
                        (v.approvalStatus === 'pending_review' ||
                          v.approvalStatus === 'suspended')
                    )
                    .map((v) => {
                      const cName =
                        couriers.find((c) => c.id === v.courierId)?.name || '';
                      return (
                        <div
                          key={v.id}
                          className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 space-y-3"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-slate-900">
                              {v.voucherNumber} · {cName}
                            </span>
                            <span className="font-mono-num font-bold text-amber-900">
                              {formatCurrency(v.amount)}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600">{v.notes}</p>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={busyActionId === v.id}
                              onClick={async () => {
                                setBusyActionId(v.id);
                                try {
                                  await onVoucherDecision(v.id, 'approved_as_deferred');
                                } finally {
                                  setBusyActionId(null);
                                }
                              }}
                              className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800"
                            >
                              اعتماد كآجل (0.5%)
                            </button>
                            {v.approvalStatus !== 'suspended' && (
                              <button
                                type="button"
                                disabled={busyActionId === v.id}
                                onClick={async () => {
                                  setBusyActionId(v.id);
                                  try {
                                    await onVoucherDecision(v.id, 'suspended');
                                  } finally {
                                    setBusyActionId(null);
                                  }
                                }}
                                className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-50"
                              >
                                تعليق حتى السداد
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={busyActionId === v.id}
                              onClick={async () => {
                                setBusyActionId(v.id);
                                try {
                                  await onVoucherDecision(v.id, 'rejected');
                                } finally {
                                  setBusyActionId(null);
                                }
                              }}
                              className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                            >
                              رفض
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {selectedRec.gapAmount > 0 && (
              <div className="border-t border-slate-200 pt-5 space-y-3">
                <h4 className="text-sm font-bold text-red-800">
                  تسوية الفجوة المالية ({formatCurrency(selectedRec.gapAmount)})
                </h4>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-slate-600">المراسل</label>
                    <select
                      value={gapCourierId}
                      onChange={(e) => setGapCourierId(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                    >
                      {couriers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-600">المبلغ</label>
                    <input
                      type="number"
                      min={1}
                      max={selectedRec.gapAmount}
                      value={gapAmountInput}
                      onChange={(e) => setGapAmountInput(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs tabular-nums"
                    />
                  </div>
                </div>

                <input
                  type="text"
                  value={gapNoteInput}
                  onChange={(e) => setGapNoteInput(e.target.value)}
                  placeholder="ملاحظة التسوية..."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
                />

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busyActionId === 'gap_cash'}
                    onClick={async () => {
                      const amt = Number(gapAmountInput);
                      if (!amt || amt <= 0) return;
                      setBusyActionId('gap_cash');
                      try {
                        await onResolveGap({
                          centerId: selectedRec.center.id,
                          courierId: gapCourierId,
                          amount: amt,
                          resolutionType: 'settled_cash',
                          note: gapNoteInput || 'تم التحصيل النقدي وتغطية الفجوة',
                        });
                      } finally {
                        setBusyActionId(null);
                      }
                    }}
                    className="flex-1 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
                  >
                    تسوية كنقد
                  </button>
                  <button
                    type="button"
                    disabled={busyActionId === 'gap_def'}
                    onClick={async () => {
                      const amt = Number(gapAmountInput);
                      if (!amt || amt <= 0) return;
                      setBusyActionId('gap_def');
                      try {
                        await onResolveGap({
                          centerId: selectedRec.center.id,
                          courierId: gapCourierId,
                          amount: amt,
                          resolutionType: 'attributed_deferred',
                          note: gapNoteInput || 'ضمان معتمد كآجل 0.5%',
                        });
                      } finally {
                        setBusyActionId(null);
                      }
                    }}
                    className="flex-1 rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-800"
                  >
                    اعتماد كآجل
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>

      {showManualModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="manual-lab-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-[1px]"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 id="manual-lab-modal-title" className="text-base font-bold text-slate-900">
                إدخال سطر تقرير المختبر
              </h3>
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                className="text-xs font-medium text-slate-500 hover:text-slate-900"
              >
                إغلاق
              </button>
            </div>

            <form onSubmit={handleManualSubmit} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  المركز الطبي
                </label>
                <select
                  value={manualCenterName}
                  onChange={(e) => setManualCenterName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
                >
                  {reconciliations.map((r) => (
                    <option key={r.center.id} value={r.center.name}>
                      {r.center.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    مجموع العينات
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={manualSamples}
                    onChange={(e) => setManualSamples(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    السعر الإجمالي
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={manualAmount}
                    onChange={(e) => setManualAmount(e.target.value)}
                    placeholder="150000"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  النوع في نظام المختبر
                </label>
                <select
                  value={manualType}
                  onChange={(e) => setManualType(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="نقد">نقد</option>
                  <option value="آجل">آجل</option>
                  <option value="ضمان">ضمان</option>
                  <option value="مختلط">مختلط</option>
                  <option value="غير محدد">غير محدد</option>
                </select>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={replaceOnManual}
                  onChange={(e) => setReplaceOnManual(e.target.checked)}
                />
                <span>استبدال التقرير السابق بهذا السطر</span>
              </label>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={importing}
                  className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800"
                >
                  حفظ وإعادة المطابقة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
