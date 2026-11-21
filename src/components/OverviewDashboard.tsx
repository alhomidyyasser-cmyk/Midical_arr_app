import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Coins,
  FileText,
  GitFork,
  MapPin,
  ScanLine,
  ShieldAlert,
  Target,
  Wallet,
} from 'lucide-react';
import type {
  CenterReconciliation,
  CourierEvaluation,
  ReportMode,
  SampleMovement,
  Voucher,
} from '../types.ts';
import { formatCurrency, formatNumber, formatPct } from '../utils/calculations.ts';
import { CourierDetailDrawer } from './CourierDetailDrawer.tsx';
import { KpiCard, PremiumCard, SectionHeading } from './ui/Premium.tsx';

interface OverviewDashboardProps {
  period: string;
  evaluations: CourierEvaluation[];
  reconciliations: CenterReconciliation[];
  movements: SampleMovement[];
  vouchers: Voucher[];
  onNavigate: (
    tab: 'overview' | 'reconciliation' | 'movements' | 'vouchers' | 'map'
  ) => void;
  onOpenScanner: () => void;
  onOpenReport: (mode: ReportMode) => void;
  onUpdateCourierTarget: (
    courierId: string,
    regionAvg: number,
    growthTargetPct: number
  ) => Promise<void>;
}

export const OverviewDashboard: React.FC<OverviewDashboardProps> = ({
  period,
  evaluations,
  reconciliations,
  movements,
  vouchers,
  onNavigate,
  onOpenScanner,
  onOpenReport,
  onUpdateCourierTarget,
}) => {
  const [selectedCourierId, setSelectedCourierId] = useState<string | null>(null);

  const selectedEvaluation =
    evaluations.find((e) => e.courier.id === selectedCourierId) || null;

  const totalApprovedCash = evaluations.reduce((s, e) => s + e.approvedCashTotal, 0);
  const totalApprovedDeferred = evaluations.reduce((s, e) => s + e.approvedDeferredTotal, 0);
  const totalCommissions = evaluations.reduce((s, e) => s + e.totalEarnedCommission, 0);
  const totalRelativeTarget = evaluations.reduce(
    (s, e) => s + e.relativeFinancialTarget,
    0
  );

  const gapCenters = reconciliations.filter((r) => r.status === 'gap');
  const reviewCenters = reconciliations.filter((r) => r.status === 'needs_review');
  const totalGapAmount = gapCenters.reduce((s, r) => s + r.gapAmount, 0);

  const activeMovements = movements.filter((m) => m.status !== 'returned_to_center').length;
  const completedMovements = movements.filter((m) => m.status === 'returned_to_center').length;
  const topCourier = evaluations[0];

  const attentionItems = reconciliations.filter(
    (r) => r.status !== 'matched' || r.hasMultiCourierOverlap
  );

  const cumulativeSeries = useMemo(() => {
    const approved = vouchers
      .filter(
        (v) =>
          v.approvalStatus === 'auto_approved' ||
          v.approvalStatus === 'approved_as_deferred'
      )
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date));

    const byDate: Record<string, { cash: number; deferred: number }> = {};
    approved.forEach((v) => {
      if (!byDate[v.date]) byDate[v.date] = { cash: 0, deferred: 0 };
      if (v.type === 'cash') byDate[v.date].cash += v.amount;
      else byDate[v.date].deferred += v.amount;
    });

    const dates = Object.keys(byDate).sort();
    let runningCash = 0;
    let runningTotal = 0;
    return dates.map((d) => {
      runningCash += byDate[d].cash;
      runningTotal += byDate[d].cash + byDate[d].deferred;
      return {
        date: d.slice(5),
        runningCash,
        runningTotal,
      };
    });
  }, [vouchers]);

  const tier1Sum = evaluations.reduce((s, e) => s + e.cashBreakdown.tier1Commission, 0);
  const tier2Sum = evaluations.reduce((s, e) => s + e.cashBreakdown.tier2Commission, 0);
  const tier3Sum = evaluations.reduce((s, e) => s + e.cashBreakdown.tier3Commission, 0);
  const deferredCommSum = evaluations.reduce((s, e) => s + e.deferredCommission, 0);

  const chartW = 540;
  const chartH = 190;
  const padX = 44;
  const padY = 20;
  const maxY = Math.max(
    totalRelativeTarget || 1,
    cumulativeSeries[cumulativeSeries.length - 1]?.runningTotal || 1,
    1_000_000
  );

  const totalLinePoints = cumulativeSeries.map((pt, idx) => {
    const x =
      cumulativeSeries.length <= 1
        ? chartW / 2
        : padX + (idx / (cumulativeSeries.length - 1)) * (chartW - padX * 1.4);
    const y = chartH - padY - (pt.runningTotal / maxY) * (chartH - padY * 2);
    return { ...pt, x, y };
  });

  const cashLinePoints = cumulativeSeries.map((pt, idx) => {
    const x =
      cumulativeSeries.length <= 1
        ? chartW / 2
        : padX + (idx / (cumulativeSeries.length - 1)) * (chartW - padX * 1.4);
    const y = chartH - padY - (pt.runningCash / maxY) * (chartH - padY * 2);
    return { ...pt, x, y };
  });

  const totalPolyline = totalLinePoints.map((p) => `${p.x},${p.y}`).join(' ');
  const cashPolyline = cashLinePoints.map((p) => `${p.x},${p.y}`).join(' ');
  const targetLineY =
    chartH - padY - (Math.min(maxY, totalRelativeTarget) / maxY) * (chartH - padY * 2);

  return (
    <div className="space-y-6">
      <PremiumCard className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs font-semibold text-[#0B6E63]">
            مركز القيادة التنفيذية · {period}
          </div>
          <h2 className="mt-0.5 font-display text-base font-bold text-slate-900">
            مؤشرات التحصيل العادل والعمولات التصاعدية ومطابقة المراكز
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenScanner}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <ScanLine className="h-3.5 w-3.5 text-[#0B6E63]" />
            <span>مسح باركود العينة</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('map')}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <MapPin className="h-3.5 w-3.5 text-[#0B6E63]" />
            <span>الخريطة الحية</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenReport('requests')}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <FileText className="h-3.5 w-3.5 text-[#0B6E63]" />
            <span>تقرير الطلبات</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenReport('commissions')}
            className="flex items-center gap-1.5 rounded-lg bg-[#0B6E63] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#09594f] whitespace-nowrap shrink-0"
          >
            <FileText className="h-3.5 w-3.5" />
            <span>تقرير PDF رسمي</span>
          </button>
        </div>
      </PremiumCard>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={`التحصيل المعتمد · ${period}`}
          value={formatCurrency(totalApprovedCash + totalApprovedDeferred)}
          hint={`نقد ${formatCurrency(totalApprovedCash)} · آجل ${formatCurrency(totalApprovedDeferred)}`}
          icon={<Wallet className="h-4 w-4" />}
        />
        <KpiCard
          label="إجمالي العمولات المستحقة"
          value={formatCurrency(totalCommissions)}
          hint="شرائح النقد التراكمي + 0.5% آجل"
          icon={<Coins className="h-4 w-4" />}
          tone="gold"
        />
        <KpiCard
          label="فروقات وضمانات المطابقة"
          value={formatCurrency(totalGapAmount)}
          hint={`${gapCenters.length} فجوة مالية · ${reviewCenters.length} ضمان قيد المراجعة`}
          icon={<ShieldAlert className="h-4 w-4" />}
          tone="red"
        />
        <KpiCard
          label="متصدر التقييم العادل"
          value={<span className="block truncate text-lg">{topCourier ? topCourier.courier.name : '—'}</span>}
          hint={`النتيجة ${topCourier?.weightedFinalScore ?? 0} · الجدية ${topCourier?.effortScore ?? 0}/100`}
          icon={<Target className="h-4 w-4" />}
          tone="green"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <PremiumCard className="lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
            <div>
              <h3 className="font-display text-sm font-bold text-slate-900">
                منحنى التحصيل التراكمي الشهري مقابل التارجت النسبي
              </h3>
              <p className="text-xs text-slate-500">
                تصاعد النقد والإجمالي التراكمي عبر أيام الشهر بالريال اليمني
              </p>
            </div>
            <div className="flex items-center gap-4 text-[11px] text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-[#0B6E63]" />
                <span>إجمالي التحصيل</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-sky-600" />
                <span>النقد الصافي</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-3 bg-amber-600" />
                <span>تارجت الأسطول</span>
              </span>
            </div>
          </div>

          <div className="mt-4">
            {totalLinePoints.length > 0 ? (
              <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-52 overflow-visible">
                {[0.25, 0.5, 0.75, 1].map((ratio) => {
                  const y = chartH - padY - ratio * (chartH - padY * 2);
                  return (
                    <g key={ratio}>
                      <line
                        x1={padX}
                        y1={y}
                        x2={chartW - 16}
                        y2={y}
                        stroke="#E2E8F0"
                        strokeDasharray="3 3"
                      />
                      <text
                        x={padX - 6}
                        y={y + 3}
                        textAnchor="end"
                        className="fill-slate-400 text-[9px] font-mono-num"
                      >
                        {formatNumber((maxY * ratio) / 1000)}K
                      </text>
                    </g>
                  );
                })}

                <line
                  x1={padX}
                  y1={targetLineY}
                  x2={chartW - 16}
                  y2={targetLineY}
                  stroke="#D97706"
                  strokeWidth="1.5"
                  strokeDasharray="5 4"
                />

                {totalLinePoints.length > 1 && (
                  <polyline
                    fill="none"
                    stroke="#0B6E63"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={totalPolyline}
                  />
                )}

                {cashLinePoints.length > 1 && (
                  <polyline
                    fill="none"
                    stroke="#0284C7"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={cashPolyline}
                  />
                )}

                {totalLinePoints.map((pt, i) => (
                  <g key={pt.date}>
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r="3.5"
                      fill="#0B6E63"
                      stroke="#FFFFFF"
                      strokeWidth="1.5"
                    >
                      <title>{`${pt.date}: ${formatCurrency(pt.runningTotal)}`}</title>
                    </circle>
                    <circle
                      cx={cashLinePoints[i].x}
                      cy={cashLinePoints[i].y}
                      r="3"
                      fill="#0284C7"
                      stroke="#FFFFFF"
                      strokeWidth="1.5"
                    >
                      <title>{`${pt.date} نقد: ${formatCurrency(cashLinePoints[i].runningCash)}`}</title>
                    </circle>
                    <text
                      x={pt.x}
                      y={chartH - 4}
                      textAnchor="middle"
                      className="fill-slate-500 text-[9px] font-mono-num"
                    >
                      {pt.date}
                    </text>
                  </g>
                ))}
              </svg>
            ) : (
              <div className="flex h-48 items-center justify-center text-xs text-slate-400">
                لا توجد سندات معتمدة كافية لرسم المنحنى.
              </div>
            )}
          </div>
        </PremiumCard>

        <PremiumCard className="lg:col-span-5">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="font-display text-sm font-bold text-slate-900">
              توزيع العمولات حسب الشرائح التصاعدية
            </h3>
            <p className="text-xs text-slate-500">
              صافي عمولات الأسطول في كل شريحة نقدية + السندات الآجلة
            </p>
          </div>

          <div className="mt-5 space-y-4">
            {(
              [
                {
                  label: 'الشريحة 1 (1 – 1,000,000 ر.ي · 0.5%)',
                  amount: tier1Sum,
                  color: 'bg-[#0B6E63]',
                },
                {
                  label: 'الشريحة 2 (1M – 2M ر.ي · 1.0%)',
                  amount: tier2Sum,
                  color: 'bg-teal-600',
                },
                {
                  label: 'الشريحة 3 (أكثر من 2M ر.ي · 1.5%)',
                  amount: tier3Sum,
                  color: 'bg-emerald-500',
                },
                {
                  label: 'السندات الآجلة المعتمدة (0.5% ثابتة)',
                  amount: deferredCommSum,
                  color: 'bg-sky-600',
                },
              ] as const
            ).map((row) => {
              const pct =
                totalCommissions > 0 ? (row.amount / totalCommissions) * 100 : 0;
              return (
                <div key={row.label}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700">{row.label}</span>
                    <span className="font-mono-num font-bold text-slate-900">
                      {formatCurrency(row.amount)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${row.color} transition-all`}
                      style={{ width: `${Math.max(2, pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </PremiumCard>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <PremiumCard className="lg:col-span-7">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <h2 className="font-display text-base font-bold text-slate-900">
              مؤشر التقييم العادل للمراسلين
            </h2>
            <div className="flex items-center gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-[#0B6E63]" />
                <span>الجهد (50%)</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-slate-300" />
                <span>نمو المنطقة (50%)</span>
              </span>
            </div>
          </div>

          <div className="mt-5 space-y-5">
            {evaluations.map((ev) => {
              const effortPart = Number((ev.effortScore * 0.5).toFixed(1));
              const financialPart = Number(
                (Math.min(125, ev.financialAchievementPct) * 0.5).toFixed(1)
              );
              const maxScale = 120;

              return (
                <button
                  key={ev.courier.id}
                  type="button"
                  onClick={() => setSelectedCourierId(ev.courier.id)}
                  className="block w-full text-right group"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 group-hover:text-[#0B6E63]">
                        {ev.courier.name}
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-500">{ev.sectorName}</span>
                    </div>
                    <div className="font-mono-num font-bold text-slate-900">
                      {ev.weightedFinalScore}{' '}
                      <span className="font-normal text-slate-400">نقطة</span>
                    </div>
                  </div>

                  <div className="mt-2 flex h-3 w-full overflow-hidden rounded-md bg-slate-100">
                    <div
                      className="h-full bg-[#0B6E63] transition-all"
                      style={{ width: `${(effortPart / maxScale) * 100}%` }}
                      title={`مؤشر الجهد: ${ev.effortScore}/100`}
                    />
                    <div
                      className="h-full bg-slate-300 transition-all"
                      style={{ width: `${(financialPart / maxScale) * 100}%` }}
                      title={`تحقيق التارجت النسبي: ${formatPct(ev.financialAchievementPct)}`}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </PremiumCard>

        <PremiumCard className="lg:col-span-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <h2 className="font-display text-base font-bold text-slate-900">
              أولويات المراجعة والمطابقة
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('reconciliation')}
              className="flex items-center gap-1 text-xs font-semibold text-[#0B6E63] hover:underline whitespace-nowrap"
            >
              <span>المطابقة الذكية</span>
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-4 divide-y divide-slate-100">
            {attentionItems.slice(0, 4).map((rec) => (
              <div
                key={rec.center.id}
                className="flex items-center justify-between gap-3 py-3.5 first:pt-1 last:pb-1"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900">
                    {rec.center.name}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-xs">
                    {rec.status === 'gap' && (
                      <span className="inline-flex items-center gap-1 font-medium text-red-700">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        فجوة {formatCurrency(rec.gapAmount)}
                      </span>
                    )}
                    {rec.status === 'needs_review' && (
                      <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                        <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                        ضمان {formatCurrency(rec.courierGuaranteeTotal)}
                      </span>
                    )}
                    {rec.status === 'matched' && rec.hasMultiCourierOverlap && (
                      <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                        <GitFork className="h-3.5 w-3.5 shrink-0" />
                        تداخل مفروز ({rec.involvedCouriers.map((c) => c.courierName.split(' ')[0]).join(' · ')})
                      </span>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onNavigate('reconciliation')}
                  className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                >
                  مراجعة
                </button>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 text-xs text-slate-500">
            <span>حركة العينات: {activeMovements} نشطة · {completedMovements} مكتملة</span>
            <button
              type="button"
              onClick={() => onNavigate('movements')}
              className="font-semibold text-[#0B6E63] hover:underline whitespace-nowrap"
            >
              تتبع العينات
            </button>
          </div>
        </PremiumCard>
      </div>

      <PremiumCard padded={false} className="overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4">
          <SectionHeading
            eyebrow="الفريق الميداني"
            title="ملخص التارجت والعمولات الشهرية"
            description="اضغط على أي مراسل لعرض الشرائح وتعديل التارجت"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-500">
                <th className="px-6 py-3">#</th>
                <th className="px-4 py-3">المراسل</th>
                <th className="px-4 py-3">التارجت النسبي</th>
                <th className="px-4 py-3">النقد التراكمي</th>
                <th className="px-4 py-3">الآجل (0.5%)</th>
                <th className="px-4 py-3">الجهد</th>
                <th className="px-4 py-3">العمولة</th>
                <th className="px-6 py-3">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {evaluations.map((ev, i) => (
                <tr
                  key={ev.courier.id}
                  onClick={() => setSelectedCourierId(ev.courier.id)}
                  className="cursor-pointer transition-colors hover:bg-slate-50"
                >
                  <td className="px-6 py-3.5 font-mono-num text-xs text-slate-400">
                    {i + 1}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="font-semibold text-slate-900">{ev.courier.name}</div>
                    <div className="text-xs text-slate-400">{ev.sectorName}</div>
                  </td>
                  <td className="px-4 py-3.5 tabular-nums">
                    <span className="font-medium text-slate-900">
                      {formatCurrency(ev.relativeFinancialTarget)}
                    </span>
                    <span className="mr-2 text-xs text-[#0B6E63]">
                      {formatPct(ev.financialAchievementPct)}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 tabular-nums">
                    <span className="font-medium text-slate-900">
                      {formatCurrency(ev.approvedCashTotal)}
                    </span>
                    <span className="mr-2 text-xs text-slate-400">
                      شريحة {ev.cashBreakdown.currentTier}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 tabular-nums text-slate-700">
                    {formatCurrency(ev.approvedDeferredTotal)}
                  </td>
                  <td className="px-4 py-3.5 tabular-nums font-semibold text-slate-900">
                    {ev.effortScore}/100
                  </td>
                  <td className="px-4 py-3.5 tabular-nums font-bold text-slate-900">
                    {formatCurrency(ev.totalEarnedCommission)}
                  </td>
                  <td className="px-6 py-3.5 text-xs font-medium">
                    {ev.higherTierBonusEligible ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        مؤهل
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-700">
                        <ShieldAlert className="h-3.5 w-3.5" />
                        تحت 70
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PremiumCard>

      <CourierDetailDrawer
        evaluation={selectedEvaluation}
        onClose={() => setSelectedCourierId(null)}
        onUpdateTarget={onUpdateCourierTarget}
      />
    </div>
  );
};
