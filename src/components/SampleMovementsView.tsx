import React, { useState } from 'react';
import {
  Bell,
  CheckCircle2,
  FlaskConical,
  MessageSquare,
  PackageCheck,
  Plus,
  QrCode,
  RotateCcw,
  ScanLine,
  Truck,
} from 'lucide-react';
import type {
  Courier,
  MedicalCenter,
  MovementStatus,
  NotificationItem,
  SampleMovement,
} from '../types.ts';
import { formatCurrency } from '../utils/calculations.ts';
import { Drawer } from './Drawer.tsx';
import { SampleQrLabelModal } from './SampleQrModal.tsx';

interface SampleMovementsViewProps {
  movements: SampleMovement[];
  centers: MedicalCenter[];
  couriers: Courier[];
  notifications: NotificationItem[];
  lockedCourierId?: string;
  lockedCenterId?: string;
  onAdvanceMovement: (id: string) => Promise<void>;
  onOpenScanner?: () => void;
  onCreateMovement: (payload: {
    centerId: string;
    courierId?: string;
    sampleCount: number;
    estimatedValue: number;
    notes?: string;
    initialStatus?: 'requested' | 'picked_up';
  }) => Promise<void>;
}

const STATUS_LABELS: Record<MovementStatus, string> = {
  requested: 'بانتظار الاستلام',
  picked_up: 'تم الاستلام',
  delivered_to_lab: 'في المختبر',
  returned_to_center: 'مكتمل الإرجاع',
  cancelled: 'ملغي',
};

const NEXT_ACTION_LABEL: Record<MovementStatus, string | null> = {
  requested: '1. تأكيد الاستلام',
  picked_up: '2. تسليم للمختبر',
  delivered_to_lab: '3. إرجاع النتائج',
  returned_to_center: null,
  cancelled: null,
};

function formatTime(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const SampleMovementsView: React.FC<SampleMovementsViewProps> = ({
  movements,
  centers,
  couriers,
  notifications,
  lockedCourierId,
  lockedCenterId,
  onAdvanceMovement,
  onOpenScanner,
  onCreateMovement,
}) => {
  const [statusFilter, setStatusFilter] = useState<'all' | MovementStatus>('all');
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [showNewDrawer, setShowNewDrawer] = useState(false);
  const [qrTargetMovement, setQrTargetMovement] = useState<SampleMovement | null>(null);

  const [newCenterId, setNewCenterId] = useState(
    lockedCenterId || centers[0]?.id || ''
  );
  const [newCourierId, setNewCourierId] = useState(
    lockedCourierId || couriers[0]?.id || ''
  );
  const [sampleCount, setSampleCount] = useState('4');
  const [estimatedValue, setEstimatedValue] = useState('1500');
  const [notes, setNotes] = useState('');
  const [initialStatus, setInitialStatus] = useState<'requested' | 'picked_up'>(
    lockedCenterId ? 'requested' : 'picked_up'
  );
  const [creating, setCreating] = useState(false);

  const centerMap = new Map(centers.map((c) => [c.id, c]));
  const courierMap = new Map(couriers.map((c) => [c.id, c]));

  const visibleMovements = movements.filter((m) => {
    if (lockedCourierId && m.courierId !== lockedCourierId) return false;
    if (lockedCenterId && m.centerId !== lockedCenterId) return false;
    if (statusFilter !== 'all' && m.status !== statusFilter) return false;
    return true;
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await onCreateMovement({
        centerId: lockedCenterId || newCenterId,
        courierId: lockedCourierId || (lockedCenterId ? undefined : newCourierId),
        sampleCount: Number(sampleCount) || 1,
        estimatedValue: Number(estimatedValue) || 0,
        notes,
        initialStatus: lockedCenterId ? 'requested' : initialStatus,
      });
      setShowNewDrawer(false);
      setNotes('');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
      <div className="space-y-4 xl:col-span-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200/80 bg-slate-100 p-1">
            {(
              [
                { key: 'all', label: 'الكل' },
                { key: 'requested', label: 'بانتظار الاستلام' },
                { key: 'picked_up', label: 'تم الاستلام' },
                { key: 'delivered_to_lab', label: 'في المختبر' },
                { key: 'returned_to_center', label: 'مكتمل' },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setStatusFilter(t.key)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  statusFilter === t.key
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {onOpenScanner && !lockedCenterId && (
              <button
                type="button"
                onClick={onOpenScanner}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <ScanLine className="h-3.5 w-3.5 text-[#0B6E63]" />
                <span>مسح باركود</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowNewDrawer(true)}
              className="flex items-center gap-1.5 rounded-lg bg-[#0B6E63] px-4 py-2 text-xs font-semibold text-white hover:bg-[#09594f] whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{lockedCenterId ? 'طلب استلام عينة' : 'حركة عينة جديدة'}</span>
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {visibleMovements.length === 0 ? (
            <div className="rounded-xl border border-slate-200/80 bg-white p-10 text-center text-sm text-slate-500">
              لا توجد حركات عينات ضمن هذا التصنيف.
            </div>
          ) : (
            visibleMovements.map((m) => {
              const center = centerMap.get(m.centerId);
              const courier = courierMap.get(m.courierId);
              const actionLabel = NEXT_ACTION_LABEL[m.status];

              return (
                <div
                  key={m.id}
                  className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                        <span className="font-mono-num font-bold text-slate-800">
                          {m.batchCode}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="text-slate-600">{STATUS_LABELS[m.status]}</span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">{m.sampleCount} عينات</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold text-slate-800 tabular-nums">
                          {formatCurrency(m.estimatedValue)}
                        </span>
                      </div>

                      <div className="text-base font-bold text-slate-900">
                        {center?.name || 'مركز غير معروف'}
                      </div>
                      <div className="text-xs text-slate-500">
                        المراسل:{' '}
                        <span className="font-semibold text-[#0B6E63]">
                          {courier?.name}
                        </span>{' '}
                        · {m.notes}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setQrTargetMovement(m)}
                        className="flex min-h-[42px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                        title="عرض وطباعة ملصق QR"
                      >
                        <QrCode className="h-4 w-4 text-[#0B6E63]" />
                        <span>ملصق QR</span>
                      </button>

                      {actionLabel && !lockedCenterId ? (
                        <button
                          type="button"
                          disabled={advancingId === m.id}
                          onClick={async () => {
                            setAdvancingId(m.id);
                            try {
                              await onAdvanceMovement(m.id);
                            } finally {
                              setAdvancingId(null);
                            }
                          }}
                          className="flex min-h-[42px] items-center justify-center gap-2 rounded-lg bg-[#0B6E63] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#09594f] disabled:opacity-50 whitespace-nowrap shrink-0"
                        >
                          {m.status === 'requested' && <PackageCheck className="h-4 w-4" />}
                          {m.status === 'picked_up' && <FlaskConical className="h-4 w-4" />}
                          {m.status === 'delivered_to_lab' && (
                            <RotateCcw className="h-4 w-4" />
                          )}
                          <span>
                            {advancingId === m.id ? 'جارٍ التحديث...' : actionLabel}
                          </span>
                        </button>
                      ) : (
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 whitespace-nowrap shrink-0">
                          <CheckCircle2 className="h-4 w-4" />
                          <span>
                            {m.status === 'returned_to_center'
                              ? 'مكتملة'
                              : STATUS_LABELS[m.status]}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-xs">
                    <div
                      className={`flex items-center gap-1.5 ${
                        m.pickedUpAt ? 'font-semibold text-emerald-700' : 'text-slate-400'
                      }`}
                    >
                      <Truck className="h-3.5 w-3.5 shrink-0" />
                      <span>استلام ({formatTime(m.pickedUpAt)})</span>
                    </div>
                    <div
                      className={`flex items-center gap-1.5 ${
                        m.deliveredToLabAt
                          ? 'font-semibold text-emerald-700'
                          : 'text-slate-400'
                      }`}
                    >
                      <FlaskConical className="h-3.5 w-3.5 shrink-0" />
                      <span>مختبر ({formatTime(m.deliveredToLabAt)})</span>
                    </div>
                    <div
                      className={`flex items-center gap-1.5 ${
                        m.returnedAt ? 'font-semibold text-emerald-700' : 'text-slate-400'
                      }`}
                    >
                      <RotateCcw className="h-3.5 w-3.5 shrink-0" />
                      <span>إرجاع ({formatTime(m.returnedAt)})</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="xl:col-span-4">
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Bell className="h-4 w-4 text-[#0B6E63]" />
              <span>الإشعارات و SMS</span>
            </div>
            <span className="font-mono-num text-xs text-slate-400">
              {notifications.length}
            </span>
          </div>

          <div className="mt-4 max-h-[540px] space-y-3.5 overflow-y-auto pl-1">
            {notifications.slice(0, 12).map((n) => (
              <div
                key={n.id}
                className="border-b border-slate-100 pb-3 last:border-b-0 last:pb-0"
              >
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="flex items-center gap-1.5 font-medium text-slate-700">
                    {n.channel === 'sms' ? (
                      <MessageSquare className="h-3.5 w-3.5 text-blue-700" />
                    ) : (
                      <Bell className="h-3.5 w-3.5 text-[#0B6E63]" />
                    )}
                    <span>{n.recipientName}</span>
                  </span>
                  <span className="font-mono-num">{formatTime(n.createdAt)}</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  {n.message}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <SampleQrLabelModal
        movement={qrTargetMovement}
        center={qrTargetMovement ? centerMap.get(qrTargetMovement.centerId) : undefined}
        courier={qrTargetMovement ? courierMap.get(qrTargetMovement.courierId) : undefined}
        onClose={() => setQrTargetMovement(null)}
      />

      <Drawer
        open={showNewDrawer}
        onClose={() => setShowNewDrawer(false)}
        title={lockedCenterId ? 'طلب استلام عينات' : 'تسجيل حركة عينة جديدة'}
        subtitle="تُربط الدفعة باسم المراسل والمركز تلقائياً مع توليد باركود وإرسال إشعار فوري"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          {!lockedCenterId && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                المركز الطبي
              </label>
              <select
                value={newCenterId}
                onChange={(e) => setNewCenterId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
              >
                {centers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!lockedCourierId && !lockedCenterId && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                المراسل المنفذ
              </label>
              <select
                value={newCourierId}
                onChange={(e) => setNewCourierId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
              >
                {couriers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                عدد العينات
              </label>
              <input
                type="number"
                min={1}
                value={sampleCount}
                onChange={(e) => setSampleCount(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm tabular-nums"
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                القيمة التقديرية (ر.ي)
              </label>
              <input
                type="number"
                min={0}
                value={estimatedValue}
                onChange={(e) => setEstimatedValue(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm tabular-nums"
                required
              />
            </div>
          </div>

          {!lockedCenterId && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                حالة البدء
              </label>
              <select
                value={initialStatus}
                onChange={(e) =>
                  setInitialStatus(e.target.value as 'requested' | 'picked_up')
                }
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
              >
                <option value="picked_up">تم الاستلام من المركز مباشرة</option>
                <option value="requested">طلب بانتظار الاستلام</option>
              </select>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700">
              ملاحظات
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="مثال: عينات كيمياء حيوية"
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={creating}
            className="w-full rounded-lg bg-[#0B6E63] px-4 py-3 text-sm font-semibold text-white hover:bg-[#09594f] disabled:opacity-50"
          >
            {creating ? 'جارٍ الإرسال...' : 'تأكيد وإرسال الإشعار'}
          </button>
        </form>
      </Drawer>
    </div>
  );
};
