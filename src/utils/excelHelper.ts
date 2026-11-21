import * as XLSX from 'xlsx';
import type {
  CenterReconciliation,
  Courier,
  CourierEvaluation,
  MedicalCenter,
  SampleMovement,
  Sector,
} from '../types.ts';

export interface ParsedLabImportRow {
  centerName: string;
  sampleCount: number;
  totalAmount: number;
  labType: string;
  date: string;
  notes?: string;
}

export async function parseLabExcelFile(file: File): Promise<ParsedLabImportRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('الملف لا يحتوي على أي ورقة عمل');
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  if (!rawRows.length) {
    throw new Error('ورقة العمل فارغة');
  }

  const pick = (row: Record<string, unknown>, keys: string[]): string => {
    for (const k of Object.keys(row)) {
      const normalized = k.trim().toLowerCase();
      if (keys.some((target) => normalized.includes(target.toLowerCase()))) {
        return String(row[k] ?? '').trim();
      }
    }
    return '';
  };

  const toNumber = (val: string): number => {
    const cleaned = val.replace(/[,،\s]/g, '').replace(/[^\d.-]/g, '');
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const parsed: ParsedLabImportRow[] = [];

  for (const row of rawRows) {
    const centerName = pick(row, ['اسم المركز', 'المركز', 'center', 'clinic', 'lab']);
    if (!centerName) continue;

    const sampleCountStr = pick(row, ['مجموع العينات', 'العينات', 'عدد العينات', 'samples', 'count']);
    const amountStr = pick(row, ['السعر الإجمالي', 'السعر الاجمالي', 'المبلغ', 'الإجمالي', 'الاجمالي', 'amount', 'total']);
    const labType = pick(row, ['النوع', 'نوع', 'type', 'payment']) || 'غير محدد';
    const date = pick(row, ['التاريخ', 'تاريخ', 'date']) || new Date().toISOString().slice(0, 10);
    const notes = pick(row, ['ملاحظات', 'ملاحظة', 'notes', 'note']);

    parsed.push({
      centerName,
      sampleCount: toNumber(sampleCountStr),
      totalAmount: toNumber(amountStr),
      labType,
      date,
      notes,
    });
  }

  if (parsed.length === 0) {
    throw new Error(
      'لم يتم التعرف على الأعمدة. تأكد من وجود أعمدة: اسم المركز، مجموع العينات، السعر الإجمالي، النوع.'
    );
  }

  return parsed;
}

export function downloadLabReportTemplate(): void {
  const sampleData = [
    {
      'اسم المركز': 'مركز نيولاب الطبي',
      'مجموع العينات': 47,
      'السعر الإجمالي': 653000,
      'النوع': 'نقد',
      'التاريخ': '2026-11-20',
      'ملاحظات': 'شامل عينات فؤاد وأمجد 1500 + 1500',
    },
    {
      'اسم المركز': 'مختبرات الرازي',
      'مجموع العينات': 62,
      'السعر الإجمالي': 1050000,
      'النوع': 'غير محدد',
      'التاريخ': '2026-11-20',
      'ملاحظات': 'مراجعة فرق 200,000',
    },
    {
      'اسم المركز': 'مركز الشفاء التخصصي',
      'مجموع العينات': 84,
      'السعر الإجمالي': 1350000,
      'النوع': 'مختلط',
      'التاريخ': '2026-11-20',
      'ملاحظات': '',
    },
    {
      'اسم المركز': 'عيادات النخبة',
      'مجموع العينات': 71,
      'السعر الإجمالي': 1120000,
      'النوع': 'ضمان',
      'التاريخ': '2026-11-20',
      'ملاحظات': '',
    },
    {
      'اسم المركز': 'مركز الأمل التشخيصي',
      'مجموع العينات': 25,
      'السعر الإجمالي': 290000,
      'النوع': 'نقد',
      'التاريخ': '2026-11-20',
      'ملاحظات': '',
    },
  ];

  const ws = XLSX.utils.json_to_sheet(sampleData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'تقرير المختبر');
  XLSX.writeFile(wb, 'نموذج_تقرير_المختبر.xlsx');
}

export function exportMonthlyReportExcel(
  reconciliations: CenterReconciliation[],
  evaluations: CourierEvaluation[],
  periodLabel: string
): void {
  const reconSheetData = reconciliations.map((r) => ({
    'المركز الطبي': r.center.name,
    'القطاع': r.sectorName,
    'إجمالي المختبر': r.labTotalAmount,
    'عدد العينات': r.labSampleCount,
    'النقد الموثق': r.courierCashTotal,
    'الآجل المعتمد': r.courierDeferredTotal,
    'ضمانات معلقة': r.courierGuaranteeTotal,
    'الفجوة المالية': r.gapAmount,
    'حالة المطابقة':
      r.status === 'matched'
        ? 'مطابق'
        : r.status === 'needs_review'
        ? 'يحتاج مراجعة / ضمان'
        : 'فجوة مالية',
    'تداخل مراسلين': r.hasMultiCourierOverlap
      ? r.involvedCouriers.map((c) => `${c.courierName} (${c.vouchersTotal})`).join(' + ')
      : r.involvedCouriers[0]?.courierName || '-',
  }));

  const evalSheetData = evaluations.map((e, idx) => ({
    'الترتيب': idx + 1,
    'المراسل': e.courier.name,
    'القطاع': e.sectorName,
    'متوسط المنطقة': e.courier.regionAvg,
    'التارجت النسبي (+%)': e.relativeFinancialTarget,
    'النقد التراكمي': e.approvedCashTotal,
    'الشريحة الحالية': `الشريحة ${e.cashBreakdown.currentTier}`,
    'عمولة النقد': Math.round(e.cashBreakdown.totalCommission),
    'الآجل المعتمد': e.approvedDeferredTotal,
    'عمولة الآجل (0.5%)': Math.round(e.deferredCommission),
    'إجمالي العمولة المستحقة': Math.round(e.totalEarnedCommission),
    'نسبة التحقيق المالي %': e.financialAchievementPct,
    'مؤشر الجهد والجدية / 100': e.effortScore,
    'النتيجة الموزونة النهائية': e.weightedFinalScore,
    'استحقاق حافز الشريحة الأعلى': e.higherTierBonusEligible ? 'مؤهل' : 'غير مؤهل (أقل من 70)',
  }));

  const wb = XLSX.utils.book_new();
  const wsEval = XLSX.utils.json_to_sheet(evalSheetData);
  const wsRecon = XLSX.utils.json_to_sheet(reconSheetData);
  XLSX.utils.book_append_sheet(wb, wsEval, 'التارجت والعمولات');
  XLSX.utils.book_append_sheet(wb, wsRecon, 'المطابقة الذكية');
  XLSX.writeFile(wb, `تقرير_المطابقة_والعمولات_${periodLabel.replace(/\s+/g, '_')}.xlsx`);
}

export function exportRequestsExcel(
  movements: SampleMovement[],
  centers: MedicalCenter[],
  couriers: Courier[],
  sectors: Sector[],
  periodLabel = ''
): void {
  const centerMap = new Map(centers.map((c) => [c.id, c]));
  const courierMap = new Map(couriers.map((c) => [c.id, c]));
  const sectorMap = new Map(sectors.map((s) => [s.id, s.name]));

  const rows = movements.map((m) => {
    const center = centerMap.get(m.centerId);
    const courier = courierMap.get(m.courierId);
    const requested = m.requestedAt ? new Date(m.requestedAt) : null;
    const picked = m.pickedUpAt ? new Date(m.pickedUpAt) : null;
    const lab = m.deliveredToLabAt ? new Date(m.deliveredToLabAt) : null;
    const returned = m.returnedAt ? new Date(m.returnedAt) : null;

    return {
      'رقم الطلب': m.batchCode,
      'المركز': center?.name || '-',
      'القطاع': center ? sectorMap.get(center.sectorId) || '-' : '-',
      'المراسل': courier?.name || '-',
      'النوع': m.requestType === 'urgent' ? 'مستعجل' : 'عادي',
      'الحالة': m.status,
      'وقت الطلب': requested?.toLocaleString('en-GB') || '-',
      'وقت الاستلام': picked?.toLocaleString('en-GB') || '-',
      'وقت المختبر': lab?.toLocaleString('en-GB') || '-',
      'وقت الإرجاع': returned?.toLocaleString('en-GB') || '-',
      'زمن الاستلام (دقيقة)': picked && requested ? Math.round((picked.getTime() - requested.getTime()) / 60000) : '',
      'زمن التوصيل (دقيقة)': lab && picked ? Math.round((lab.getTime() - picked.getTime()) / 60000) : '',
      'زمن الإرجاع (دقيقة)': returned && lab ? Math.round((returned.getTime() - lab.getTime()) / 60000) : '',
      'دورة كاملة (دقيقة)': returned && requested ? Math.round((returned.getTime() - requested.getTime()) / 60000) : '',
      'ملاحظات': m.notes || '',
    };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'أوقات الطلبات');
  const suffix = periodLabel.trim() ? `_${periodLabel.replace(/\s+/g, '_')}` : '';
  XLSX.writeFile(wb, `تقرير_أوقات_الطلبات${suffix}.xlsx`);
}
