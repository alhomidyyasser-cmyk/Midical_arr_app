import type {
  CenterReconciliation,
  Courier,
  CourierEvaluation,
  GapAttribution,
  LabReportRow,
  MedicalCenter,
  ProgressiveCashBreakdown,
  ReconciliationStatus,
  SampleMovement,
  Sector,
  Voucher,
} from '../types.ts';

export function formatCurrency(amount: number): string {
  return `${new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(Math.round(amount))} ر.ي`;
}

export function formatNumber(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
}

export function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function calculateProgressiveCashCommission(totalCash: number): ProgressiveCashBreakdown {
  const safeCash = Math.max(0, totalCash);

  const tier1Amount = Math.min(safeCash, 1_000_000);
  const tier1Commission = tier1Amount * 0.005;

  const tier2Amount = Math.max(0, Math.min(safeCash - 1_000_000, 1_000_000));
  const tier2Commission = tier2Amount * 0.01;

  const tier3Amount = Math.max(0, safeCash - 2_000_000);
  const tier3Commission = tier3Amount * 0.015;

  const totalCommission = tier1Commission + tier2Commission + tier3Commission;

  let currentTier: 1 | 2 | 3 = 1;
  let nextTierThreshold: number | null = 1_000_001;
  let remainingToNextTier = Math.max(0, 1_000_001 - safeCash);

  if (safeCash > 2_000_000) {
    currentTier = 3;
    nextTierThreshold = null;
    remainingToNextTier = 0;
  } else if (safeCash > 1_000_000) {
    currentTier = 2;
    nextTierThreshold = 2_000_001;
    remainingToNextTier = Math.max(0, 2_000_001 - safeCash);
  }

  return {
    totalCash: safeCash,
    tier1Amount,
    tier1Commission,
    tier2Amount,
    tier2Commission,
    tier3Amount,
    tier3Commission,
    totalCommission,
    currentTier,
    nextTierThreshold,
    remainingToNextTier,
  };
}

export function reconcileCenters(
  centers: MedicalCenter[],
  sectors: Sector[],
  couriers: Courier[],
  vouchers: Voucher[],
  movements: SampleMovement[],
  labRows: LabReportRow[],
  gapAttributions: GapAttribution[]
): CenterReconciliation[] {
  const sectorMap = new Map(sectors.map((s) => [s.id, s.name]));
  const courierMap = new Map(couriers.map((c) => [c.id, c]));

  return centers.map((center) => {
    const centerLabRows = labRows.filter(
      (r) =>
        r.centerId === center.id ||
        r.centerName.trim() === center.name.trim() ||
        center.aliases.some((a) => r.centerName.includes(a))
    );

    const labTotalAmount = centerLabRows.reduce((sum, r) => sum + r.totalAmount, 0);
    const labSampleCount = centerLabRows.reduce((sum, r) => sum + r.sampleCount, 0);
    const labTypesSummary =
      centerLabRows.length > 0
        ? Array.from(new Set(centerLabRows.map((r) => r.labType))).join(' · ')
        : 'لا يوجد سجل مختبر مستورد';

    const centerVouchers = vouchers.filter((v) => v.centerId === center.id);
    const centerMovements = movements.filter((m) => m.centerId === center.id);
    const centerGapAttributions = gapAttributions.filter((g) => g.centerId === center.id);

    const courierCashTotal = centerVouchers
      .filter((v) => v.type === 'cash' && v.approvalStatus === 'auto_approved')
      .reduce((sum, v) => sum + v.amount, 0);

    const courierDeferredTotal = centerVouchers
      .filter(
        (v) =>
          (v.type === 'deferred' && v.approvalStatus === 'auto_approved') ||
          (v.type === 'guarantee' && v.approvalStatus === 'approved_as_deferred')
      )
      .reduce((sum, v) => sum + v.amount, 0);

    const courierGuaranteeTotal = centerVouchers
      .filter(
        (v) =>
          v.type === 'guarantee' &&
          (v.approvalStatus === 'pending_review' || v.approvalStatus === 'suspended')
      )
      .reduce((sum, v) => sum + v.amount, 0);

    const resolvedGapAmount = centerGapAttributions
      .filter((g) => g.resolutionType === 'attributed_deferred' || g.resolutionType === 'settled_cash')
      .reduce((sum, g) => sum + g.amount, 0);

    const approvedTotal = courierCashTotal + courierDeferredTotal + resolvedGapAmount;
    const rawGap = Math.max(0, labTotalAmount - approvedTotal);
    const pendingReviewExists = centerVouchers.some(
      (v) => v.approvalStatus === 'pending_review'
    );

    let status: ReconciliationStatus = 'matched';
    if (rawGap > 0 && courierGuaranteeTotal >= rawGap && pendingReviewExists) {
      status = 'needs_review';
    } else if (rawGap > 0) {
      status = 'gap';
    } else if (pendingReviewExists || courierGuaranteeTotal > 0) {
      status = 'needs_review';
    }

    const involvedIds = new Set<string>();
    centerMovements.forEach((m) => involvedIds.add(m.courierId));
    centerVouchers.forEach((v) => involvedIds.add(v.courierId));

    const involvedCouriers = Array.from(involvedIds).map((cid) => {
      const c = courierMap.get(cid);
      const cMovements = centerMovements.filter((m) => m.courierId === cid);
      const cVouchers = centerVouchers.filter((v) => v.courierId === cid && v.approvalStatus !== 'rejected');
      return {
        courierId: cid,
        courierName: c ? c.name : 'مراسل غير معروف',
        movementsCount: cMovements.length,
        movementsValue: cMovements.reduce((s, m) => s + m.estimatedValue, 0),
        sampleCount: cMovements.reduce((s, m) => s + m.sampleCount, 0),
        vouchersTotal: cVouchers.reduce((s, v) => s + v.amount, 0),
        vouchersCount: cVouchers.length,
      };
    });

    const hasMultiCourierOverlap = involvedCouriers.length > 1;

    return {
      center,
      sectorName: sectorMap.get(center.sectorId) || '',
      labTotalAmount,
      labSampleCount,
      labTypesSummary,
      courierCashTotal,
      courierDeferredTotal,
      courierGuaranteeTotal,
      approvedTotal,
      gapAmount: rawGap,
      status,
      hasMultiCourierOverlap,
      involvedCouriers,
      centerVouchers,
      centerMovements,
      centerGapAttributions,
    };
  });
}

export function evaluateCouriers(
  couriers: Courier[],
  sectors: Sector[],
  centers: MedicalCenter[],
  vouchers: Voucher[],
  movements: SampleMovement[],
  reconciliations: CenterReconciliation[],
  gapAttributions: GapAttribution[]
): CourierEvaluation[] {
  const sectorMap = new Map(sectors.map((s) => [s.id, s.name]));

  return couriers
    .map((courier) => {
      const cVouchers = vouchers.filter((v) => v.courierId === courier.id);
      const cMovements = movements.filter((m) => m.courierId === courier.id);

      const approvedCashTotal = cVouchers
        .filter((v) => v.type === 'cash' && v.approvalStatus === 'auto_approved')
        .reduce((s, v) => s + v.amount, 0);

      const approvedDeferredTotal = cVouchers
        .filter(
          (v) =>
            (v.type === 'deferred' && v.approvalStatus === 'auto_approved') ||
            (v.type === 'guarantee' && v.approvalStatus === 'approved_as_deferred')
        )
        .reduce((s, v) => s + v.amount, 0);

      const pendingGuaranteeTotal = cVouchers
        .filter(
          (v) =>
            v.type === 'guarantee' &&
            (v.approvalStatus === 'pending_review' || v.approvalStatus === 'suspended')
        )
        .reduce((s, v) => s + v.amount, 0);

      const resolvedCashFromGaps = gapAttributions
        .filter((g) => g.courierId === courier.id && g.resolutionType === 'settled_cash')
        .reduce((s, g) => s + g.amount, 0);

      const resolvedDeferredFromGaps = gapAttributions
        .filter((g) => g.courierId === courier.id && g.resolutionType === 'attributed_deferred')
        .reduce((s, g) => s + g.amount, 0);

      const primaryCenterGaps = reconciliations
        .filter(
          (r) =>
            r.center.primaryCourierId === courier.id &&
            r.gapAmount > 0 &&
            r.status === 'gap'
        )
        .reduce((s, r) => s + r.gapAmount, 0);

      const pendingGapAttributions = gapAttributions
        .filter((g) => g.courierId === courier.id && g.resolutionType === 'pending_gap')
        .reduce((s, g) => s + g.amount, 0);

      const unresolvedGapTotal = Math.max(primaryCenterGaps, pendingGapAttributions);

      const finalCash = approvedCashTotal + resolvedCashFromGaps;
      const finalDeferred = approvedDeferredTotal + resolvedDeferredFromGaps;

      const relativeFinancialTarget = Math.round(
        courier.regionAvg * (1 + courier.growthTargetPct / 100)
      );
      const totalCountableCollection = finalCash + finalDeferred;
      const financialAchievementPct =
        relativeFinancialTarget > 0
          ? (totalCountableCollection / relativeFinancialTarget) * 100
          : 0;

      const gapPenalty = unresolvedGapTotal > 0 ? Math.min(24, Math.ceil(unresolvedGapTotal / 25_000) * 6) : 0;
      const guaranteePenalty = pendingGuaranteeTotal > 0 ? Math.min(10, Math.ceil(pendingGuaranteeTotal / 50_000) * 5) : 0;
      const unlinkedPenalty = cVouchers.some((v) => v.approvalStatus === 'rejected') ? 8 : 0;
      const documentationScore = Math.max(0, 40 - gapPenalty - guaranteePenalty - unlinkedPenalty);

      const servedSet = new Set<string>();
      cMovements.forEach((m) => servedSet.add(m.centerId));
      cVouchers.forEach((v) => servedSet.add(v.centerId));
      const totalAssignedCenters = Math.max(1, courier.assignedCenterIds.length);
      const assignedServed = courier.assignedCenterIds.filter((id) => servedSet.has(id)).length;
      const coverageRatio = Math.min(1, assignedServed / totalAssignedCenters);

      const completedCyclesCount = cMovements.filter(
        (m) => m.status === 'returned_to_center'
      ).length;
      const inProgressCycles = cMovements.filter(
        (m) => m.status === 'delivered_to_lab' || m.status === 'returned_to_center'
      ).length;
      const cycleRate =
        cMovements.length > 0
          ? (completedCyclesCount * 1.0 + (inProgressCycles - completedCyclesCount) * 0.6) /
            cMovements.length
          : 0.5;

      const coverageAndSpeedScore = Math.round(
        coverageRatio * 23 + Math.min(1, cycleRate) * 12
      );

      const overdueAssignedCenters = centers.filter(
        (ctr) =>
          courier.assignedCenterIds.includes(ctr.id) &&
          (ctr.status === 'overdue' || ctr.status === 'low_activity')
      ).length;
      const arrearsRatio =
        overdueAssignedCenters > 0
          ? Math.min(1, courier.arrearsCollectedCount / overdueAssignedCenters)
          : courier.arrearsCollectedCount > 0
          ? 1
          : 0.7;
      const arrearsAndActivationScore = Math.round(
        arrearsRatio * 18 + (courier.onTimeDeliveryRate / 100) * 7
      );

      const effortScore = Math.min(
        100,
        documentationScore + coverageAndSpeedScore + arrearsAndActivationScore
      );

      const cappedFinancialForScore = Math.min(125, financialAchievementPct);
      const weightedFinalScore = Number(
        (cappedFinancialForScore * 0.5 + effortScore * 0.5).toFixed(1)
      );

      const higherTierBonusEligible = effortScore >= 70;
      const rawCashBreakdown = calculateProgressiveCashCommission(finalCash);
      const cashBreakdown = higherTierBonusEligible
        ? rawCashBreakdown
        : {
            ...rawCashBreakdown,
            tier3Amount: 0,
            tier3Commission: 0,
            totalCommission:
              rawCashBreakdown.tier1Commission + rawCashBreakdown.tier2Commission,
            currentTier:
              rawCashBreakdown.currentTier === 3 ? 2 : rawCashBreakdown.currentTier,
            nextTierThreshold:
              rawCashBreakdown.currentTier === 3
                ? 2_000_001
                : rawCashBreakdown.nextTierThreshold,
            remainingToNextTier:
              rawCashBreakdown.currentTier === 3
                ? Math.max(0, 2_000_001 - finalCash)
                : rawCashBreakdown.remainingToNextTier,
          };
      const deferredCommission = finalDeferred * 0.005;
      const totalEarnedCommission = cashBreakdown.totalCommission + deferredCommission;

      return {
        courier,
        sectorName: sectorMap.get(courier.sectorId) || '',
        approvedCashTotal: finalCash,
        approvedDeferredTotal: finalDeferred,
        pendingGuaranteeTotal,
        unresolvedGapTotal,
        cashBreakdown,
        deferredCommission,
        totalEarnedCommission,
        relativeFinancialTarget,
        totalCountableCollection,
        financialAchievementPct: Number(financialAchievementPct.toFixed(1)),
        documentationScore,
        coverageAndSpeedScore,
        arrearsAndActivationScore,
        effortScore,
        weightedFinalScore,
        higherTierBonusEligible,
        servedCentersCount: assignedServed,
        totalAssignedCenters,
        completedCyclesCount,
        totalMovementsCount: cMovements.length,
      };
    })
    .sort((a, b) => b.weightedFinalScore - a.weightedFinalScore);
}
