import React, { useState } from 'react';
import { Building2, CheckCircle2, ShieldAlert, TrendingUp, Users } from 'lucide-react';
import type {
  CenterReconciliation,
  Courier,
  CourierEvaluation,
  MedicalCenter,
  NotificationItem,
  SampleMovement,
  Sector,
  SectorId,
  Voucher,
  VoucherType,
} from '../types.ts';
import { formatCurrency, formatPct } from '../utils/calculations.ts';
import { QuickVoucherForm } from './QuickVoucherForm.tsx';
import { SampleMovementsView } from './SampleMovementsView.tsx';

interface CourierPortalProps {
  couriers: Courier[];
  centers: MedicalCenter[];
  movements: SampleMovement[];
  notifications: NotificationItem[];
  evaluations: CourierEvaluation[];
  onAdvanceMovement: (id: string) => Promise<void>;
  onCreateMovement: (payload: {
    centerId: string;
    courierId?: string;
    sampleCount: number;
    estimatedValue: number;
    notes?: string;
    initialStatus?: 'requested' | 'picked_up';
  }) => Promise<void>;
  onCreateVoucher: (payload: {
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
  onOpenScanner?: () => void;
}

export const CourierPortal: React.FC<CourierPortalProps> = ({
  couriers,
  centers,
  movements,
  notifications,
  evaluations,
  onAdvanceMovement,
  onCreateMovement,
  onCreateVoucher,
  onOpenScanner,
}) => {
  const [selectedCourierId, setSelectedCourierId] = useState<string>(
    couriers[0]?.id || ''
  );

  const evalData = evaluations.find((e) => e.courier.id === selectedCourierId) || evaluations[0];
  if (!evalData) return null;

  const { cashBreakdown } = evalData;
  const currentTierRate =
    cashBreakdown.currentTier === 1
      ? '0.5%'
      : cashBreakdown.currentTier === 2
      ? '1.0%'
      : '1.5%';

  const progressTo3M = Math.min(100, (evalData.approvedCashTotal / 3_000_000) * 100);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200/80 bg-slate-100 p-1">
          {couriers.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedCourierId(c.id)}
              className={`rounded-md px-3.5 py-1.5 text-xs font-medium whitespace-nowrap ${
                selectedCourierId === c.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-500">{evalData.sectorName}</span>
      </div>

      <div className="rounded-xl bg-gradient-to-l from-[#0B6E63] to-[#085249] p-6 text-white shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-teal-100">
              ملخص الشرائح الشهري · {evalData.courier.name}
            </div>
            <div className="font-display text-lg font-bold tracking-wide sm:text-xl">
              إجمالي نقدك {formatCurrency(evalData.approvedCashTotal)} — الشريحة{' '}
              {cashBreakdown.currentTier} ({currentTierRate})
            </div>
            <p className="text-xs text-slate-300">
              {cashBreakdown.nextTierThreshold
                ? `متبقي ${formatCurrency(cashBreakdown.remainingToNextTier)} للوصول إلى الشريحة الأعلى`
                : 'وصلت إلى الشريحة الثالثة القصوى (1.5%)'}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-6 border-t border-white/10 pt-4 lg:border-t-0 lg:pt-0 tabular-nums">
            <div>
              <div className="text-xs text-slate-400">العمولة المستحقة</div>
              <div className="mt-1 text-xl font-bold text-white">
                {formatCurrency(evalData.totalEarnedCommission)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400">نقاط الجدية</div>
              <div className="mt-1 text-xl font-bold text-teal-300">
                {evalData.effortScore}/100
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400">التارجت النسبي</div>
              <div className="mt-1 text-xl font-bold text-white">
                {formatPct(evalData.financialAchievementPct)}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 space-y-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-teal-400 transition-all duration-300"
              style={{ width: `${progressTo3M}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] text-slate-400 font-mono-num">
            <span>0</span>
            <span>1,000,000 (0.5%)</span>
            <span>2,000,000 (1.0%)</span>
            <span>3,000,000 (1.5%)</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 lg:col-span-5">
          <h3 className="border-b border-slate-100 pb-3 text-sm font-bold text-slate-900">
            توثيق سند جديد
          </h3>
          <div className="mt-4">
            <QuickVoucherForm
              key={selectedCourierId}
              couriers={couriers}
              centers={centers}
              movements={movements}
              lockedCourierId={selectedCourierId}
              enteredBy="courier"
              onSubmit={onCreateVoucher}
            />
          </div>
        </div>

        <div className="lg:col-span-7">
          <SampleMovementsView
            movements={movements}
            centers={centers}
            couriers={couriers}
            notifications={notifications.filter(
              (n) =>
                n.recipientName === evalData.courier.name || n.recipientRole === 'courier'
            )}
            lockedCourierId={selectedCourierId}
            onAdvanceMovement={onAdvanceMovement}
            onOpenScanner={onOpenScanner}
            onCreateMovement={onCreateMovement}
          />
        </div>
      </div>
    </div>
  );
};

interface SupervisorPortalProps {
  sectors: Sector[];
  couriers: Courier[];
  centers: MedicalCenter[];
  movements: SampleMovement[];
  evaluations: CourierEvaluation[];
  reconciliations: CenterReconciliation[];
  onCreateVoucher: (payload: {
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
}

export const SupervisorPortal: React.FC<SupervisorPortalProps> = ({
  sectors,
  couriers,
  centers,
  movements,
  evaluations,
  reconciliations,
  onCreateVoucher,
}) => {
  const [selectedSectorId, setSelectedSectorId] = useState<SectorId>('north');
  const activeSector = sectors.find((s) => s.id === selectedSectorId) || sectors[0];

  const sectorCouriers = couriers.filter((c) => c.sectorId === selectedSectorId);
  const sectorEvaluations = evaluations.filter(
    (e) => e.courier.sectorId === selectedSectorId
  );
  const sectorRecons = reconciliations.filter(
    (r) => r.center.sectorId === selectedSectorId
  );
  const sectorCenters = centers.filter((c) => c.sectorId === selectedSectorId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-bold text-slate-900">
            {activeSector?.name} · {activeSector?.supervisorName}
          </h2>
          <p className="text-xs text-slate-500">{activeSector?.description}</p>
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200/80 bg-slate-100 p-1">
          {sectors.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedSectorId(s.id)}
              className={`rounded-md px-3.5 py-1.5 text-xs font-medium whitespace-nowrap ${
                selectedSectorId === s.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-7">
          <div className="rounded-xl border border-slate-200/80 bg-white p-5">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3 text-sm font-bold text-slate-900">
              <Users className="h-4 w-4 text-teal-700" />
              <span>التزام مراسلي القطاع</span>
            </div>
            <div className="mt-4 divide-y divide-slate-100">
              {sectorEvaluations.map((ev) => (
                <div
                  key={ev.courier.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div>
                    <div className="text-sm font-bold text-slate-900">
                      {ev.courier.name}
                    </div>
                    <div className="text-xs text-slate-500 tabular-nums">
                      تغطية {ev.servedCentersCount}/{ev.totalAssignedCenters} · دورات {ev.completedCyclesCount}/{ev.totalMovementsCount}
                    </div>
                  </div>
                  <div className="text-left text-xs tabular-nums">
                    <div className="font-bold text-teal-800">
                      الجهد {ev.effortScore}/100 · النتيجة {ev.weightedFinalScore}
                    </div>
                    {ev.unresolvedGapTotal > 0 ? (
                      <div className="font-semibold text-red-700">
                        فجوة {formatCurrency(ev.unresolvedGapTotal)}
                      </div>
                    ) : (
                      <div className="text-emerald-700">سجل نظيف</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-white p-5">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3 text-sm font-bold text-slate-900">
              <TrendingUp className="h-4 w-4 text-teal-700" />
              <span>مراكز القطاع ومتابعة المتأخرات</span>
            </div>
            <div className="mt-4 divide-y divide-slate-100">
              {sectorRecons.map((r) => (
                <div
                  key={r.center.id}
                  className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0 text-xs"
                >
                  <div>
                    <div className="font-bold text-slate-900">{r.center.name}</div>
                    <div className="text-slate-500 tabular-nums">
                      متأخرات {formatCurrency(r.center.overdueBalance)} · فجوة {formatCurrency(r.gapAmount)}
                    </div>
                  </div>
                  <span
                    className={`font-semibold ${
                      r.status === 'matched'
                        ? 'text-emerald-700'
                        : r.status === 'needs_review'
                        ? 'text-amber-700'
                        : 'text-red-700'
                    }`}
                  >
                    {r.status === 'matched'
                      ? 'مطابق'
                      : r.status === 'needs_review'
                      ? 'ضمان للمراجعة'
                      : 'فجوة مالية'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white p-5 lg:col-span-5">
          <h3 className="border-b border-slate-100 pb-3 text-sm font-bold text-slate-900">
            إدخال سند ورقي نيابةً عن المراسل
          </h3>
          <div className="mt-4">
            <QuickVoucherForm
              key={selectedSectorId}
              couriers={sectorCouriers.length ? sectorCouriers : couriers}
              centers={sectorCenters.length ? sectorCenters : centers}
              movements={movements}
              enteredBy="supervisor"
              onSubmit={onCreateVoucher}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

interface CenterPortalProps {
  centers: MedicalCenter[];
  couriers: Courier[];
  movements: SampleMovement[];
  vouchers: Voucher[];
  notifications: NotificationItem[];
  reconciliations: CenterReconciliation[];
  onCreateMovement: (payload: {
    centerId: string;
    courierId?: string;
    sampleCount: number;
    estimatedValue: number;
    notes?: string;
    initialStatus?: 'requested' | 'picked_up';
  }) => Promise<void>;
  onAdvanceMovement: (id: string) => Promise<void>;
}

export const CenterPortal: React.FC<CenterPortalProps> = ({
  centers,
  couriers,
  movements,
  vouchers,
  notifications,
  reconciliations,
  onCreateMovement,
  onAdvanceMovement,
}) => {
  const [selectedCenterId, setSelectedCenterId] = useState<string>(
    centers[0]?.id || ''
  );

  const rec = reconciliations.find((r) => r.center.id === selectedCenterId);
  const center = centers.find((c) => c.id === selectedCenterId) || centers[0];
  if (!center) return null;

  const centerVouchers = vouchers.filter((v) => v.centerId === center.id);
  const courierMap = new Map(couriers.map((c) => [c.id, c.name]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-4">
        <div className="flex items-center gap-2.5">
          <Building2 className="h-5 w-5 text-teal-700" />
          <div>
            <h2 className="font-display text-base font-bold text-slate-900">
              {center.name}
            </h2>
            <p className="text-xs text-slate-500">
              {center.address} · {center.phone}
            </p>
          </div>
        </div>

        <select
          value={selectedCenterId}
          onChange={(e) => setSelectedCenterId(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900"
        >
          {centers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {rec && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200/80 bg-white p-4">
            <div className="text-xs text-slate-500">فواتير المختبر</div>
            <div className="mt-1 text-xl font-bold text-slate-900 tabular-nums">
              {formatCurrency(rec.labTotalAmount)}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-white p-4">
            <div className="text-xs text-slate-500">النقد المسدد</div>
            <div className="mt-1 text-xl font-bold text-emerald-700 tabular-nums">
              {formatCurrency(rec.courierCashTotal)}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-white p-4">
            <div className="text-xs text-slate-500">الآجل المعتمد</div>
            <div className="mt-1 text-xl font-bold text-blue-700 tabular-nums">
              {formatCurrency(rec.courierDeferredTotal)}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-white p-4">
            <div className="text-xs text-slate-500">ضمانات / فروقات</div>
            <div className="mt-1 text-xl font-bold text-amber-700 tabular-nums">
              {formatCurrency(rec.courierGuaranteeTotal + rec.gapAmount)}
            </div>
          </div>
        </div>
      )}

      <SampleMovementsView
        movements={movements}
        centers={centers}
        couriers={couriers}
        notifications={notifications}
        lockedCenterId={center.id}
        onAdvanceMovement={onAdvanceMovement}
        onCreateMovement={onCreateMovement}
      />

      <div className="rounded-xl border border-slate-200/80 bg-white p-5">
        <h3 className="border-b border-slate-100 pb-3 text-sm font-bold text-slate-900">
          السندات الموثقة للمركز
        </h3>
        <div className="mt-2 divide-y divide-slate-100">
          {centerVouchers.map((v) => (
            <div
              key={v.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs"
            >
              <div>
                <span className="font-mono-num font-bold text-slate-900">
                  {v.voucherNumber}
                </span>{' '}
                · {courierMap.get(v.courierId)} · {v.date} · {v.notes}
              </div>
              <div className="flex items-center gap-3 tabular-nums">
                <span className="font-bold text-slate-900">
                  {formatCurrency(v.amount)}
                </span>
                <span className="flex items-center gap-1 text-slate-600">
                  {v.type === 'guarantee' ? (
                    <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
                  )}
                  {v.type === 'cash'
                    ? 'نقد'
                    : v.type === 'deferred'
                    ? 'آجل'
                    : 'ضمان'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
