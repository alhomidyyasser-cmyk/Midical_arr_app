export type UserRole = 'admin' | 'supervisor' | 'courier' | 'center';

export type ReportMode = 'commissions' | 'reconciliation' | 'requests';

export type SectorId = 'north' | 'central' | 'south';

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface Sector {
  id: SectorId;
  name: string;
  supervisorName: string;
  supervisorPhone: string;
  regionTier: 'strong' | 'medium' | 'developing';
  description: string;
}

export type CenterStatus = 'active' | 'overdue' | 'low_activity';

export interface MedicalCenter {
  id: string;
  name: string;
  aliases: string[];
  sectorId: SectorId;
  address: string;
  phone: string;
  location: GeoPoint;
  primaryCourierId: string;
  monthlyAvgRevenue: number;
  overdueBalance: number;
  status: CenterStatus;
}

export interface Courier {
  id: string;
  name: string;
  phone: string;
  sectorId: SectorId;
  currentLocation: GeoPoint;
  regionAvg: number; 
  growthTargetPct: number; 
  assignedCenterIds: string[];
  arrearsCollectedCount: number; 
  onTimeDeliveryRate: number;
}

export type MovementStatus =
  | 'requested'
  | 'picked_up'
  | 'delivered_to_lab'
  | 'returned_to_center'
  | 'cancelled';

export type RequestType = 'normal' | 'urgent';

export interface MovementAuditEntry {
  at: string;
  action: 'created' | 'picked_up' | 'delivered_to_lab' | 'returned_to_center' | 'cancelled' | 'corrected' | 'reassigned';
  byRole: UserRole | 'system';
  byName: string;
  note?: string;
}

export interface MovementNotificationStatus {
  appSentAt?: string;
  smsSentAt?: string;
  smsDueAt?: string;
  smsStatus?: 'pending' | 'sent' | 'failed';
  escalationSentAt?: string;
}

export interface SampleMovement {
  id: string;
  batchCode: string;
  centerId: string;
  courierId: string;
  sampleCount: number;
  estimatedValue: number;
  notes: string;
  status: MovementStatus;
  requestedAt: string;
  pickedUpAt?: string;
  deliveredToLabAt?: string;
  returnedAt?: string;
  requestType?: RequestType;
  cancelReason?: string;
  cancelledAt?: string;
  cancelledBy?: UserRole;
  auditTrail?: MovementAuditEntry[];
  notificationStatus?: MovementNotificationStatus;
}

export type VoucherType = 'cash' | 'deferred' | 'guarantee';

export type VoucherApprovalStatus =
  | 'auto_approved'
  | 'pending_review'
  | 'approved_as_deferred'
  | 'suspended'
  | 'rejected';

export interface Voucher {
  id: string;
  voucherNumber: string;
  courierId: string;
  centerId: string;
  sampleMovementId?: string;
  type: VoucherType;
  amount: number;
  date: string;
  enteredBy: 'courier' | 'admin' | 'supervisor';
  notes: string;
  attachmentName?: string;
  aiExtracted?: boolean;
  approvalStatus: VoucherApprovalStatus;
  createdAt: string;
}

export interface LabReportRow {
  id: string;
  importBatchId: string;
  periodLabel: string;
  centerName: string;
  centerId: string | null;
  sampleCount: number;
  totalAmount: number;
  labType: string;
  date: string;
  notes?: string;
}

export interface GapAttribution {
  id: string;
  centerId: string;
  courierId: string;
  amount: number;
  resolutionType: 'pending_gap' | 'attributed_deferred' | 'settled_cash' | 'dismissed';
  note: string;
  updatedAt: string;
}

export interface NotificationItem {
  id: string;
  channel: 'app' | 'sms';
  recipientRole: UserRole;
  recipientName: string;
  phone?: string;
  message: string;
  createdAt: string;
  read: boolean;
}

export interface AppState {
  currentPeriod: string;
  labLocation: GeoPoint;
  sectors: Sector[];
  centers: MedicalCenter[];
  couriers: Courier[];
  movements: SampleMovement[];
  vouchers: Voucher[];
  labRows: LabReportRow[];
  gapAttributions: GapAttribution[];
  notifications: NotificationItem[];
}

export interface ProgressiveCashBreakdown {
  totalCash: number;
  tier1Amount: number;
  tier1Commission: number;
  tier2Amount: number;
  tier2Commission: number;
  tier3Amount: number;
  tier3Commission: number;
  totalCommission: number;
  currentTier: 1 | 2 | 3;
  nextTierThreshold: number | null;
  remainingToNextTier: number;
}

export interface CourierEvaluation {
  courier: Courier;
  sectorName: string;
  approvedCashTotal: number;
  approvedDeferredTotal: number;
  pendingGuaranteeTotal: number;
  unresolvedGapTotal: number;
  cashBreakdown: ProgressiveCashBreakdown;
  deferredCommission: number;
  totalEarnedCommission: number;
  relativeFinancialTarget: number;
  totalCountableCollection: number;
  financialAchievementPct: number;
  documentationScore: number; 
  coverageAndSpeedScore: number; 
  arrearsAndActivationScore: number; 
  effortScore: number; 
  weightedFinalScore: number; 
  higherTierBonusEligible: boolean;
  servedCentersCount: number;
  totalAssignedCenters: number;
  completedCyclesCount: number;
  totalMovementsCount: number;
}

export type ReconciliationStatus = 'matched' | 'needs_review' | 'gap';

export interface CenterReconciliation {
  center: MedicalCenter;
  sectorName: string;
  labTotalAmount: number;
  labSampleCount: number;
  labTypesSummary: string;
  courierCashTotal: number;
  courierDeferredTotal: number;
  courierGuaranteeTotal: number;
  approvedTotal: number;
  gapAmount: number;
  status: ReconciliationStatus;
  hasMultiCourierOverlap: boolean;
  involvedCouriers: {
    courierId: string;
    courierName: string;
    movementsCount: number;
    movementsValue: number;
    sampleCount: number;
    vouchersTotal: number;
    vouchersCount: number;
  }[];
  centerVouchers: Voucher[];
  centerMovements: SampleMovement[];
  centerGapAttributions: GapAttribution[];
}
