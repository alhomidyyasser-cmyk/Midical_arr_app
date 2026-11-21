import React, { useState } from 'react';
import { CheckCircle2, FileText, Plus, ShieldAlert, Sparkles } from 'lucide-react';
import type {
  Courier,
  CourierEvaluation,
  MedicalCenter,
  SampleMovement,
  Voucher,
  VoucherType,
} from '../types.ts';
import { formatCurrency, formatPct } from '../utils/calculations.ts';
import { CourierDetailDrawer } from './CourierDetailDrawer.tsx';
import { Drawer } from './Drawer.tsx';
import { QuickVoucherForm } from './QuickVoucherForm.tsx';

interface VouchersAndTargetsViewProps {
  vouchers: Voucher[];
  couriers: Courier[];
  centers: MedicalCenter[];
  movements: SampleMovement[];
  evaluations: CourierEvaluation[];
  enteredBy: 'admin' | 'supervisor' | 'courier';
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
  onUpdateCourierTarget: (
    courierId: string,
    regionAvg: number,
    growthTargetPct: number
  ) => Promise<void>;
  onOpenReport?: () => void;
}

export const VouchersAndTargetsView: React.FC<VouchersAndTargetsViewProps> = ({
  vouchers,
  couriers,
  centers,
  movements,
  evaluations,
  enteredBy,
  onCreateVoucher,
  onUpdateCourierTarget,
  onOpenReport,
}) => {
  const [typeFilter, setTypeFilter] = useState<'all' | VoucherType>('all');
  const [courierFilter, setCourierFilter] = useState<string>('all');
  const [selectedCourierId, setSelectedCourierId] = useState<string | null>(null);
  const [showVoucherDrawer, setShowVoucherDrawer] = useState(false);

  const centerMap = new Map(centers.map((c) => [c.id, c]));
  const courierMap = new Map(couriers.map((c) => [c.id, c]));

  const selectedEvaluation =
    evaluations.find((e) => e.courier.id === selectedCourierId) || null;

  const filteredVouchers = vouchers.filter((v) => {
    if (typeFilter !== 'all' && v.type !== typeFilter) return false;
    if (courierFilter !== 'all' && v.courierId !== courierFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {evaluations.map((ev, idx) => (
          <button
            key={ev.courier.id}
            type="button"
            onClick={() => setSelectedCourierId(ev.courier.id)}
            className="rounded-xl border border-slate-200/80 bg-white p-4 text-right transition-colors hover:border-teal-600/40"
          >
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>#{idx + 1} · {ev.sectorName}</span>
              <span className="font-mono-num font-bold text-teal-800">
                {ev.weightedFinalScore} نقطة
              </span>
            </div>
            <div className="mt-1.5 text-sm font-bold text-slate-900">
              {ev.courier.name}
            </div>
            <div className="mt-2 flex items-center justify-between text-xs tabular-nums">
              <span className="text-slate-600">
                العمولة: <strong className="text-slate-900">{formatCurrency(ev.totalEarnedCommission)}</strong>
              </span>
              <span className="text-slate-500">
                تحقيق {formatPct(ev.financialAchievementPct)}
              </span>
            </div>
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 rounded-lg border border-slate-200/80 bg-slate-100 p-1">
              {(
                [
                  { key: 'all', label: 'الكل' },
                  { key: 'cash', label: 'نقد' },
                  { key: 'deferred', label: 'آجل' },
                  { key: 'guarantee', label: 'ضمان' },
                ] as const
              ).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTypeFilter(t.key)}
                  className={`rounded-md px-3 py-1 text-xs font-medium whitespace-nowrap ${
                    typeFilter === t.key
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <select
              value={courierFilter}
              onChange={(e) => setCourierFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-teal-700 focus:outline-none"
            >
              <option value="all">جميع المراسلين</option>
              {couriers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            {onOpenReport && (
              <button
                type="button"
                onClick={onOpenReport}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-[#0B6E63] hover:bg-teal-50/40 whitespace-nowrap shrink-0"
              >
                <FileText className="h-3.5 w-3.5" />
                <span>كشف العمولات PDF</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowVoucherDrawer(true)}
              className="flex items-center gap-1.5 rounded-lg bg-[#0B6E63] px-4 py-2 text-xs font-semibold text-white hover:bg-[#09594f] whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>تسجيل سند جديد</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-500">
                <th className="px-6 py-3.5">رقم السند</th>
                <th className="px-4 py-3.5">التاريخ</th>
                <th className="px-4 py-3.5">المراسل</th>
                <th className="px-4 py-3.5">المركز الطبي</th>
                <th className="px-4 py-3.5">النوع</th>
                <th className="px-4 py-3.5">المبلغ</th>
                <th className="px-6 py-3.5">الاعتماد</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredVouchers.map((v) => {
                const courier = courierMap.get(v.courierId);
                const center = centerMap.get(v.centerId);
                const typeLabel =
                  v.type === 'cash'
                    ? 'نقد مستلم'
                    : v.type === 'deferred'
                    ? 'سند آجل'
                    : 'ضمان مركز';

                const statusLabel =
                  v.approvalStatus === 'auto_approved'
                    ? 'معتمد'
                    : v.approvalStatus === 'approved_as_deferred'
                    ? 'معتمد كآجل'
                    : v.approvalStatus === 'pending_review'
                    ? 'قيد المراجعة'
                    : v.approvalStatus === 'suspended'
                    ? 'معلق'
                    : 'مرفوض';

                return (
                  <tr key={v.id} className="hover:bg-slate-50/70">
                    <td className="px-6 py-3.5 font-mono-num text-xs font-semibold text-slate-900">
                      <div className="flex items-center gap-1.5">
                        <span>{v.voucherNumber}</span>
                        {v.aiExtracted && (
                          <span title="مقروء بالذكاء الاصطناعي">
                            <Sparkles className="h-3 w-3 text-[#0B6E63]" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 font-mono-num text-xs text-slate-500">
                      {v.date}
                    </td>
                    <td className="px-4 py-3.5 font-medium text-slate-900">
                      {courier?.name}
                    </td>
                    <td className="px-4 py-3.5 text-slate-700">{center?.name}</td>
                    <td className="px-4 py-3.5 text-xs font-semibold">
                      <span
                        className={
                          v.type === 'cash'
                            ? 'text-emerald-700'
                            : v.type === 'deferred'
                            ? 'text-blue-700'
                            : 'text-amber-700'
                        }
                      >
                        {typeLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 font-bold text-slate-900 tabular-nums">
                      {formatCurrency(v.amount)}
                    </td>
                    <td className="px-6 py-3.5 text-xs font-medium">
                      <span
                        className={`inline-flex items-center gap-1.5 ${
                          v.approvalStatus === 'auto_approved' ||
                          v.approvalStatus === 'approved_as_deferred'
                            ? 'text-emerald-700'
                            : v.approvalStatus === 'pending_review' ||
                              v.approvalStatus === 'suspended'
                            ? 'text-amber-700'
                            : 'text-red-700'
                        }`}
                      >
                        {v.approvalStatus === 'pending_review' ? (
                          <ShieldAlert className="h-3.5 w-3.5" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        )}
                        {statusLabel}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <CourierDetailDrawer
        evaluation={selectedEvaluation}
        onClose={() => setSelectedCourierId(null)}
        onUpdateTarget={onUpdateCourierTarget}
      />

      <Drawer
        open={showVoucherDrawer}
        onClose={() => setShowVoucherDrawer(false)}
        title="تسجيل سند جديد"
        subtitle="اختر المراسل والمركز والنوع الإجباري لمنع الغموض عند المطابقة"
      >
        <QuickVoucherForm
          couriers={couriers}
          centers={centers}
          movements={movements}
          enteredBy={enteredBy}
          onSubmit={onCreateVoucher}
          onSuccess={() => setShowVoucherDrawer(false)}
        />
      </Drawer>
    </div>
  );
};
