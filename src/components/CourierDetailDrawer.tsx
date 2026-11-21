import React, { useEffect, useState } from 'react';
import { CheckCircle2, ShieldAlert } from 'lucide-react';
import type { CourierEvaluation } from '../types.ts';
import { formatCurrency, formatPct } from '../utils/calculations.ts';
import { Drawer } from './Drawer.tsx';

interface CourierDetailDrawerProps {
  evaluation: CourierEvaluation | null;
  onClose: () => void;
  onUpdateTarget: (
    courierId: string,
    regionAvg: number,
    growthTargetPct: number
  ) => Promise<void>;
}

export const CourierDetailDrawer: React.FC<CourierDetailDrawerProps> = ({
  evaluation,
  onClose,
  onUpdateTarget,
}) => {
  const [regionAvg, setRegionAvg] = useState('');
  const [growthPct, setGrowthPct] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    if (evaluation) {
      setRegionAvg(String(evaluation.courier.regionAvg));
      setGrowthPct(String(evaluation.courier.growthTargetPct));
      setSavedNotice(false);
    }
  }, [evaluation]);

  if (!evaluation) return null;

  const { courier, cashBreakdown } = evaluation;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedNotice(false);
    try {
      await onUpdateTarget(
        courier.id,
        Number(regionAvg) || courier.regionAvg,
        Number(growthPct) >= 0 ? Number(growthPct) : courier.growthTargetPct
      );
      setSavedNotice(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open={Boolean(evaluation)}
      onClose={onClose}
      title={courier.name}
      subtitle={`${evaluation.sectorName} · هاتف ${courier.phone}`}
    >
      <div className="space-y-7">
        <div className="grid grid-cols-3 gap-4 border-b border-slate-200 pb-6 tabular-nums">
          <div>
            <div className="text-xs text-slate-500">النتيجة الموزونة</div>
            <div className="mt-1 text-2xl font-bold text-teal-800">
              {evaluation.weightedFinalScore}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">مؤشر الجهد</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">
              {evaluation.effortScore}
              <span className="text-xs font-normal text-slate-400">/100</span>
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">إجمالي العمولة</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">
              {formatCurrency(evaluation.totalEarnedCommission)}
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-900">شرائح النقد التراكمي</h4>
            <span className="text-xs font-semibold text-teal-800 tabular-nums">
              الإجمالي: {formatCurrency(cashBreakdown.totalCash)}
            </span>
          </div>

          <div className="mt-3 space-y-2.5 text-xs">
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3.5 py-2.5">
              <span className="text-slate-700">الشريحة 1 (1 – 1,000,000 · 0.5%)</span>
              <span className="font-mono-num font-semibold text-slate-900">
                {formatCurrency(cashBreakdown.tier1Amount)} ←{' '}
                <span className="text-emerald-700">
                  {formatCurrency(cashBreakdown.tier1Commission)}
                </span>
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3.5 py-2.5">
              <span className="text-slate-700">الشريحة 2 (1M – 2M · 1.0%)</span>
              <span className="font-mono-num font-semibold text-slate-900">
                {formatCurrency(cashBreakdown.tier2Amount)} ←{' '}
                <span className="text-emerald-700">
                  {formatCurrency(cashBreakdown.tier2Commission)}
                </span>
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3.5 py-2.5">
              <span className="text-slate-700">الشريحة 3 (أكثر من 2M · 1.5%)</span>
              <span className="font-mono-num font-semibold text-slate-900">
                {formatCurrency(cashBreakdown.tier3Amount)} ←{' '}
                <span className="text-emerald-700">
                  {formatCurrency(cashBreakdown.tier3Commission)}
                </span>
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 pt-2.5">
              <span className="font-medium text-slate-700">
                السندات الآجلة المعتمدة (0.5%)
              </span>
              <span className="font-mono-num font-semibold text-blue-700">
                {formatCurrency(evaluation.approvedDeferredTotal)} ←{' '}
                {formatCurrency(evaluation.deferredCommission)}
              </span>
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-900">تفصيل مؤشر الجهد والانضباط</h4>
            <span className="inline-flex items-center gap-1 text-xs font-semibold">
              {evaluation.higherTierBonusEligible ? (
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  مؤهل للحافز الكامل
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-amber-700">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  أقل من حد 70 نقطة
                </span>
              )}
            </span>
          </div>

          <div className="mt-3 space-y-3 text-xs">
            <div>
              <div className="flex justify-between text-slate-700">
                <span>تسليم السندات ومطابقتها</span>
                <span className="font-mono-num font-semibold">
                  {evaluation.documentationScore} / 40
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full bg-teal-700"
                  style={{ width: `${(evaluation.documentationScore / 40) * 100}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-slate-700">
                <span>تغطية المراكز وسرعة الدورات</span>
                <span className="font-mono-num font-semibold">
                  {evaluation.coverageAndSpeedScore} / 35
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full bg-teal-700"
                  style={{ width: `${(evaluation.coverageAndSpeedScore / 35) * 100}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-slate-700">
                <span>تحصيل المتأخرات وتنشيط المراكز</span>
                <span className="font-mono-num font-semibold">
                  {evaluation.arrearsAndActivationScore} / 25
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full bg-teal-700"
                  style={{ width: `${(evaluation.arrearsAndActivationScore / 25) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSave} className="border-t border-slate-200 pt-5 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-900">ضبط التارجت النسبي للمنطقة</h4>
            <span className="text-xs font-semibold text-teal-800 tabular-nums">
              نسبة التحقيق: {formatPct(evaluation.financialAchievementPct)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-slate-600">متوسط المنطقة</label>
              <input
                type="number"
                value={regionAvg}
                onChange={(e) => setRegionAvg(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums focus:border-teal-700 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">نسبة النمو %</label>
              <input
                type="number"
                value={growthPct}
                onChange={(e) => setGrowthPct(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums focus:border-teal-700 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-slate-500 tabular-nums">
              التارجت المطلوب: {formatCurrency(evaluation.relativeFinancialTarget)}
            </span>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[#0B6E63] px-4 py-2 text-xs font-semibold text-white hover:bg-[#09594f] disabled:opacity-50"
            >
              {saving ? 'جارٍ التحديث...' : 'حفظ التعديل'}
            </button>
          </div>
          {savedNotice && (
            <p className="text-xs font-medium text-emerald-700">
              تم تحديث التارجت وإعادة احتساب التقييم بنجاح.
            </p>
          )}
        </form>
      </div>
    </Drawer>
  );
};
