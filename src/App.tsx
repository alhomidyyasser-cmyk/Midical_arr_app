import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Building2,
  ClipboardCheck,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  MapPin,
  Menu,
  Plus,
  RefreshCcw,
  RotateCcw,
  ScanLine,
  ShieldCheck,
  Truck,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { Drawer } from './components/Drawer.tsx';
import { LiveFleetMapView } from './components/LiveFleetMapView.tsx';
import { NotificationCenter } from './components/NotificationCenter.tsx';
import { OverviewDashboard } from './components/OverviewDashboard.tsx';
import { PrintableReportModal } from './components/PrintableReportModal.tsx';
import { QuickVoucherForm } from './components/QuickVoucherForm.tsx';
import { RequestsWorkspace } from './components/RequestsWorkspace.tsx';
import {
  CenterPortal,
  CourierPortal,
  SupervisorPortal,
} from './components/RolePortals.tsx';
import { SampleMovementsView } from './components/SampleMovementsView.tsx';
import { QrScannerModal } from './components/SampleQrModal.tsx';
import { SmartReconciliationView } from './components/SmartReconciliationView.tsx';
import { VouchersAndTargetsView } from './components/VouchersAndTargetsView.tsx';
import type {
  AppState,
  GapAttribution,
  MedicalCenter,
  MovementStatus,
  ReportMode,
  RequestType,
  SampleMovement,
  UserRole,
  VoucherType,
} from './types.ts';
import {
  evaluateCouriers,
  formatCurrency,
  reconcileCenters,
} from './utils/calculations.ts';
import type { ParsedLabImportRow } from './utils/excelHelper.ts';

type AdminTab =
  | 'overview'
  | 'requests'
  | 'reconciliation'
  | 'movements'
  | 'map'
  | 'vouchers'
  | 'centers';

export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole>('admin');
  const [adminTab, setAdminTab] = useState<AdminTab>('requests');
  const [portalView, setPortalView] = useState<'current' | 'requests'>('requests');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showQuickVoucherDrawer, setShowQuickVoucherDrawer] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const [mapsApiKey, setMapsApiKey] = useState<string>(
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  );
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [reportModalState, setReportModalState] = useState<{
    open: boolean;
    mode: ReportMode;
  }>({ open: false, mode: 'commissions' });

  const [showAddCenterDrawer, setShowAddCenterDrawer] = useState(false);
  const [newCenterName, setNewCenterName] = useState('');
  const [newCenterSector, setNewCenterSector] =
    useState<MedicalCenter['sectorId']>('north');
  const [newCenterAddress, setNewCenterAddress] = useState('');
  const [newCenterPhone, setNewCenterPhone] = useState('');
  const [newCenterCourier, setNewCenterCourier] = useState('');
  const [newCenterAvg, setNewCenterAvg] = useState('250000');

  useEffect(() => {
    const onQuotaExceeded = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
  }, []);

  useEffect(() => {
    fetch('/api/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg: { mapsApiKey?: string } | null) => {
        if (cfg?.mapsApiKey) setMapsApiKey(cfg.mapsApiKey);
      })
      .catch(() => {
      });
  }, []);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('/api/state');
      if (!res.ok) throw new Error('تعذر الاتصال بالخادم');
      const data = (await res.json()) as AppState;
      setState(data);
      setError(null);
      if (!newCenterCourier && data.couriers.length > 0) {
        setNewCenterCourier(data.couriers[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطأ في تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, [newCenterCourier]);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  const reconciliations = useMemo(() => {
    if (!state) return [];
    return reconcileCenters(
      state.centers,
      state.sectors,
      state.couriers,
      state.vouchers,
      state.movements,
      state.labRows,
      state.gapAttributions
    );
  }, [state]);

  const evaluations = useMemo(() => {
    if (!state) return [];
    return evaluateCouriers(
      state.couriers,
      state.sectors,
      state.centers,
      state.vouchers,
      state.movements,
      reconciliations,
      state.gapAttributions
    );
  }, [state, reconciliations]);

  const roleNotifications = useMemo(
    () => state?.notifications.filter((n) => n.recipientRole === role) ?? [],
    [state, role]
  );

  const handleAdvanceMovement = async (
    id: string,
    expectedStatus?: MovementStatus
  ) => {
    const res = await fetch(`/api/movements/${id}/advance`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedStatus, byRole: role }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'تعذر تحديث الحركة');
    setState(data.state);
  };

  const handleScanQrCode = async (
    code: string
  ): Promise<{
    alreadyCompleted?: boolean;
    message: string;
    movement: SampleMovement;
  }> => {
    const res = await fetch('/api/movements/scan-qr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'تعذر قراءة رمز العينة');
    if (data.state) setState(data.state);
    return {
      alreadyCompleted: data.alreadyCompleted,
      message: data.message,
      movement: data.movement,
    };
  };

  const handleCreateMovement = async (payload: {
    centerId: string;
    courierId?: string;
    sampleCount: number;
    estimatedValue: number;
    notes?: string;
    initialStatus?: 'requested' | 'picked_up';
  }) => {
    const res = await fetch('/api/movements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'تعذر إنشاء الحركة');
    setState(data.state);
  };

  const handleCreateRequest = async (payload: {
    centerId: string;
    requestType: RequestType;
    notes?: string;
    sampleCount?: number;
    estimatedValue?: number;
  }) => {
    const res = await fetch('/api/movements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        centerId: payload.centerId,
        requestType: payload.requestType,
        notes: payload.notes,
        sampleCount: payload.sampleCount ?? 1,
        estimatedValue: payload.estimatedValue ?? 0,
        initialStatus: 'requested',
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'تعذر إرسال طلب المراسل');
    setState(data.state);
  };

  const handleAdvanceRequest = async (
    id: string,
    expectedStatus: MovementStatus,
    byRole: UserRole = role
  ) => {
    const res = await fetch(`/api/movements/${id}/advance`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedStatus, byRole }),
    });
    const data = await res.json();
    if (data.state) setState(data.state);
    if (!res.ok) throw new Error(data.error || 'تعذر تحديث الطلب');
  };

  const handleCancelRequest = async (
    id: string,
    reason: string,
    byRole: UserRole
  ) => {
    const res = await fetch(`/api/movements/${id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason, byRole }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'تعذر إلغاء الطلب');
    setState(data.state);
  };

  const handleCorrectRequest = async (
    id: string,
    status: MovementStatus,
    note: string,
    byRole: UserRole
  ) => {
    const res = await fetch(`/api/movements/${id}/correct`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, note, byRole }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'تعذر تصحيح الطلب');
    setState(data.state);
  };

  const handleReassignCenter = async (centerId: string, courierId: string) => {
    const res = await fetch(`/api/centers/${centerId}/courier`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courierId, byRole: role }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'تعذر تغيير إسناد المركز');
    setState(data.state);
  };

  const handleCreateVoucher = async (payload: {
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
  }) => {
    const res = await fetch('/api/vouchers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'تعذر تسجيل السند');
    setState(data.state);
  };

  const handleVoucherDecision = async (
    voucherId: string,
    decision: 'approved_as_deferred' | 'suspended' | 'rejected'
  ) => {
    const res = await fetch(`/api/vouchers/${voucherId}/decision`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'تعذر حفظ القرار');
    setState(data.state);
  };

  const handleImportLabRows = async (
    rows: ParsedLabImportRow[],
    replaceExisting: boolean
  ) => {
    const res = await fetch('/api/lab-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows,
        replaceExisting,
        periodLabel: state?.currentPeriod,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'تعذر استيراد تقرير المختبر');
    setState(data.state);
  };

  const handleResolveGap = async (payload: {
    centerId: string;
    courierId: string;
    amount: number;
    resolutionType: GapAttribution['resolutionType'];
    note: string;
  }) => {
    const res = await fetch('/api/reconciliation/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'تعذر تسوية الفجوة');
    setState(data.state);
  };

  const handleUpdateCourierTarget = async (
    courierId: string,
    regionAvg: number,
    growthTargetPct: number
  ) => {
    const res = await fetch(`/api/couriers/${courierId}/target`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ regionAvg, growthTargetPct }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'تعذر تحديث التارجت');
    setState(data.state);
  };

  const handleAddCenter = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/centers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newCenterName,
        sectorId: newCenterSector,
        address: newCenterAddress,
        phone: newCenterPhone,
        primaryCourierId: newCenterCourier,
        monthlyAvgRevenue: Number(newCenterAvg) || 200_000,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setState(data.state);
      setShowAddCenterDrawer(false);
      setNewCenterName('');
      setNewCenterAddress('');
      setNewCenterPhone('');
    }
  };

  const handleResetDemo = async () => {
    const res = await fetch('/api/reset-demo', { method: 'POST' });
    const data = await res.json();
    if (res.ok) setState(data.state);
  };

  const handleMarkNotificationRead = async (id: string) => {
    const res = await fetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
    if (!res.ok) return;
    const data = await res.json();
    setState(data.state);
  };

  const handleMarkAllNotificationsRead = async () => {
    const res = await fetch('/api/notifications/read-all', { method: 'PATCH' });
    if (!res.ok) return;
    const data = await res.json();
    setState(data.state);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-transparent text-sm text-slate-600">
        جارٍ تحميل النظام...
      </div>
    );
  }

  if (error || !state) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-transparent p-6 text-center">
        <div className="text-base font-bold text-red-700">
          {error || 'تعذر تحميل البيانات'}
        </div>
        <button
          type="button"
          onClick={fetchState}
          className="rounded-lg bg-[#0B6E63] px-4 py-2 text-xs font-semibold text-white"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  const showingRequests =
    role === 'admin' ? adminTab === 'requests' : portalView === 'requests';

  const currentUserName =
    role === 'admin'
      ? 'الإدارة'
      : role === 'supervisor'
      ? state.sectors[0]?.supervisorName ?? ''
      : role === 'courier'
      ? state.couriers[0]?.name ?? ''
      : state.centers[0]?.name ?? '';

  const currentCourierId =
    role === 'courier'
      ? state.couriers.find((c) => c.name === currentUserName)?.id
      : undefined;

  const requestsWorkspaceProps = {
    role,
    adminTab,
    setAdminTab,
    currentUserName,
    sectors: state.sectors,
    centers: state.centers,
    couriers: state.couriers,
    movements: state.movements,
    isLoading: loading,
    onRefresh: fetchState,
    onCreateRequest: handleCreateRequest,
    onAdvanceRequest: handleAdvanceRequest,
    onCancelRequest: (id: string, reason: string) =>
      handleCancelRequest(id, reason, role),
    onCorrectRequest: (id: string, status: MovementStatus, note?: string) =>
      handleCorrectRequest(id, status, note ?? 'تصحيح حالة', role),
    onReassignCenter: handleReassignCenter,
    onOpenReport: () => setReportModalState({ open: true, mode: 'requests' }),
  };

  const pageTitle = showingRequests
    ? 'طلبات العينات'
    : role === 'admin'
      ? adminTab === 'overview'
        ? 'لوحة القيادة'
        : adminTab === 'reconciliation'
        ? 'المطابقة الذكية'
        : adminTab === 'movements'
        ? 'حركة العينات'
        : adminTab === 'map'
        ? 'الخريطة الحية'
        : adminTab === 'vouchers'
        ? 'السندات والعمولات'
        : 'المراكز الطبية'
      : role === 'supervisor'
      ? 'بوابة المشرف'
      : role === 'courier'
      ? 'بوابة المراسل'
      : 'بوابة المركز';

  const roleLabels: Record<UserRole, { label: string; icon: React.ReactNode }> = {
    admin: { label: 'الإدارة والمالية', icon: <ShieldCheck className="h-4 w-4" /> },
    supervisor: { label: 'مندوب القطاع', icon: <Users className="h-4 w-4" /> },
    courier: { label: 'المراسل الميداني', icon: <UserCheck className="h-4 w-4" /> },
    center: { label: 'المركز الطبي', icon: <Building2 className="h-4 w-4" /> },
  };

  const gapAndReviewCount = reconciliations.filter(
    (r) => r.status === 'gap' || r.status === 'needs_review'
  ).length;

  const adminNavItems = [
    {
      key: 'overview' as const,
      label: 'لوحة القيادة',
      icon: <LayoutDashboard className="h-4 w-4" />,
    },
    {
      key: 'requests' as const,
      label: 'طلبات العينات',
      icon: <ClipboardList className="h-4 w-4" />,
    },
    {
      key: 'reconciliation' as const,
      label: `المطابقة الذكية (${gapAndReviewCount})`,
      icon: <FileSpreadsheet className="h-4 w-4" />,
    },
    {
      key: 'movements' as const,
      label: 'حركة العينات',
      icon: <Truck className="h-4 w-4" />,
    },
    {
      key: 'map' as const,
      label: 'الخريطة الحية',
      icon: <MapPin className="h-4 w-4" />,
    },
    {
      key: 'vouchers' as const,
      label: 'السندات والتارجت',
      icon: <ClipboardCheck className="h-4 w-4" />,
    },
    {
      key: 'centers' as const,
      label: 'المراكز الطبية',
      icon: <Building2 className="h-4 w-4" />,
    },
  ];

  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      {gmpQuotaExceeded && (
        <div
          dir="ltr"
          className="no-print bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm"
        >
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      <div className={`flex min-h-screen ${reportModalState.open ? 'no-print' : ''}`}>
        <aside className="no-print hidden w-64 shrink-0 flex-col border-l border-white/70 bg-white/80 shadow-[8px_0_32px_-24px_rgba(11,27,43,0.5)] backdrop-blur-xl lg:flex">
          <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0B6E63] font-display text-sm font-bold text-white shadow-xs">
              م
            </div>
            <div>
              <div className="font-display text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
                مسار العينات
              </div>
              <div className="text-[11px] font-medium text-slate-400 whitespace-nowrap">
                القيادة الطبية والمالية
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6">
            {role === 'admin' && (
              <nav className="space-y-1">
                <div className="px-3 pb-2 text-[11px] font-semibold text-slate-400">
                  الإدارة والعمليات
                </div>
                {adminNavItems.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setAdminTab(item.key)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                      adminTab === item.key
                        ? 'bg-[#0B6E63]/10 font-bold text-[#07564e] shadow-[inset_3px_0_0_#c8a45d]'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                ))}
              </nav>
            )}

            {role !== 'admin' && (
              <div className="space-y-1 border-t border-slate-100 pt-5">
                <div className="px-3 pb-2 text-[11px] font-semibold text-slate-400">
                  طريقة العمل
                </div>
                <div className="flex gap-1 rounded-lg border border-slate-200/80 bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setPortalView('current')}
                    className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-semibold whitespace-nowrap ${
                      portalView === 'current'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600'
                    }`}
                  >
                    البوابة الحالية
                  </button>
                  <button
                    type="button"
                    onClick={() => setPortalView('requests')}
                    className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-semibold whitespace-nowrap ${
                      portalView === 'requests'
                        ? 'bg-white text-[#0B6E63] shadow-xs'
                        : 'text-slate-600'
                    }`}
                  >
                    طلبات العينات
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-1 border-t border-slate-100 pt-5">
              <div className="px-3 pb-2 text-[11px] font-semibold text-slate-400">
                بوابات الأدوار
              </div>
              {(Object.keys(roleLabels) as UserRole[]).map((rKey) => (
                <button
                  key={rKey}
                  type="button"
                  onClick={() => setRole(rKey)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    role === rKey
                      ? 'brand-gradient font-semibold text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  {roleLabels[rKey].icon}
                  <span>{roleLabels[rKey].label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-100 p-4">
            <button
              type="button"
              onClick={handleResetDemo}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>إعادة ضبط البيانات</span>
            </button>
          </div>
        </aside>

        {mobileMenuOpen && (
          <div className="no-print fixed inset-0 z-50 flex lg:hidden">
            <div className="glass-card flex w-72 flex-col !rounded-none !border-l-0 p-4 text-slate-800 !shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <span className="font-display text-lg font-bold text-slate-900">
                  مسار العينات
                </span>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 text-slate-400"
                  aria-label="إغلاق القائمة"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {role === 'admin' && (
                <div className="mt-4 space-y-1">
                  <div className="px-2 pb-1 text-[11px] font-semibold text-slate-400">
                    الأقسام
                  </div>
                  {adminNavItems.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        setAdminTab(item.key);
                        setMobileMenuOpen(false);
                      }}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${
                        adminTab === item.key
                          ? 'bg-[#0B6E63]/10 font-bold text-[#07564e] shadow-[inset_3px_0_0_#c8a45d]'
                          : 'text-slate-600'
                      }`}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              )}

              {role !== 'admin' && (
                <div className="mt-5 space-y-1 border-t border-slate-100 pt-4">
                  <div className="px-2 pb-1 text-[11px] font-semibold text-slate-400">
                    طريقة العمل
                  </div>
                  <div className="flex gap-1 rounded-lg border border-slate-200/80 bg-slate-100 p-1">
                    <button
                      type="button"
                      onClick={() => {
                        setPortalView('current');
                        setMobileMenuOpen(false);
                      }}
                      className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-semibold ${
                        portalView === 'current' ? 'bg-white text-slate-900' : 'text-slate-600'
                      }`}
                    >
                      البوابة الحالية
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPortalView('requests');
                        setMobileMenuOpen(false);
                      }}
                      className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-semibold ${
                        portalView === 'requests' ? 'bg-white text-[#0B6E63]' : 'text-slate-600'
                      }`}
                    >
                      طلبات العينات
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-5 space-y-1 border-t border-slate-100 pt-4">
                <div className="px-2 pb-1 text-[11px] font-semibold text-slate-400">
                  الأدوار
                </div>
                {(Object.keys(roleLabels) as UserRole[]).map((rKey) => (
                  <button
                    key={rKey}
                    type="button"
                    onClick={() => {
                      setRole(rKey);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${
                      role === rKey
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600'
                    }`}
                  >
                    {roleLabels[rKey].icon}
                    <span>{roleLabels[rKey].label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div
              className="flex-1 bg-slate-950/35"
              onClick={() => setMobileMenuOpen(false)}
            />
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="no-print flex items-center justify-between gap-4 border-b border-white/70 bg-white/70 px-5 py-3.5 backdrop-blur-xl sm:px-8">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="rounded-lg border border-slate-200 p-2 text-slate-700 lg:hidden"
                aria-label="القائمة"
              >
                <Menu className="h-4 w-4" />
              </button>
              <h1 className="truncate font-display text-base font-bold text-slate-900 sm:text-lg">
                {pageTitle}
              </h1>
            </div>

            <div className="hidden xl:flex items-center gap-3 text-xs font-medium text-slate-500 shrink-0">
              <span className="whitespace-nowrap">{state.currentPeriod}</span>
              <span aria-hidden="true">·</span>
              <span className="whitespace-nowrap">{roleLabels[role].label}</span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={fetchState}
                className="btn-outline !px-2.5 !py-2"
                aria-label="تحديث البيانات"
                title="تحديث البيانات"
              >
                <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </button>

              <button
                type="button"
                onClick={() => setShowNotifications(true)}
                className="btn-outline relative !px-2.5 !py-2"
                aria-label="التنبيهات"
                title="التنبيهات"
              >
                <Bell className="h-4 w-4" />
                {roleNotifications.some((n) => !n.read) && (
                  <span className="absolute -left-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#c8a45d] px-1 font-mono-num text-[9px] font-bold text-white">
                    {roleNotifications.filter((n) => !n.read).length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowScannerModal(true)}
                className="hidden sm:flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <ScanLine className="h-3.5 w-3.5 text-[#0B6E63]" />
                <span>مسح باركود</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  setReportModalState({
                    open: true,
                    mode: showingRequests ? 'requests' : 'commissions',
                  })
                }
                className="hidden md:flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <FileText className="h-3.5 w-3.5 text-[#0B6E63]" />
                <span>تقرير PDF</span>
              </button>

              <button
                type="button"
                onClick={() => setShowQuickVoucherDrawer(true)}
                className="flex items-center gap-1.5 rounded-lg bg-[#0B6E63] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#09594f] whitespace-nowrap shrink-0"
              >
                <Plus className="h-4 w-4" />
                <span>تسجيل سند</span>
              </button>
            </div>
          </header>

          <main className="mx-auto w-full max-w-[1400px] flex-1 p-5 sm:p-8">
            {role === 'admin' && adminTab === 'overview' && (
              <OverviewDashboard
                period={state.currentPeriod}
                evaluations={evaluations}
                reconciliations={reconciliations}
                movements={state.movements}
                vouchers={state.vouchers}
                onNavigate={(tab) => setAdminTab(tab)}
                onOpenScanner={() => setShowScannerModal(true)}
                onOpenReport={(mode) => setReportModalState({ open: true, mode })}
                onUpdateCourierTarget={handleUpdateCourierTarget}
              />
            )}

            {role === 'admin' && adminTab === 'requests' && (
              <RequestsWorkspace {...requestsWorkspaceProps} />
            )}

            {role === 'admin' && adminTab === 'reconciliation' && (
              <SmartReconciliationView
                period={state.currentPeriod}
                reconciliations={reconciliations}
                evaluations={evaluations}
                couriers={state.couriers}
                onImportLabRows={handleImportLabRows}
                onVoucherDecision={handleVoucherDecision}
                onResolveGap={handleResolveGap}
                onOpenReport={() =>
                  setReportModalState({ open: true, mode: 'reconciliation' })
                }
              />
            )}

            {role === 'admin' && adminTab === 'movements' && (
              <SampleMovementsView
                movements={state.movements}
                centers={state.centers}
                couriers={state.couriers}
                notifications={state.notifications}
                onAdvanceMovement={handleAdvanceMovement}
                onOpenScanner={() => setShowScannerModal(true)}
                onCreateMovement={handleCreateMovement}
              />
            )}

            {role === 'admin' && adminTab === 'map' && (
              <LiveFleetMapView
                apiKey={mapsApiKey}
                quotaExceeded={gmpQuotaExceeded}
                labLocation={state.labLocation}
                reconciliations={reconciliations}
                couriers={state.couriers}
                evaluations={evaluations}
                movements={state.movements}
              />
            )}

            {role === 'admin' && adminTab === 'vouchers' && (
              <VouchersAndTargetsView
                vouchers={state.vouchers}
                couriers={state.couriers}
                centers={state.centers}
                movements={state.movements}
                evaluations={evaluations}
                enteredBy="admin"
                onCreateVoucher={handleCreateVoucher}
                onUpdateCourierTarget={handleUpdateCourierTarget}
                onOpenReport={() =>
                  setReportModalState({ open: true, mode: 'commissions' })
                }
              />
            )}

            {role === 'admin' && adminTab === 'centers' && (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
                  <div>
                    <h2 className="font-display text-base font-bold text-slate-900">
                      دليل المراكز الطبية والقطاعات
                    </h2>
                    <p className="text-xs text-slate-500">
                      توزيع المراكز على المراسلين والقطاعات لاحتساب التغطية والتارجت
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAddCenterDrawer(true)}
                    className="flex items-center gap-1.5 rounded-lg bg-[#0B6E63] px-4 py-2 text-xs font-semibold text-white hover:bg-[#09594f] whitespace-nowrap"
                  >
                    <Plus className="h-4 w-4" />
                    <span>إضافة مركز</span>
                  </button>
                </div>

                <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-500">
                          <th className="px-6 py-3.5">المركز الطبي</th>
                          <th className="px-4 py-3.5">القطاع</th>
                          <th className="px-4 py-3.5">المراسل الأساسي</th>
                          <th className="px-4 py-3.5">متوسط الدخل</th>
                          <th className="px-4 py-3.5">متأخرات</th>
                          <th className="px-6 py-3.5">الحالة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {state.centers.map((ctr) => {
                          const sec = state.sectors.find((s) => s.id === ctr.sectorId);
                          const cur = state.couriers.find(
                            (c) => c.id === ctr.primaryCourierId
                          );
                          return (
                            <tr key={ctr.id} className="hover:bg-slate-50/70">
                              <td className="px-6 py-3.5">
                                <div className="font-semibold text-slate-900">
                                  {ctr.name}
                                </div>
                                <div className="text-xs text-slate-400">
                                  {ctr.address} · {ctr.phone}
                                </div>
                              </td>
                              <td className="px-4 py-3.5 text-xs text-slate-700">
                                {sec?.name}
                              </td>
                              <td className="px-4 py-3.5 text-xs font-semibold text-[#0B6E63]">
                                {cur?.name}
                              </td>
                              <td className="px-4 py-3.5 tabular-nums font-medium text-slate-900">
                                {formatCurrency(ctr.monthlyAvgRevenue)}
                              </td>
                              <td className="px-4 py-3.5 tabular-nums font-semibold text-red-700">
                                {formatCurrency(ctr.overdueBalance)}
                              </td>
                              <td className="px-6 py-3.5 text-xs font-semibold">
                                {ctr.status === 'active' ? (
                                  <span className="text-emerald-700">نشط</span>
                                ) : ctr.status === 'overdue' ? (
                                  <span className="text-red-700">متأخر</span>
                                ) : (
                                  <span className="text-amber-700">ضعيف الحركة</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {role !== 'admin' && portalView === 'requests' && (
              <RequestsWorkspace {...requestsWorkspaceProps} />
            )}

            {role === 'courier' && portalView !== 'requests' && (
              <CourierPortal
                couriers={state.couriers}
                centers={state.centers}
                movements={state.movements}
                notifications={state.notifications}
                evaluations={evaluations}
                onAdvanceMovement={handleAdvanceMovement}
                onOpenScanner={() => setShowScannerModal(true)}
                onCreateMovement={handleCreateMovement}
                onCreateVoucher={handleCreateVoucher}
              />
            )}

            {role === 'supervisor' && portalView !== 'requests' && (
              <SupervisorPortal
                sectors={state.sectors}
                couriers={state.couriers}
                centers={state.centers}
                movements={state.movements}
                evaluations={evaluations}
                reconciliations={reconciliations}
                onCreateVoucher={handleCreateVoucher}
              />
            )}

            {role === 'center' && portalView !== 'requests' && (
              <CenterPortal
                centers={state.centers}
                couriers={state.couriers}
                movements={state.movements}
                vouchers={state.vouchers}
                notifications={state.notifications}
                reconciliations={reconciliations}
                onCreateMovement={handleCreateMovement}
                onAdvanceMovement={handleAdvanceMovement}
              />
            )}
          </main>
        </div>
      </div>

      <NotificationCenter
        open={showNotifications}
        onClose={() => setShowNotifications(false)}
        notifications={roleNotifications}
        onMarkRead={handleMarkNotificationRead}
        onMarkAllRead={handleMarkAllNotificationsRead}
      />

      <QrScannerModal
        open={showScannerModal}
        movements={state.movements}
        centers={state.centers}
        onClose={() => setShowScannerModal(false)}
        onScanCode={handleScanQrCode}
      />

      <PrintableReportModal
        key={reportModalState.mode}
        open={reportModalState.open}
        initialMode={reportModalState.mode}
        period={state.currentPeriod}
        evaluations={evaluations}
        reconciliations={reconciliations}
        movements={state.movements}
        centers={state.centers}
        couriers={state.couriers}
        sectors={state.sectors}
        onClose={() => setReportModalState((s) => ({ ...s, open: false }))}
      />

      <Drawer
        open={showQuickVoucherDrawer}
        onClose={() => setShowQuickVoucherDrawer(false)}
        title="سند سريع"
      >
        <QuickVoucherForm
          couriers={state.couriers}
          centers={state.centers}
          movements={state.movements}
          lockedCourierId={currentCourierId}
          enteredBy={
            role === 'courier'
              ? 'courier'
              : role === 'supervisor'
              ? 'supervisor'
              : 'admin'
          }
          onSubmit={handleCreateVoucher}
          onSuccess={() => setShowQuickVoucherDrawer(false)}
        />
      </Drawer>

      <Drawer
        open={showAddCenterDrawer}
        onClose={() => setShowAddCenterDrawer(false)}
        title="إضافة مركز طبي جديد"
        subtitle="تعيين القطاع والمراسل المسؤول ومتوسط الدخل الشهري"
      >
        <form onSubmit={handleAddCenter} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700">
              اسم المركز الطبي
            </label>
            <input
              type="text"
              required
              value={newCenterName}
              onChange={(e) => setNewCenterName(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                القطاع
              </label>
              <select
                value={newCenterSector}
                onChange={(e) =>
                  setNewCenterSector(e.target.value as MedicalCenter['sectorId'])
                }
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
              >
                {state.sectors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                المراسل المسؤول
              </label>
              <select
                value={newCenterCourier}
                onChange={(e) => setNewCenterCourier(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
              >
                {state.couriers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                الهاتف
              </label>
              <input
                type="text"
                value={newCenterPhone}
                onChange={(e) => setNewCenterPhone(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                متوسط الدخل الشهري (ر.ي)
              </label>
              <input
                type="number"
                value={newCenterAvg}
                onChange={(e) => setNewCenterAvg(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm tabular-nums"
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700">
              العنوان
            </label>
            <input
              type="text"
              value={newCenterAddress}
              onChange={(e) => setNewCenterAddress(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-[#0B6E63] px-4 py-3 text-sm font-semibold text-white hover:bg-[#09594f]"
          >
            حفظ المركز في الدليل
          </button>
        </form>
      </Drawer>
    </div>
  );
}
