import React, { useEffect, useState } from 'react';
import { Download, FileText, Printer, X } from 'lucide-react';
import type {
  CenterReconciliation,
  Courier,
  CourierEvaluation,
  MedicalCenter,
  MovementStatus,
  ReportMode,
  SampleMovement,
  Sector,
} from '../types.ts';
import { formatCurrency, formatNumber, formatPct } from '../utils/calculations.ts';
import {
  exportMonthlyReportExcel,
  exportRequestsExcel,
} from '../utils/excelHelper.ts';

interface PrintableReportModalProps {
  open: boolean;
  initialMode?: ReportMode;
  period: string;
  evaluations: CourierEvaluation[];
  reconciliations: CenterReconciliation[];
  movements: SampleMovement[];
  centers: MedicalCenter[];
  couriers: Courier[];
  sectors: Sector[];
  onClose: () => void;
}

interface RequestReportRow {
  movement: SampleMovement;
  centerName: string;
  sectorName: string;
  courierName: string;
  pickupMinutes: number | null;
  labMinutes: number | null;
  returnMinutes: number | null;
  cycleMinutes: number | null;
  slaLabel: string;
  late: boolean;
}

const REPORT_TABS: { key: ReportMode; label: string }[] = [
  { key: 'commissions', label: 'كشف العمولات والتارجت' },
  { key: 'reconciliation', label: 'المطابقة الذكية للمراكز' },
  { key: 'requests', label: 'طلبات العينات والـ SLA' },
];

const REPORT_META: Record<
  ReportMode,
  {
    title: string;
    reference: string;
    unit: string;
    signatures: [string, string, string];
    signNotes: [string, string, string];
  }
> = {
  commissions: {
    title: 'الكشف الرسمي لتقييم المراسلين واحتساب شرائح العمولات',
    reference: 'COM-A4-01',
    unit: 'العملة المعتمدة: الريال اليمني (ر.ي)',
    signatures: ['مسؤول المطابقة والمراجعة', 'مدير العمليات والقطاعات', 'الإدارة المالية'],
    signNotes: ['التوقيع والختم', 'التوقيع والاعتماد', 'اعتماد الصرف النهائي'],
  },
  reconciliation: {
    title: 'التقرير الرسمي لمطابقة حسابات المراكز الطبية والمختبر',
    reference: 'REC-A4-02',
    unit: 'العملة المعتمدة: الريال اليمني (ر.ي)',
    signatures: ['مسؤول المطابقة والمراجعة', 'مدير العمليات والقطاعات', 'الإدارة المالية'],
    signNotes: ['التوقيع والختم', 'التوقيع والاعتماد', 'اعتماد الصرف النهائي'],
  },
  requests: {
    title: 'التقرير الرسمي لحركة طلبات العينات والالتزام بالـ SLA',
    reference: 'REQ-A4-03',
    unit: 'الوحدة الزمنية: دقيقة · التوقيت: تاريخ الجهاز المحلي',
    signatures: ['مسؤول العمليات', 'مندوب القطاع الميداني', 'المراسل الميداني'],
    signNotes: ['التوقيع والختم', 'مراجعة الحركة', 'إقرار الاستلام والتسليم'],
  },
};

const MOVEMENT_STATUS_LABEL: Record<MovementStatus, string> = {
  requested: 'بانتظار الاستلام',
  picked_up: 'مستلم · متجه للمختبر',
  delivered_to_lab: 'في المختبر',
  returned_to_center: 'مكتمل',
  cancelled: 'ملغي',
};

const toDate = (value?: string | null) => (value ? new Date(value) : null);

const diffMinutes = (from?: string | null, to?: string | null) => {
  const start = toDate(from);
  const end = toDate(to);
  if (!start || !end) return null;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
};

const formatDateTime = (value?: string | null) => {
  const date = toDate(value);
  return date
    ? date.toLocaleString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';
};

const getLocalIssueDate = () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
};

const averageMinutes = (values: (number | null)[]) => {
  const valid = values.filter((value): value is number => value !== null);
  if (!valid.length) return null;
  return Math.round(valid.reduce((sum, value) => sum + value, 0) / valid.length);
};

export const PrintableReportModal: React.FC<PrintableReportModalProps> = ({
  open,
  initialMode = 'commissions',
  period,
  evaluations,
  reconciliations,
  movements,
  centers,
  couriers,
  sectors,
  onClose,
}) => {
  const [mode, setMode] = useState<ReportMode>(initialMode);

  useEffect(() => {
    if (!open || mode !== 'requests') return;
    const style = document.createElement('style');
    style.dataset.reportPrint = 'true';
    style.textContent = '@page { size: A4 landscape; margin: 12mm; }';
    document.head.appendChild(style);
    return () => {
      style.remove();
    };
  }, [open, mode]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const totalCash = evaluations.reduce((sum, e) => sum + e.approvedCashTotal, 0);
  const totalDeferred = evaluations.reduce((sum, e) => sum + e.approvedDeferredTotal, 0);
  const totalCommissions = evaluations.reduce(
    (sum, e) => sum + e.totalEarnedCommission,
    0
  );
  const totalTargets = evaluations.reduce(
    (sum, e) => sum + e.relativeFinancialTarget,
    0
  );
  const totalLab = reconciliations.reduce((sum, r) => sum + r.labTotalAmount, 0);
  const totalApproved = reconciliations.reduce(
    (sum, r) => sum + r.approvedTotal,
    0
  );
  const totalGap = reconciliations.reduce((sum, r) => sum + r.gapAmount, 0);
  const totalReconCash = reconciliations.reduce(
    (sum, r) => sum + r.courierCashTotal,
    0
  );
  const totalReconDeferred = reconciliations.reduce(
    (sum, r) => sum + r.courierDeferredTotal,
    0
  );
  const totalGuarantee = reconciliations.reduce(
    (sum, r) => sum + r.courierGuaranteeTotal,
    0
  );

  const centerMap = new Map(centers.map((center) => [center.id, center]));
  const courierMap = new Map(couriers.map((courier) => [courier.id, courier]));
  const sectorMap = new Map(sectors.map((sector) => [sector.id, sector.name]));

  const requestRows: RequestReportRow[] = [...movements]
    .sort(
      (a, b) =>
        new Date(a.requestedAt).getTime() - new Date(b.requestedAt).getTime() ||
        a.batchCode.localeCompare(b.batchCode)
    )
    .map((movement) => {
      const center = centerMap.get(movement.centerId);
      const courier = courierMap.get(movement.courierId);
      const limit = movement.requestType === 'urgent' ? 30 : 90;
      let slaLabel = '—';
      let late = false;

      if (movement.status === 'cancelled') {
        slaLabel = 'ملغي';
      } else if (movement.status === 'returned_to_center') {
        slaLabel = 'مكتمل';
      } else if (movement.status === 'requested') {
        const elapsed = Math.max(
          0,
          Math.round(
            (Date.now() - new Date(movement.requestedAt).getTime()) / 60000
          )
        );
        late = elapsed >= limit;
        slaLabel = late
          ? 'متأخر'
          : elapsed >= limit * 0.75
          ? 'قارب المهلة'
          : 'ضمن المهلة';
      } else if (movement.pickedUpAt) {
        const elapsed =
          diffMinutes(movement.requestedAt, movement.pickedUpAt) ?? 0;
        late = elapsed > limit;
        slaLabel = late ? 'تجاوز المهلة' : 'استلام ضمن المهلة';
      } else {
        slaLabel = 'قيد المتابعة';
      }

      return {
        movement,
        centerName: center?.name || 'مركز غير معروف',
        sectorName: center ? sectorMap.get(center.sectorId) || '-' : '-',
        courierName: courier?.name || 'مراسل غير معروف',
        pickupMinutes: diffMinutes(movement.requestedAt, movement.pickedUpAt),
        labMinutes: diffMinutes(movement.pickedUpAt, movement.deliveredToLabAt),
        returnMinutes: diffMinutes(movement.deliveredToLabAt, movement.returnedAt),
        cycleMinutes: diffMinutes(movement.requestedAt, movement.returnedAt),
        slaLabel,
        late,
      };
    });

  const completedRequests = movements.filter(
    (m) => m.status === 'returned_to_center'
  ).length;
  const openRequests = movements.filter(
    (m) => m.status !== 'returned_to_center' && m.status !== 'cancelled'
  ).length;
  const urgentRequests = movements.filter(
    (m) => m.requestType === 'urgent'
  ).length;
  const lateRequests = requestRows.filter((row) => row.late).length;
  const avgPickup = averageMinutes(requestRows.map((row) => row.pickupMinutes));
  const avgLab = averageMinutes(requestRows.map((row) => row.labMinutes));
  const avgReturn = averageMinutes(
    requestRows.map((row) => row.returnMinutes)
  );
  const avgCycle = averageMinutes(requestRows.map((row) => row.cycleMinutes));

  const meta = REPORT_META[mode];
  const issueDate = getLocalIssueDate();

  const handleExcelExport = () => {
    if (mode === 'requests') {
      exportRequestsExcel(
        movements,
        centers,
        couriers,
        sectors,
        period.replace(/\s+/g, '_')
      );
      return;
    }
    exportMonthlyReportExcel(
      reconciliations,
      evaluations,
      `${period}_${mode === 'commissions' ? 'العمولات' : 'المطابقة'}`
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="printable-report-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[1px] print:static print:bg-white print:p-0"
    >
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl print:max-h-none print:w-full print:max-w-none print:border-none print:shadow-none">
        <div className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-6 py-4">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-[#0B6E63]" />
            <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
              {REPORT_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setMode(tab.key)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
                    mode === tab.key
                      ? 'bg-[#0B6E63] text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExcelExport}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5 text-[#0B6E63]" />
              <span>تصدير Excel</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 rounded-lg bg-[#0B6E63] px-4 py-2 text-xs font-semibold text-white hover:bg-[#09594f] whitespace-nowrap"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>طباعة / تصدير PDF رسمي</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-100"
              aria-label="إغلاق"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="print-only-container flex-1 overflow-y-auto bg-white p-8 text-slate-900 print:p-0">
          <div className="report-sheet">
            <div className="report-header flex items-start justify-between gap-6 border-b-2 border-[#0B6E63] pb-5">
              <div>
                <div className="text-xs font-bold text-[#0B6E63]">
                  منظومة مسار العينات — الإدارة المالية والمختبر المركزي
                </div>
                <h1 id="printable-report-title" className="mt-1 font-display text-xl font-bold text-slate-900">
                  {meta.title}
                </h1>
                <p className="mt-1 text-xs text-slate-500">
                  {mode === 'requests' ? 'الفترة' : 'الفترة المحاسبية'}: {period} · {meta.unit}
                </p>
              </div>
              <div className="text-left text-xs text-slate-500 font-mono-num">
                <div>تاريخ الإصدار: {issueDate}</div>
                <div className="mt-1 font-semibold text-slate-800">
                  مرجع: {meta.reference}
                </div>
              </div>
            </div>

            {mode === 'commissions' && (
              <div className="mt-6 space-y-6">
                <div className="report-summary grid grid-cols-3 gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 tabular-nums">
                  <div className="report-card">
                    <div className="text-xs text-slate-500">إجمالي النقد التراكمي المعتمد</div>
                    <div className="mt-1 text-lg font-bold text-slate-900">
                      {formatCurrency(totalCash)}
                    </div>
                  </div>
                  <div className="report-card">
                    <div className="text-xs text-slate-500">إجمالي الآجل المعتمد (0.5%)</div>
                    <div className="mt-1 text-lg font-bold text-slate-900">
                      {formatCurrency(totalDeferred)}
                    </div>
                  </div>
                  <div className="report-card">
                    <div className="text-xs text-slate-500">صافي العمولات المستحقة للصرف</div>
                    <div className="mt-1 text-lg font-bold text-[#0B6E63]">
                      {formatCurrency(totalCommissions)}
                    </div>
                  </div>
                </div>

                <div className="report-note rounded-lg border border-slate-200 px-4 py-2.5 text-[11px] leading-relaxed text-slate-600">
                  معادلة الصرف المعتمدة: النقد التراكمي الشهري (1 – 1,000,000: 0.5% | 1,000,001 – 2,000,000: 1.0% | أكثر من 2,000,000: 1.5%) + الآجل المعتمد (0.5% ثابتة). الدرجة المرجّحة: 50% تحصيل مالي + 50% مؤشر الجهد، وتُفتح شريحة 1.5% فقط عند جهد 70/100 أو أكثر.
                </div>

                <table className="report-table w-full border-collapse text-right text-[11px]">
                  <thead>
                    <tr className="border-y border-slate-300 bg-slate-100 font-bold text-slate-700">
                      <th className="px-2.5 py-2.5">الترتيب</th>
                      <th className="px-2.5 py-2.5">المراسل / القطاع</th>
                      <th className="px-2.5 py-2.5">التارجت النسبي</th>
                      <th className="px-2.5 py-2.5">نسبة التحقيق</th>
                      <th className="px-2.5 py-2.5">النقد التراكمي</th>
                      <th className="px-2.5 py-2.5">الآجل المعتمد</th>
                      <th className="px-2.5 py-2.5">الجهد /100</th>
                      <th className="px-2.5 py-2.5">النتيجة الموزونة</th>
                      <th className="px-2.5 py-2.5">إجمالي العمولة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 tabular-nums">
                    {evaluations.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                          لا توجد بيانات مراسلين لعرضها في هذه الفترة.
                        </td>
                      </tr>
                    ) : (
                      evaluations.map((ev, idx) => (
                        <tr key={ev.courier.id}>
                          <td className="px-2.5 py-2.5 font-mono-num">{idx + 1}</td>
                          <td className="px-2.5 py-2.5">
                            <div className="font-bold text-slate-900">{ev.courier.name}</div>
                            <div className="text-[10px] text-slate-500">{ev.sectorName}</div>
                          </td>
                          <td className="px-2.5 py-2.5">{formatCurrency(ev.relativeFinancialTarget)}</td>
                          <td className="px-2.5 py-2.5 font-semibold text-[#0B6E63]">
                            {formatPct(ev.financialAchievementPct)}
                          </td>
                          <td className="px-2.5 py-2.5">
                            <div>{formatCurrency(ev.approvedCashTotal)}</div>
                            <div className="text-[10px] text-slate-500">
                              عمولة شرائح: {formatCurrency(ev.cashBreakdown.totalCommission)}
                            </div>
                          </td>
                          <td className="px-2.5 py-2.5">
                            <div>{formatCurrency(ev.approvedDeferredTotal)}</div>
                            <div className="text-[10px] text-slate-500">
                              عمولة 0.5%: {formatCurrency(ev.deferredCommission)}
                            </div>
                          </td>
                          <td className="px-2.5 py-2.5 font-bold">
                            {ev.effortScore}/100
                            <div className="text-[10px] font-normal text-slate-500">
                              {ev.higherTierBonusEligible ? 'مؤهل' : 'تحت 70'}
                            </div>
                          </td>
                          <td className="px-2.5 py-2.5 font-bold text-slate-900">
                            {ev.weightedFinalScore}
                          </td>
                          <td className="px-2.5 py-2.5 font-bold text-[#0B6E63]">
                            {formatCurrency(ev.totalEarnedCommission)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold tabular-nums">
                      <td colSpan={2} className="px-2.5 py-2.5">
                        الإجمالي ({evaluations.length} مراسل)
                      </td>
                      <td className="px-2.5 py-2.5">{formatCurrency(totalTargets)}</td>
                      <td className="px-2.5 py-2.5">—</td>
                      <td className="px-2.5 py-2.5">{formatCurrency(totalCash)}</td>
                      <td className="px-2.5 py-2.5">{formatCurrency(totalDeferred)}</td>
                      <td colSpan={2} className="px-2.5 py-2.5 text-center">—</td>
                      <td className="px-2.5 py-2.5 text-[#0B6E63]">
                        {formatCurrency(totalCommissions)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {mode === 'reconciliation' && (
              <div className="mt-6 space-y-6">
                <div className="report-summary grid grid-cols-3 gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 tabular-nums">
                  <div className="report-card">
                    <div className="text-xs text-slate-500">إجمالي فواتير نظام المختبر</div>
                    <div className="mt-1 text-lg font-bold text-slate-900">
                      {formatCurrency(totalLab)}
                    </div>
                  </div>
                  <div className="report-card">
                    <div className="text-xs text-slate-500">إجمالي السندات المعتمدة</div>
                    <div className="mt-1 text-lg font-bold text-emerald-700">
                      {formatCurrency(totalApproved)}
                    </div>
                  </div>
                  <div className="report-card">
                    <div className="text-xs text-slate-500">إجمالي الفجوات غير المسددة</div>
                    <div className="mt-1 text-lg font-bold text-red-700">
                      {formatCurrency(totalGap)}
                    </div>
                  </div>
                </div>

                <div className="report-note rounded-lg border border-slate-200 px-4 py-2.5 text-[11px] leading-relaxed text-slate-600">
                  تعتمد المطابقة على فواتير المختبر المستوردة مقابل السندات النقدية والآجل المعتمدة والفجوات المسوية، مع إبراز الضمانات المعلّقة والتداخل بين المراسلين على مستوى المركز.
                </div>

                <table className="report-table w-full border-collapse text-right text-[11px]">
                  <thead>
                    <tr className="border-y border-slate-300 bg-slate-100 font-bold text-slate-700">
                      <th className="px-2.5 py-2.5">المركز الطبي</th>
                      <th className="px-2.5 py-2.5">المختبر</th>
                      <th className="px-2.5 py-2.5">النقد</th>
                      <th className="px-2.5 py-2.5">الآجل</th>
                      <th className="px-2.5 py-2.5">الضمانات</th>
                      <th className="px-2.5 py-2.5">الفجوة</th>
                      <th className="px-2.5 py-2.5">المراسلون المشاركون</th>
                      <th className="px-2.5 py-2.5">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 tabular-nums">
                    {reconciliations.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                          لا توجد مراكز لعرضها في تقرير المطابقة.
                        </td>
                      </tr>
                    ) : (
                      reconciliations.map((rec) => (
                        <tr key={rec.center.id}>
                          <td className="px-2.5 py-2.5">
                            <div className="font-bold text-slate-900">{rec.center.name}</div>
                            <div className="text-[10px] text-slate-500">
                              {rec.sectorName} · {rec.labSampleCount} عينة
                            </div>
                          </td>
                          <td className="px-2.5 py-2.5 font-semibold">
                            {formatCurrency(rec.labTotalAmount)}
                          </td>
                          <td className="px-2.5 py-2.5 text-emerald-800">
                            {formatCurrency(rec.courierCashTotal)}
                          </td>
                          <td className="px-2.5 py-2.5 text-blue-800">
                            {formatCurrency(rec.courierDeferredTotal)}
                          </td>
                          <td className="px-2.5 py-2.5 text-amber-800">
                            {formatCurrency(rec.courierGuaranteeTotal)}
                          </td>
                          <td className="px-2.5 py-2.5 font-bold text-red-700">
                            {formatCurrency(rec.gapAmount)}
                          </td>
                          <td className="px-2.5 py-2.5 text-[10px]">
                            {rec.involvedCouriers.length
                              ? rec.involvedCouriers
                                  .map(
                                    (c) =>
                                      `${c.courierName} (${formatCurrency(c.vouchersTotal)})`
                                  )
                                  .join(' · ')
                              : '—'}
                          </td>
                          <td className="px-2.5 py-2.5 font-bold">
                            {rec.status === 'matched'
                              ? 'مطابق'
                              : rec.status === 'needs_review'
                              ? 'مراجعة ضمان'
                              : 'فجوة مالية'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold tabular-nums">
                      <td className="px-2.5 py-2.5">
                        الإجمالي ({reconciliations.length} مركز)
                      </td>
                      <td className="px-2.5 py-2.5">{formatCurrency(totalLab)}</td>
                      <td className="px-2.5 py-2.5 text-emerald-800">
                        {formatCurrency(totalReconCash)}
                      </td>
                      <td className="px-2.5 py-2.5 text-blue-800">
                        {formatCurrency(totalReconDeferred)}
                      </td>
                      <td className="px-2.5 py-2.5 text-amber-800">
                        {formatCurrency(totalGuarantee)}
                      </td>
                      <td className="px-2.5 py-2.5 text-red-700">
                        {formatCurrency(totalGap)}
                      </td>
                      <td colSpan={2} className="px-2.5 py-2.5 text-center">—</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {mode === 'requests' && (
              <div className="mt-6 space-y-6">
                <div className="report-summary report-summary-cols-4 grid grid-cols-4 gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 tabular-nums">
                  <div className="report-card">
                    <div className="text-xs text-slate-500">إجمالي الطلبات</div>
                    <div className="mt-1 text-lg font-bold text-slate-900">
                      {formatNumber(movements.length)}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      عاجل: {formatNumber(urgentRequests)}
                    </div>
                  </div>
                  <div className="report-card">
                    <div className="text-xs text-slate-500">مكتملة / مفتوحة</div>
                    <div className="mt-1 text-lg font-bold text-emerald-700">
                      {formatNumber(completedRequests)} / {formatNumber(openRequests)}
                    </div>
                    <div className="text-[10px] text-slate-500">حسب وقت الإرجاع</div>
                  </div>
                  <div className="report-card">
                    <div className="text-xs text-slate-500">تجاوزات SLA</div>
                    <div className="mt-1 text-lg font-bold text-red-700">
                      {formatNumber(lateRequests)}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      30 د للمستعجل · 90 د للعادي
                    </div>
                  </div>
                  <div className="report-card">
                    <div className="text-xs text-slate-500">متوسط الدورة الكاملة</div>
                    <div className="mt-1 text-lg font-bold text-[#0B6E63]">
                      {avgCycle === null ? '—' : `${formatNumber(avgCycle)} د`}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      استلام {avgPickup === null ? '—' : `${formatNumber(avgPickup)} د`}
                    </div>
                  </div>
                </div>

                <div className="report-note rounded-lg border border-slate-200 px-4 py-2.5 text-[11px] leading-relaxed text-slate-600">
                  تُحتسب الفواصل الزمنية من الطوابع الأربعة المسجّلة خادمياً: الطلب ← الاستلام ← المختبر ← الإرجاع. حد الالتزام 30 دقيقة للطلب المستعجل و90 دقيقة للطلب العادي، ويُحتسب التجاوز عند تجاوز حد الاستلام أو بقاء الطلب مفتوحاً بعده.
                </div>

                <table className="report-table report-table-requests w-full border-collapse text-right text-[10px]">
                  <thead>
                    <tr className="border-y border-slate-300 bg-slate-100 font-bold text-slate-700">
                      <th className="px-2 py-2.5">رقم الطلب</th>
                      <th className="px-2 py-2.5">المركز / القطاع</th>
                      <th className="px-2 py-2.5">المراسل</th>
                      <th className="px-2 py-2.5">النوع</th>
                      <th className="px-2 py-2.5">الحالة</th>
                      <th className="px-2 py-2.5">الطلب</th>
                      <th className="px-2 py-2.5">الاستلام</th>
                      <th className="px-2 py-2.5">المختبر</th>
                      <th className="px-2 py-2.5">الإرجاع</th>
                      <th className="px-2 py-2.5">SLA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 tabular-nums">
                    {requestRows.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="px-3 py-8 text-center text-slate-500">
                          لا توجد طلبات عينات لعرضها في الفترة الحالية.
                        </td>
                      </tr>
                    ) : (
                      requestRows.map((row) => (
                        <tr key={row.movement.id}>
                          <td className="px-2 py-2 font-mono-num font-bold">
                            {row.movement.batchCode}
                            <div className="text-[9px] font-normal text-slate-500">
                              {formatNumber(row.movement.sampleCount)} عينة
                            </div>
                          </td>
                          <td className="px-2 py-2">
                            <div className="font-bold text-slate-900">{row.centerName}</div>
                            <div className="text-[9px] text-slate-500">{row.sectorName}</div>
                          </td>
                          <td className="px-2 py-2">{row.courierName}</td>
                          <td className="px-2 py-2">
                            {row.movement.requestType === 'urgent' ? 'مستعجل' : 'عادي'}
                          </td>
                          <td className="px-2 py-2">
                            {MOVEMENT_STATUS_LABEL[row.movement.status]}
                          </td>
                          <td className="px-2 py-2 font-mono-num">
                            {formatDateTime(row.movement.requestedAt)}
                          </td>
                          <td className="px-2 py-2 font-mono-num">
                            {formatDateTime(row.movement.pickedUpAt)}
                            <div className="text-[9px] text-slate-500">
                              {row.pickupMinutes === null
                                ? '—'
                                : `+${formatNumber(row.pickupMinutes)} د`}
                            </div>
                          </td>
                          <td className="px-2 py-2 font-mono-num">
                            {formatDateTime(row.movement.deliveredToLabAt)}
                            <div className="text-[9px] text-slate-500">
                              {row.labMinutes === null
                                ? '—'
                                : `+${formatNumber(row.labMinutes)} د`}
                            </div>
                          </td>
                          <td className="px-2 py-2 font-mono-num">
                            {formatDateTime(row.movement.returnedAt)}
                            <div className="text-[9px] text-slate-500">
                              {row.returnMinutes === null
                                ? '—'
                                : `+${formatNumber(row.returnMinutes)} د`}
                            </div>
                          </td>
                          <td
                            className={`px-2 py-2 font-bold ${
                              row.late ? 'text-red-700' : 'text-[#0B6E63]'
                            }`}
                          >
                            {row.slaLabel}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold tabular-nums">
                      <td colSpan={5} className="px-2 py-2.5">
                        الإجمالي ({movements.length} طلب) · متوسط الإرجاع{' '}
                        {avgReturn === null ? '—' : `${formatNumber(avgReturn)} د`}
                      </td>
                      <td className="px-2 py-2.5">—</td>
                      <td className="px-2 py-2.5">
                        {avgPickup === null ? '—' : `${formatNumber(avgPickup)} د`}
                      </td>
                      <td className="px-2 py-2.5">
                        {avgLab === null ? '—' : `${formatNumber(avgLab)} د`}
                      </td>
                      <td className="px-2 py-2.5">
                        {avgReturn === null ? '—' : `${formatNumber(avgReturn)} د`}
                      </td>
                      <td className="px-2 py-2.5 text-red-700">
                        {formatNumber(lateRequests)} تجاوز
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            <div className="report-signatures mt-10 grid grid-cols-3 gap-6 border-t border-slate-200 pt-6 text-center text-xs text-slate-600">
              {meta.signatures.map((signature, index) => (
                <div key={signature}>
                  <div className="font-bold text-slate-900">{signature}</div>
                  <div className="mt-8 border-b border-dashed border-slate-300 pb-1">
                    {meta.signNotes[index]}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
