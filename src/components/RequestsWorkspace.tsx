import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BellRing,
  Building2,
  Check,
  CheckCircle2,
  ChevronLeft,
  CircleDot,
  ClipboardList,
  Clock3,
  Download,
  FileText,
  FlaskConical,
  Loader2,
  MapPin,
  PackageCheck,
  Plus,
  RefreshCcw,
  Search,
  Send,
  ShieldCheck,
  Truck,
  Undo2,
  X,
  XCircle,
} from 'lucide-react';
import type {
  Courier,
  MedicalCenter,
  MovementAuditEntry,
  MovementStatus,
  SampleMovement,
  Sector,
  UserRole,
} from '../types.ts';
import { exportRequestsExcel } from '../utils/excelHelper.ts';
import { Drawer } from './Drawer.tsx';
import { EmptyState, KpiCard, Pill, PremiumCard, SectionHeading } from './ui/Premium.tsx';

type AdminTab =
  | 'overview'
  | 'requests'
  | 'reconciliation'
  | 'movements'
  | 'map'
  | 'vouchers'
  | 'centers';

interface RequestsWorkspaceProps {
  role: UserRole;
  adminTab: AdminTab;
  setAdminTab: (tab: AdminTab) => void;
  currentUserName: string;
  sectors: Sector[];
  centers: MedicalCenter[];
  couriers: Courier[];
  movements: SampleMovement[];
  isLoading: boolean;
  onRefresh: () => void;
  onCreateRequest: (payload: {
    centerId: string;
    sampleCount: number;
    notes: string;
    requestType: 'normal' | 'urgent';
  }) => Promise<void>;
  onAdvanceRequest: (id: string, expectedStatus: MovementStatus) => Promise<void>;
  onCancelRequest: (id: string, reason: string) => Promise<void>;
  onCorrectRequest: (id: string, status: MovementStatus, note?: string) => Promise<void>;
  onReassignCenter: (centerId: string, courierId: string) => Promise<void>;
  onOpenReport: () => void;
}

const STATUS_META: Record<
  string,
  { label: string; tone: 'slate' | 'gold' | 'blue' | 'brand' | 'green' | 'red'; short: string }
> = {
  requested: { label: 'بانتظار الاستلام', tone: 'gold', short: 'طلب جديد' },
  picked_up: { label: 'مستلم · متجه للمختبر', tone: 'blue', short: 'في الطريق' },
  delivered_to_lab: { label: 'في المختبر', tone: 'brand', short: 'بالمختبر' },
  returned_to_center: { label: 'مكتمل · تم الإرجاع', tone: 'green', short: 'مكتمل' },
  cancelled: { label: 'ملغي', tone: 'red', short: 'ملغي' },
};

const PIPELINE = [
  { key: 'requested', label: 'الطلب', icon: ClipboardList },
  { key: 'picked_up', label: 'الاستلام', icon: Truck },
  { key: 'delivered_to_lab', label: 'المختبر', icon: FlaskConical },
  { key: 'returned_to_center', label: 'الإرجاع', icon: PackageCheck },
];

const ACTION_LABEL: Record<string, string> = {
  requested: 'تأكيد الاستلام',
  picked_up: 'تسليم للمختبر',
  delivered_to_lab: 'استلام العينات',
};

const ROLE_TITLE: Record<UserRole, string> = {
  admin: 'مركز العمليات',
  supervisor: 'غرفة العمليات — القطاع',
  courier: 'مهماتي الميدانية',
  center: 'طلبات مركزي',
};

const toDate = (value?: string | null) => (value ? new Date(value) : null);
const fmtTime = (value?: string | null) => {
  const d = toDate(value);
  return d ? d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '—';
};
const fmtDate = (value?: string | null) => {
  const d = toDate(value);
  return d ? d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' }) : '—';
};
const minutesBetween = (from?: string, to?: string) => {
  if (!from || !to) return null;
  return Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000));
};
const isUrgent = (m: SampleMovement) => m.requestType === 'urgent';
const isOpen = (m: SampleMovement) =>
  m.status !== 'returned_to_center' && m.status !== 'cancelled';
const SLA_MINUTES = 90;

function minutesSince(value?: string) {
  if (!value) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
}

function slaState(m: SampleMovement) {
  if (!isOpen(m) || m.status !== 'requested') return 'none' as const;
  const limit = isUrgent(m) ? 30 : SLA_MINUTES;
  const elapsed = minutesSince(m.requestedAt);
  if (elapsed >= limit) return 'late' as const;
  if (elapsed >= limit * 0.75) return 'soon' as const;
  return 'safe' as const;
}

export const RequestsWorkspace: React.FC<RequestsWorkspaceProps> = ({
  role,
  adminTab,
  setAdminTab,
  currentUserName,
  sectors,
  centers,
  couriers,
  movements,
  isLoading,
  onRefresh,
  onCreateRequest,
  onAdvanceRequest,
  onCancelRequest,
  onCorrectRequest,
  onReassignCenter,
  onOpenReport,
}) => {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'normal' | 'urgent'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'completed' | 'cancelled'>('all');
  const [selected, setSelected] = useState<SampleMovement | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showCorrection, setShowCorrection] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [correctionStatus, setCorrectionStatus] = useState<MovementStatus>('requested');
  const [, setClockTick] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setClockTick((tick) => tick + 1), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const [correctionNote, setCorrectionNote] = useState('');
  const [form, setForm] = useState({
    centerId: centers?.[0]?.id ?? '',
    sampleCount: 1,
    notes: '',
    requestType: 'normal' as 'normal' | 'urgent',
  });

  const centerById = useMemo(() => new Map(centers.map((c) => [c.id, c])), [centers]);
  const courierById = useMemo(() => new Map(couriers.map((c) => [c.id, c])), [couriers]);
  const sectorById = useMemo(() => new Map(sectors.map((s) => [s.id, s])), [sectors]);

  const roleMovementIds = useMemo(() => {
    if (role === 'center') {
      const centerIds = centers.filter((c) => c.name === currentUserName || c.id === currentUserName).map((c) => c.id);
      return new Set(centerIds.length ? centerIds : [centers[0]?.id].filter(Boolean) as string[]);
    }
    if (role === 'courier') {
      const courier = couriers.find((c) => c.name === currentUserName || c.id === currentUserName);
      return new Set(courier?.assignedCenterIds ?? []);
    }
    if (role === 'supervisor') {
      const sector = sectors.find((s) => s.supervisorName === currentUserName || s.id === currentUserName);
      const ids = centers.filter((c) => c.sectorId === sector?.id).map((c) => c.id);
      return new Set(ids.length ? ids : [sectors[0]?.id].filter(Boolean) as string[]);
    }
    return null;
  }, [role, centers, couriers, sectors, currentUserName]);

  const scoped = useMemo(
    () => movements.filter((m) => !roleMovementIds || roleMovementIds.has(m.centerId)),
    [movements, roleMovementIds]
  );

  const supervisorSectorId = useMemo(
    () => sectors.find((s) => s.supervisorName === currentUserName || s.id === currentUserName)?.id,
    [sectors, currentUserName]
  );

  const urgentOpen = scoped.filter((m) => isUrgent(m) && m.status === 'requested').length;
  const openRequests = scoped.filter(isOpen).length;
  const inLab = scoped.filter((m) => m.status === 'delivered_to_lab').length;
  const completed = scoped.filter((m) => m.status === 'returned_to_center').length;
  const late = scoped.filter((m) => slaState(m) === 'late').length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scoped
      .filter((m) => {
        if (statusFilter === 'open' && !isOpen(m)) return false;
        if (statusFilter === 'completed' && m.status !== 'returned_to_center') return false;
        if (statusFilter === 'cancelled' && m.status !== 'cancelled') return false;
        if (typeFilter !== 'all' && m.requestType !== typeFilter) return false;
        if (!q) return true;
        const center = centerById.get(m.centerId);
        const courier = courierById.get(m.courierId);
        return [m.batchCode, m.id, center?.name, courier?.name, m.notes]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q));
      })
      .sort((a, b) => {
        const urgency = Number(isUrgent(b)) - Number(isUrgent(a));
        if (urgency) return urgency;
        const openDiff = Number(isOpen(b)) - Number(isOpen(a));
        if (openDiff) return openDiff;
        return (b.requestedAt ?? '').localeCompare(a.requestedAt ?? '');
      });
  }, [scoped, query, typeFilter, statusFilter, centerById, courierById]);

  const stageIndex = (m: SampleMovement) => {
    if (m.status === 'requested') return 0;
    if (m.status === 'picked_up') return 1;
    if (m.status === 'delivered_to_lab') return 2;
    return 3;
  };

  const handleAction = async (m: SampleMovement) => {
    setBusyId(m.id);
    setError('');
    try {
      await onAdvanceRequest(m.id, m.status);
      const nextStatus =
        m.status === 'requested'
          ? 'picked_up'
          : m.status === 'picked_up'
          ? 'delivered_to_lab'
          : 'returned_to_center';
      setSelected((prev) => (prev?.id === m.id ? { ...prev, status: nextStatus } : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تنفيذ الإجراء');
    } finally {
      setBusyId(null);
    }
  };

  const handleCancel = async (m: SampleMovement) => {
    const reason = window.prompt('سبب إلغاء الطلب (يُسجّل في سجل التدقيق):');
    if (!reason || !reason.trim()) return;
    setBusyId(m.id);
    setError('');
    try {
      await onCancelRequest(m.id, reason.trim());
      setSelected(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر إلغاء الطلب');
    } finally {
      setBusyId(null);
    }
  };

  const handleCorrect = async () => {
    if (!selected) return;
    setBusyId(selected.id);
    setError('');
    try {
      await onCorrectRequest(
        selected.id,
        correctionStatus,
        correctionNote.trim() || 'تصحيح حالة من لوحة العمليات'
      );
      setShowCorrection(false);
      setCorrectionNote('');
      setSelected(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تصحيح الحالة');
    } finally {
      setBusyId(null);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.centerId || form.sampleCount < 1) return;
    setBusyId('create');
    setError('');
    try {
      await onCreateRequest(form);
      setShowCreate(false);
      setForm((f) => ({ ...f, sampleCount: 1, notes: '', requestType: 'normal' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إنشاء الطلب');
    } finally {
      setBusyId(null);
    }
  };

  const handleExport = () => {
    exportRequestsExcel(visible, centers, couriers, sectors, currentPeriodLabel());
  };

  const canCorrect = role === 'admin' || role === 'supervisor';
  const canCancel = role === 'center' || canCorrect;
  const allowCreate = role === 'center' || role === 'admin' || role === 'supervisor';

  return (
    <div className="space-y-6 fade-up">
      <div className="glass-card relative overflow-hidden !p-0">
        <div className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-[#c8a45d]/12 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-20 h-72 w-72 rounded-full bg-[#0b6e63]/12 blur-3xl" />
        <div className="relative grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.45fr_1fr] lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="chip chip-gold">
                <CircleDot className="h-3 w-3" />
                التشغيل المباشر
              </span>
              <span className="text-[11px] font-semibold text-slate-500">{currentPeriodLabel()}</span>
            </div>
            <h2 className="mt-3 font-display text-2xl font-black leading-tight text-[#0b1b2b] sm:text-3xl">
              {ROLE_TITLE[role]}
            </h2>
            <p className="hint-text mt-2 max-w-xl">
              {role === 'courier'
                ? 'مهماتك مُسندة إلى مركزك — اضغط الزر المناسب لكل مرحلة.'
                : role === 'center'
                ? 'أنشئ الطلب وتابع حالته حتى الإرجاع.'
                : role === 'supervisor'
                ? 'تابع قطاعك والأداء وإعادة الإسناد.'
                : 'طلبات ومهمات وتنبيهات كل القطاعات في مكان واحد.'}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {allowCreate && (
                <button className="btn-lux" onClick={() => setShowCreate(true)} type="button">
                  <Plus className="h-4 w-4" />
                  طلب عينة جديد
                </button>
              )}
              <button className="btn-outline" onClick={onRefresh} type="button">
                <RefreshCcw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                تحديث
              </button>
              {role === 'admin' && (
                <>
                  <button className="btn-outline" onClick={handleExport} type="button">
                    <Download className="h-4 w-4" />
                    تصدير الطلبات
                  </button>
                  <button className="btn-outline" onClick={onOpenReport} type="button">
                    <FileText className="h-4 w-4" />
                    تقرير PDF للطلبات
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
            <KpiCard label="طلبات مفتوحة" value={openRequests} icon={<ClipboardList className="h-4 w-4" />} />
            <KpiCard label="عاجلة بانتظار الاستلام" value={urgentOpen} icon={<BellRing className="h-4 w-4" />} tone="gold" />
            <KpiCard label="بالمختبر" value={inLab} icon={<FlaskConical className="h-4 w-4" />} tone="blue" />
            <KpiCard label="متأخرة عن SLA" value={late} icon={<AlertTriangle className="h-4 w-4" />} tone="red" />
          </div>
        </div>

        <div className="relative border-t border-slate-200/70 bg-white/45 px-6 py-4 sm:px-8">
          <div className="flex items-start gap-2">
            {PIPELINE.map((step, i) => {
              const activeIndex = Math.max(
                ...scoped.filter(isOpen).map((m) => stageIndex(m)),
                -1
              );
              const active = i <= activeIndex;
              const Icon = step.icon;
              return (
                <div className="pipeline-step text-center" key={step.key}>
                  <span className={`pipeline-dot mx-auto ${active ? 'active' : ''}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className={`mt-2 text-[10.5px] font-bold ${active ? 'text-[#07564e]' : 'text-slate-400'}`}>
                    {step.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">
          <AlertTriangle className="h-4 w-4" />
          {error}
          <button className="mr-auto text-red-500 hover:text-red-700" onClick={() => setError('')} type="button">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <PremiumCard>
          <SectionHeading
            eyebrow="قائمة العمل"
            title="طلبات العينات"
            description="مرتبة بالعاجل أولاً — انقر على أي طلب لعرض سجله الزمني الكامل."
            action={
              <div className="flex flex-wrap items-center gap-2">
                <label className="relative">
                  <Search className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    className="input-lux w-44 pr-8"
                    placeholder="بحث برقم الطلب أو المركز..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <select
                  className="input-lux w-auto"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
                >
                  <option value="all">كل الأنواع</option>
                  <option value="urgent">عاجل</option>
                  <option value="normal">عادي</option>
                </select>
                {role === 'admin' && (
                  <select
                    className="input-lux w-auto"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                  >
                    <option value="all">كل الحالات</option>
                    <option value="open">مفتوحة</option>
                    <option value="completed">مكتملة</option>
                    <option value="cancelled">ملغية</option>
                  </select>
                )}
              </div>
            }
          />

          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200/70">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-xs text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                جاري تحميل الطلبات...
              </div>
            ) : visible.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={<ClipboardList className="h-5 w-5" />}
                  title="لا توجد طلبات مطابقة"
                  description="ابدأ بإنشاء أول طلب عينة أو غيّر عوامل التصفية."
                />
              </div>
            ) : (
              <div className="scroll-thin max-h-[560px] overflow-y-auto">
                <table className="w-full text-right text-xs">
                  <thead className="sticky top-0 z-10 bg-[#f7f9f8] text-[10.5px] font-bold text-slate-500">
                    <tr>
                      <th className="px-4 py-3">الطلب</th>
                      <th className="px-4 py-3">المركز / المراسل</th>
                      <th className="px-4 py-3">النوع</th>
                      <th className="px-4 py-3">الحالة</th>
                      <th className="px-4 py-3">الوقت</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visible.map((m) => {
                      const c = centerById.get(m.centerId);
                      const cr = courierById.get(m.courierId);
                      const meta = STATUS_META[m.status] ?? STATUS_META.requested;
                      const sla = slaState(m);
                      const nextAction = ACTION_LABEL[m.status];
                      return (
                        <tr
                          key={m.id}
                          className={`transition-colors hover:bg-[#0b6e63]/[0.025] ${sla === 'late' ? 'bg-red-50/40' : ''}`}
                        >
                          <td className="px-4 py-3">
                            <div className="font-mono-num font-bold text-slate-800">{m.batchCode}</div>
                            <div className="mt-0.5 text-[10px] text-slate-400">{fmtDate(m.requestedAt)} · {fmtTime(m.requestedAt)}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-700">{c?.name ?? '—'}</div>
                            <div className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-400">
                              <Truck className="h-3 w-3" />
                              {cr?.name ?? 'بانتظار الإسناد'}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Pill tone={isUrgent(m) ? 'gold' : 'slate'}>
                              {isUrgent(m) ? 'عاجل' : 'عادي'}
                            </Pill>
                            {sla !== 'none' && (
                              <div className="mt-1.5">
                                <Pill tone={sla === 'late' ? 'red' : sla === 'soon' ? 'gold' : 'green'}>
                                  {sla === 'late' ? 'تجاوز SLA' : sla === 'soon' ? 'قارب المهلة' : 'ضمن المهلة'}
                                </Pill>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3"><Pill tone={meta.tone}>{meta.label}</Pill></td>
                          <td className="px-4 py-3 text-[10.5px] text-slate-500" dir="ltr">
                            {fmtTime(m.pickedUpAt)} → {fmtTime(m.deliveredToLabAt)} → {fmtTime(m.returnedAt)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1.5">
                              {nextAction && role === 'courier' && (
                                <button
                                  className="btn-lux !px-3 !py-1.5 !text-[10.5px]"
                                  disabled={busyId === m.id}
                                  onClick={() => handleAction(m)}
                                  type="button"
                                >
                                  {busyId === m.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                  {nextAction}
                                </button>
                              )}
                              <button
                                className="btn-outline !px-2.5 !py-1.5"
                                onClick={() => {
                                  setSelected(m);
                                  setCorrectionStatus(m.status);
                                }}
                                type="button"
                                aria-label="تفاصيل"
                              >
                                <ChevronLeft className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </PremiumCard>

        <div className="space-y-4">
          {role === 'courier' && (
            <PremiumCard>
              <SectionHeading eyebrow="إرشاد الميدان" title="زر واحد لكل مرحلة" />
              <div className="mt-4 space-y-3">
                {PIPELINE.map((s, i) => (
                  <div className="flex items-center gap-3 rounded-xl bg-slate-50/80 p-3" key={s.key}>
                    <span className={`pipeline-dot ${i === 0 ? 'active' : ''}`}><s.icon className="h-3.5 w-3.5" /></span>
                    <div>
                      <div className="text-xs font-bold text-slate-700">{s.label}</div>
                      <div className="text-[10px] text-slate-400">{ACTION_LABEL[s.key] ?? 'اكتملت المهمة'}</div>
                    </div>
                  </div>
                ))}
                <p className="rounded-xl bg-[#c8a45d]/10 p-3 text-[11px] leading-relaxed text-[#7a5a1e]">
                  كل نقرة تُسجّل توقيت الخادم تلقائياً.
                </p>
              </div>
            </PremiumCard>
          )}

          {role === 'center' && (
            <PremiumCard>
              <SectionHeading eyebrow="اختصار" title="طلب سريع" description="زر واحد يفتح نموذج الطلب." />
              <button className="btn-gold mt-4 w-full" onClick={() => setShowCreate(true)} type="button">
                <Plus className="h-4 w-4" />
                إنشاء طلب عينة
              </button>
              <div className="mt-4 space-y-2 text-[11px] text-slate-500">
                <div className="flex items-center gap-2"><Clock3 className="h-3.5 w-3.5 text-[#0b6e63]" /> العادي: إشعار فوري + SMS بعد دقيقتين</div>
                <div className="flex items-center gap-2"><BellRing className="h-3.5 w-3.5 text-[#c8a45d]" /> العاجل: إشعار ورسالة فوريتان</div>
              </div>
            </PremiumCard>
          )}

          {(role === 'admin' || role === 'supervisor') && (
            <PremiumCard>
              <SectionHeading eyebrow="الإشراف" title={role === 'admin' ? 'إسناد المراكز' : 'قطاعك'} />
              <div className="mt-4 space-y-2">
                {(role === 'admin' ? centers : centers.filter((c) => c.sectorId === supervisorSectorId)).map((center) => (
                  <label className="flex items-center gap-2 rounded-xl border border-slate-100 bg-white/70 p-2.5" key={center.id}>
                    <Building2 className="h-4 w-4 flex-shrink-0 text-[#0b6e63]" />
                    <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-700">{center.name}</span>
                    <select
                      className="input-lux !w-auto !py-1 !text-[10.5px]"
                      value={center.primaryCourierId}
                      onChange={async (e) => {
                        setBusyId(center.id);
                        setError('');
                        try {
                          await onReassignCenter(center.id, e.target.value);
                        } catch (err) {
                          setError(err instanceof Error ? err.message : 'تعذر إعادة الإسناد');
                        } finally {
                          setBusyId(null);
                        }
                      }}
                      disabled={busyId === center.id}
                    >
                      {couriers.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <p className="mt-3 text-[10.5px] leading-relaxed text-slate-400">
                إعادة الإسناد تنقل كل الطلبات المفتوحة وتُحدّث الإشعارات تلقائياً.
              </p>
            </PremiumCard>
          )}

          <PremiumCard>
            <SectionHeading eyebrow="الملخص" title="مؤشرات سريعة" />
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">إجمالي الطلبات</span>
                <span className="font-mono-num font-bold text-slate-800">{scoped.length}</span>
              </div>
              <div className="soft-divider" />
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">مكتملة</span>
                <span className="font-mono-num font-bold text-emerald-700">{completed}</span>
              </div>
              <div className="soft-divider" />
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">ملغية</span>
                <span className="font-mono-num font-bold text-red-600">{scoped.filter((m) => m.status === 'cancelled').length}</span>
              </div>
              <div className="soft-divider" />
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">المراكز النشطة</span>
                <span className="font-mono-num font-bold text-slate-800">{centers.length}</span>
              </div>
            </div>
          </PremiumCard>
        </div>
      </div>

      <Drawer
        open={!!selected}
        onClose={() => { setSelected(null); setShowCorrection(false); }}
        title={selected ? `طلب ${selected.batchCode}` : ''}
        subtitle={selected ? `${fmtDate(selected.requestedAt)} · ${fmtTime(selected.requestedAt)}` : ''}
      >
        {selected && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={STATUS_META[selected.status]?.tone}>{STATUS_META[selected.status]?.label}</Pill>
              <Pill tone={isUrgent(selected) ? 'gold' : 'slate'}>{isUrgent(selected) ? 'عاجل' : 'عادي'}</Pill>
              {slaState(selected) === 'late' && <Pill tone="red">تجاوز المهلة</Pill>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <InfoTile icon={<Building2 className="h-4 w-4" />} label="المركز" value={centerById.get(selected.centerId)?.name ?? '—'} />
              <InfoTile icon={<Truck className="h-4 w-4" />} label="المراسل" value={courierById.get(selected.courierId)?.name ?? '—'} />
              <InfoTile icon={<PackageCheck className="h-4 w-4" />} label="عدد العينات" value={String(selected.sampleCount)} />
              <InfoTile icon={<MapPin className="h-4 w-4" />} label="القطاع" value={sectorById.get(centerById.get(selected.centerId)?.sectorId ?? 'north')?.name ?? '—'} />
            </div>

            {selected.notes && (
              <div className="rounded-xl bg-slate-50 p-4 text-xs leading-relaxed text-slate-600">{selected.notes}</div>
            )}

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <TimeTile label="الطلب" value={selected.requestedAt} />
              <TimeTile label="الاستلام" value={selected.pickedUpAt} />
              <TimeTile label="المختبر" value={selected.deliveredToLabAt} />
              <TimeTile label="الإرجاع" value={selected.returnedAt} />
            </div>

            <PremiumCard padded={false}>
              <div className="p-4">
                <SectionHeading eyebrow="زمن الرحلة" title="الفواصل الزمنية" />
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <Interval label="طلب → استلام" value={minutesBetween(selected.requestedAt, selected.pickedUpAt)} />
                  <Interval label="استلام → مختبر" value={minutesBetween(selected.pickedUpAt, selected.deliveredToLabAt)} />
                  <Interval label="مختبر → إرجاع" value={minutesBetween(selected.deliveredToLabAt, selected.returnedAt)} />
                </div>
              </div>
            </PremiumCard>

            <div>
              <SectionHeading eyebrow="السجل الزمني" title="كل خطوة موثّقة" />
              <div className="relative mt-4 space-y-4 pr-8">
                <div className="timeline-rail" />
                {(selected.auditTrail ?? []).map((a, i) => (
                  <AuditRow
                    key={`${a.at}-${i}`}
                    entry={a}
                    done={i === (selected.auditTrail?.length ?? 0) - 1}
                  />
                ))}
                {!selected.auditTrail?.length && (
                  <p className="text-xs text-slate-400">لا يوجد سجل تدقيق لهذا الطلب.</p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              {role === 'courier' && ACTION_LABEL[selected.status] && (
                <button className="btn-lux" disabled={busyId === selected.id} onClick={() => handleAction(selected)} type="button">
                  {busyId === selected.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {ACTION_LABEL[selected.status]}
                </button>
              )}
              {canCancel && isOpen(selected) && (
                <button className="btn-outline !text-red-600" disabled={busyId === selected.id} onClick={() => handleCancel(selected)} type="button">
                  <XCircle className="h-4 w-4" />
                  إلغاء الطلب
                </button>
              )}
              {canCorrect && (
                <button className="btn-outline" onClick={() => setShowCorrection(true)} type="button">
                  <Undo2 className="h-4 w-4" />
                  تصحيح الحالة
                </button>
              )}
            </div>

            {showCorrection && (
              <div className="rounded-xl border border-[#c8a45d]/30 bg-[#fdf9f0] p-4">
                <SectionHeading eyebrow="تصحيح آمن" title="اختر الحالة الصحيحة" description="يُسجّل التصحيح في سجل التدقيق مع اسمك." />
                <div className="mt-3 flex flex-wrap gap-2">
                  {Object.entries(STATUS_META).map(([key, meta]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setCorrectionStatus(key as MovementStatus)}
                      className={`chip ${correctionStatus === key ? 'chip-teal ring-2 ring-[#0b6e63]/30' : 'chip-slate'}`}
                    >
                      {meta.label}
                    </button>
                  ))}
                </div>
                <label className="mt-4 block">
                  <span className="mb-1.5 block text-xs font-bold text-slate-700">سبب التصحيح (اختياري)</span>
                  <textarea
                    className="input-lux min-h-16 resize-none"
                    value={correctionNote}
                    onChange={(e) => setCorrectionNote(e.target.value)}
                    placeholder="مثال: النقرة السابقة كانت خاطئة..."
                  />
                </label>
                <div className="mt-4 flex gap-2">
                  <button className="btn-lux" disabled={busyId === selected.id} onClick={handleCorrect} type="button">
                    {busyId === selected.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                    تأكيد التصحيح
                  </button>
                  <button className="btn-outline" onClick={() => setShowCorrection(false)} type="button">إلغاء</button>
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <form className="glass-card w-full max-w-lg !p-0 fade-up" onSubmit={handleCreate}>
            <div className="brand-gradient !rounded-t-2xl px-6 py-5 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-bold text-white/70">طلب جديد</div>
                  <h3 className="mt-1 font-display text-lg font-extrabold">إنشاء طلب عينة</h3>
                </div>
                <button type="button" onClick={() => setShowCreate(false)} className="rounded-lg bg-white/10 p-2 hover:bg-white/20" aria-label="إغلاق">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="space-y-4 p-6">
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-slate-700">المركز</span>
                <select className="input-lux" value={form.centerId} onChange={(e) => setForm({ ...form, centerId: e.target.value })} required>
                  {centers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-slate-700">عدد العينات</span>
                  <input className="input-lux font-mono-num" type="number" min={1} max={99} value={form.sampleCount} onChange={(e) => setForm({ ...form, sampleCount: Number(e.target.value) })} required />
                </label>
                <div>
                  <span className="mb-1.5 block text-xs font-bold text-slate-700">الأولوية</span>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setForm({ ...form, requestType: 'normal' })} className={`chip flex-1 justify-center py-2 ${form.requestType === 'normal' ? 'chip-teal ring-2 ring-[#0b6e63]/25' : 'chip-slate'}`}>
                      عادي
                    </button>
                    <button type="button" onClick={() => setForm({ ...form, requestType: 'urgent' })} className={`chip flex-1 justify-center py-2 ${form.requestType === 'urgent' ? 'chip-gold ring-2 ring-[#c8a45d]/40' : 'chip-slate'}`}>
                      عاجل
                    </button>
                  </div>
                </div>
              </div>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-slate-700">ملاحظات (اختياري)</span>
                <textarea className="input-lux min-h-20 resize-none" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="tipo تحليل، اسم المريض..." />
              </label>
              {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
              <div className="flex gap-2 border-t border-slate-100 pt-4">
                <button className="btn-lux flex-1" disabled={busyId === 'create'} type="submit">
                  {busyId === 'create' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  إرسال الطلب
                </button>
                <button className="btn-outline" type="button" onClick={() => setShowCreate(false)}>إلغاء</button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

function currentPeriodLabel() {
  const now = new Date();
  const months = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  return `${months[now.getMonth()]} ${now.getFullYear()}`;
}

const InfoTile: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <div className="rounded-xl border border-slate-100 bg-white/70 p-3">
    <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400">{icon}{label}</div>
    <div className="mt-1.5 truncate text-xs font-bold text-slate-800">{value}</div>
  </div>
);

const TimeTile: React.FC<{ label: string; value?: string }> = ({ label, value }) => (
  <div className="rounded-xl bg-slate-50 p-3 text-center">
    <div className="text-[10px] font-semibold text-slate-400">{label}</div>
    <div className="mt-1 font-mono-num text-xs font-bold text-slate-800">{fmtTime(value)}</div>
    <div className="text-[9px] text-slate-400">{fmtDate(value)}</div>
  </div>
);

const Interval: React.FC<{ label: string; value: number | null }> = ({ label, value }) => (
  <div className="rounded-xl border border-slate-100 p-2.5">
    <div className="font-mono-num text-sm font-extrabold text-[#07564e]">{value === null ? '—' : `${value}د`}</div>
    <div className="mt-0.5 text-[9.5px] text-slate-400">{label}</div>
  </div>
);

const AuditRow: React.FC<{ entry: MovementAuditEntry; done: boolean }> = ({ entry, done }) => (
  <div className="flex items-start gap-3">
    <span className={`timeline-node ${done ? 'done' : ''}`}>
      {entry.action === 'cancelled' ? <XCircle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
    </span>
    <div className="min-w-0 flex-1 rounded-xl bg-white/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold text-slate-800">{entry.note || entry.action}</span>
        <span className="font-mono-num text-[10px] text-slate-400" dir="ltr">{fmtTime(entry.at)}</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-slate-400">
        <span>{entry.byName}</span>
        <span>·</span>
        <span>{entry.byRole}</span>
      </div>
    </div>
  </div>
);
