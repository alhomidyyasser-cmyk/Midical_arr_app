import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { createInitialSeedState } from './src/seedData.ts';
import { reconcileCenters } from './src/utils/calculations.ts';
import type {
  AppState,
  GapAttribution,
  LabReportRow,
  MedicalCenter,
  MovementAuditEntry,
  MovementStatus,
  NotificationItem,
  RequestType,
  SampleMovement,
  UserRole,
  Voucher,
  VoucherApprovalStatus,
  VoucherType,
} from './src/types.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const aiClient = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

function ensureDb(): AppState {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const initial = createInitialSeedState();
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as AppState;
    const seed = createInitialSeedState();
    parsed.sectors = parsed.sectors || seed.sectors;
    parsed.centers = parsed.centers || [];
    parsed.couriers = parsed.couriers || [];
    parsed.vouchers = parsed.vouchers || [];
    parsed.labRows = parsed.labRows || [];
    parsed.gapAttributions = parsed.gapAttributions || [];
    parsed.notifications = parsed.notifications || [];
    if (!parsed.labLocation) {
      parsed.labLocation = seed.labLocation;
    }
    parsed.centers = parsed.centers.map((c) => {
      if (!c.location) {
        const match = seed.centers.find((s) => s.id === c.id);
        return { ...c, location: match?.location || { lat: 15.355, lng: 44.205 } };
      }
      return c;
    });
    parsed.couriers = parsed.couriers.map((cur) => {
      if (!cur.currentLocation) {
        const match = seed.couriers.find((s) => s.id === cur.id);
        return {
          ...cur,
          currentLocation: match?.currentLocation || { lat: 15.35, lng: 44.2 },
        };
      }
      return cur;
    });
    parsed.movements = (parsed.movements || []).map((m) => ({
      ...m,
      requestType: m.requestType || 'normal',
      auditTrail: m.auditTrail || [
        {
          at: m.requestedAt,
          action: 'created',
          byRole: 'center',
          byName: 'المركز الطبي',
        },
      ],
      notificationStatus: m.notificationStatus || {},
    }));
    return parsed;
  } catch {
    const initial = createInitialSeedState();
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }
}

function saveDb(state: AppState): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function sendSmsForMovement(state: AppState, movement: SampleMovement, force = false): void {
  if (movement.status !== 'requested') return;
  const status = movement.notificationStatus;
  if (!status || status.smsStatus === 'sent') return;
  if (!force && status.smsDueAt && new Date(status.smsDueAt).getTime() > Date.now()) return;

  const courier = state.couriers.find((c) => c.id === movement.courierId);
  const center = state.centers.find((c) => c.id === movement.centerId);
  if (!courier || !center) return;

  const nowIso = new Date().toISOString();
  const typeLabel = movement.requestType === 'urgent' ? 'مستعجل' : 'عادي';
  state.notifications.unshift({
    id: makeId('ntf'),
    channel: 'sms',
    recipientRole: 'courier',
    recipientName: courier.name,
    phone: courier.phone,
    message: `طلب ${typeLabel} ${movement.batchCode} من ${center.name} — لم يتم الاستلام بعد.`,
    createdAt: nowIso,
    read: false,
  });
  status.smsStatus = 'sent';
  status.smsSentAt = nowIso;
  status.escalationSentAt = nowIso;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  ensureDb();

  setInterval(() => {
    const current = ensureDb();
    let changed = false;
    current.movements.forEach((m) => {
      const before = m.notificationStatus?.smsStatus;
      sendSmsForMovement(current, m);
      if (m.notificationStatus?.smsStatus !== before) changed = true;
    });
    if (changed) saveDb(current);
  }, 30_000);

  app.get('/api/config', (_req, res) => {
    const mapsApiKey =
      process.env.VITE_GOOGLE_MAPS_API_KEY ||
      process.env.GOOGLE_MAPS_API_KEY ||
      '';
    res.json({ mapsApiKey });
  });

  app.get('/api/state', (_req, res) => {
    const state = ensureDb();
    res.json(state);
  });

  app.post('/api/ai/scan-voucher', async (req, res) => {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error:
          'مفتاح Gemini API غير مهيأ في الخادم. يرجى التأكد من إضافته في إعدادات الأسرار.',
      });
    }

    const { imageBase64, mimeType } = req.body as {
      imageBase64: string;
      mimeType: string;
    };

    if (!imageBase64 || !mimeType) {
      return res.status(400).json({ error: 'يرجى إرسال صورة السند الورقي أولاً.' });
    }

    const state = ensureDb();
    const centersList = state.centers.map((c) => c.name).join('، ');

    try {
      const cleanBase64 = imageBase64.includes(',')
        ? imageBase64.split(',')[1]
        : imageBase64;

      const response = await aiClient.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: cleanBase64,
              },
            },
            {
              text:
                `أنت مدقق مالي ذكي لمختبرات طبية في اليمن. اقرأ صورة السند الورقي أو الإيصال واستخرج بياناته بدقة.\n` +
                `قائمة المراكز الطبية المسجلة: [${centersList}].\n` +
                `ملاحظة حاسمة: ابحث جيداً عن أي علامة أو كلمة تدل على أن السند "نقد" (cash) أو "آجل" (deferred) أو "ضمان مركز" (guarantee)، ` +
                `وإذا لم يكتب المراسل نوع السند بوضوح فصنفه كـ "unknown" مع توضيح السبب باللغة العربية في typeReason.`,
            },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              amount: {
                type: Type.NUMBER,
                description: 'المبلغ الرقمي بالريال اليمني المذكور في السند',
              },
              voucherNumber: {
                type: Type.STRING,
                description: 'رقم السند أو الإيصال الظاهر في الورقة',
              },
              detectedType: {
                type: Type.STRING,
                description: 'واحد من: cash | deferred | guarantee | unknown',
              },
              typeReason: {
                type: Type.STRING,
                description: 'سبب تصنيف النوع بالعربية بإيجاز',
              },
              centerNameGuess: {
                type: Type.STRING,
                description: 'أقرب اسم مركز طبي من القائمة المسجلة أو المكتوب في السند',
              },
              date: {
                type: Type.STRING,
                description: 'التاريخ بصيغة YYYY-MM-DD إن وجد',
              },
              notes: {
                type: Type.STRING,
                description: 'ملخص الملاحظات المكتوبة بخط اليد في السند',
              },
              confidence: {
                type: Type.NUMBER,
                description: 'نسبة الثقة من 0 إلى 100',
              },
            },
            required: [
              'amount',
              'voucherNumber',
              'detectedType',
              'typeReason',
              'centerNameGuess',
              'notes',
              'confidence',
            ],
          },
        },
      });

      const rawText = (response.text ?? '{}').trim();
      const extracted = JSON.parse(rawText) as {
        amount: number;
        voucherNumber: string;
        detectedType: string;
        typeReason: string;
        centerNameGuess: string;
        date?: string;
        notes: string;
        confidence: number;
      };

      const matchedCenter = state.centers.find(
        (c) =>
          extracted.centerNameGuess &&
          (c.name.includes(extracted.centerNameGuess) ||
            extracted.centerNameGuess.includes(c.name) ||
            c.aliases.some((a) => extracted.centerNameGuess.includes(a)))
      );

      res.json({
        ...extracted,
        matchedCenterId: matchedCenter?.id || '',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'خطأ غير متوقع أثناء تحليل الصورة';
      res.status(502).json({
        error: `تعذر تحليل صورة السند عبر الذكاء الاصطناعي: ${msg}`,
      });
    }
  });

  app.post('/api/movements', (req, res) => {
    const state = ensureDb();
    const {
      centerId,
      courierId,
      sampleCount,
      estimatedValue,
      notes,
      initialStatus = 'requested',
      requestType = 'normal',
    } = req.body as {
      centerId: string;
      courierId?: string;
      sampleCount: number;
      estimatedValue: number;
      notes?: string;
      initialStatus?: 'requested' | 'picked_up';
      requestType?: RequestType;
    };

    const center = state.centers.find((c) => c.id === centerId);
    if (!center) {
      return res.status(400).json({ error: 'المركز الطبي غير موجود' });
    }

    const assignedCourierId = courierId || center.primaryCourierId;
    const courier = state.couriers.find((c) => c.id === assignedCourierId);
    if (!courier) {
      return res.status(400).json({ error: 'المراسل غير موجود' });
    }

    const nowIso = new Date().toISOString();
    const batchNumber = 409 + state.movements.length;
    const isUrgent = requestType === 'urgent';
    const typeLabel = isUrgent ? 'مستعجل' : 'عادي';
    const auditTrail: MovementAuditEntry[] = [
      {
        at: nowIso,
        action: 'created',
        byRole: 'center',
        byName: center.name,
        note: `طلب ${typeLabel}`,
      },
    ];

    const movement: SampleMovement = {
      id: makeId('mov'),
      batchCode: `SMP-${batchNumber}`,
      centerId: center.id,
      courierId: courier.id,
      sampleCount: Math.max(1, Number(sampleCount) || 1),
      estimatedValue: Math.max(0, Number(estimatedValue) || 0),
      notes: (notes || '').trim() || 'دفعة عينات طبية',
      status: initialStatus,
      requestedAt: nowIso,
      pickedUpAt: initialStatus === 'picked_up' ? nowIso : undefined,
      requestType,
      auditTrail,
      notificationStatus: {
        appSentAt: nowIso,
        smsStatus: initialStatus === 'picked_up' ? undefined : 'pending',
        smsDueAt: initialStatus === 'picked_up' || isUrgent
          ? nowIso
          : new Date(Date.now() + 2 * 60 * 1000).toISOString(),
      },
    };

    state.movements.unshift(movement);

    if (initialStatus === 'picked_up') {
      courier.currentLocation = { ...center.location };
    }

    const appNotification: NotificationItem = {
      id: makeId('ntf'),
      channel: 'app',
      recipientRole: 'courier',
      recipientName: courier.name,
      message: `طلب جديد (${movement.batchCode}) من ${center.name} — ${typeLabel}.`,
      createdAt: nowIso,
      read: false,
    };

    state.notifications.unshift(appNotification);
    if (isUrgent && initialStatus === 'requested') {
      sendSmsForMovement(state, movement, true);
    }
    saveDb(state);
    res.json({ movement, state });
  });

  function advanceMovementInternal(state: AppState, movement: SampleMovement, byRole: UserRole = 'courier'): string {
    const nowIso = new Date().toISOString();
    const center = state.centers.find((c) => c.id === movement.centerId);
    const courier = state.couriers.find((c) => c.id === movement.courierId);
    const byName = byRole === 'courier' ? courier?.name || 'المراسل' : byRole;

    let msg = '';
    let action: MovementAuditEntry['action'] = 'picked_up';
    if (movement.status === 'requested') {
      movement.status = 'picked_up';
      movement.pickedUpAt = nowIso;
      action = 'picked_up';
      if (movement.notificationStatus) {
        movement.notificationStatus.smsStatus = 'sent';
        movement.notificationStatus.smsSentAt = movement.notificationStatus.smsSentAt || nowIso;
      }
      if (courier && center) courier.currentLocation = { ...center.location };
      msg = `تم استلام دفعة العينات ${movement.batchCode} من ${center?.name || ''} بواسطة المراسل ${courier?.name || ''}.`;
    } else if (movement.status === 'picked_up') {
      movement.status = 'delivered_to_lab';
      movement.deliveredToLabAt = nowIso;
      action = 'delivered_to_lab';
      if (courier) courier.currentLocation = { ...state.labLocation };
      msg = `وصلت دفعة العينات ${movement.batchCode} (${center?.name || ''}) إلى المختبر المركزي بواسطة ${courier?.name || ''}.`;
    } else if (movement.status === 'delivered_to_lab') {
      movement.status = 'returned_to_center';
      movement.returnedAt = nowIso;
      action = 'returned_to_center';
      if (courier && center) courier.currentLocation = { ...center.location };
      msg = `تم إرجاع نتائج ${movement.batchCode} إلى ${center?.name || ''} وإغلاق الدورة بنجاح.`;
    } else {
      return '';
    }

    movement.auditTrail = [
      ...(movement.auditTrail || []),
      { at: nowIso, action, byRole, byName },
    ];

    state.notifications.unshift(
      {
        id: makeId('ntf'),
        channel: 'app',
        recipientRole: 'center',
        recipientName: center?.name || 'المركز الطبي',
        message: msg,
        createdAt: nowIso,
        read: false,
      },
      {
        id: makeId('ntf'),
        channel: 'sms',
        recipientRole: 'center',
        recipientName: center?.name || 'المركز الطبي',
        phone: center?.phone || '',
        message: `SMS للمركز (${center?.phone || ''}): ${msg}`,
        createdAt: nowIso,
        read: false,
      }
    );

    return msg;
  }

  app.patch('/api/movements/:id/advance', (req, res) => {
    const state = ensureDb();
    const movement = state.movements.find((m) => m.id === req.params.id);
    if (!movement) {
      return res.status(404).json({ error: 'حركة العينة غير موجودة' });
    }

    const { expectedStatus, byRole = 'courier' } = req.body as {
      expectedStatus?: MovementStatus;
      byRole?: UserRole;
    };
    if (expectedStatus && movement.status !== expectedStatus) {
      return res.status(409).json({
        error: 'تغيرت حالة الطلب، حدّث الصفحة ثم حاول مرة أخرى.',
        movement,
        state,
      });
    }

    const msg = advanceMovementInternal(state, movement, byRole);
    if (!msg) {
      return res.status(400).json({ error: 'الدورة مكتملة بالفعل' });
    }

    saveDb(state);
    res.json({ movement, state });
  });

  app.post('/api/movements/:id/cancel', (req, res) => {
    const state = ensureDb();
    const movement = state.movements.find((m) => m.id === req.params.id);
    if (!movement) {
      return res.status(404).json({ error: 'الطلب غير موجود' });
    }
    if (movement.status === 'returned_to_center' || movement.status === 'cancelled') {
      return res.status(400).json({ error: 'لا يمكن إلغاء طلب مكتمل أو ملغي مسبقاً' });
    }

    const { reason, byRole = 'center', byName } = req.body as {
      reason?: string;
      byRole?: UserRole;
      byName?: string;
    };
    if (movement.status !== 'requested' && (byRole === 'center' || byRole === 'courier')) {
      return res.status(403).json({
        error: 'بعد الاستلام يحتاج إلغاء الطلب إلى اعتماد المندوب أو الإدارة.',
      });
    }

    const nowIso = new Date().toISOString();
    const center = state.centers.find((c) => c.id === movement.centerId);
    movement.status = 'cancelled';
    movement.cancelledAt = nowIso;
    movement.cancelReason = (reason || '').trim() || 'إلغاء بدون سبب';
    movement.cancelledBy = byRole;
    movement.auditTrail = [
      ...(movement.auditTrail || []),
      {
        at: nowIso,
        action: 'cancelled',
        byRole,
        byName: byName || byRole,
        note: movement.cancelReason,
      },
    ];

    state.notifications.unshift({
      id: makeId('ntf'),
      channel: 'app',
      recipientRole: 'courier',
      recipientName: state.couriers.find((c) => c.id === movement.courierId)?.name || 'المراسل',
      message: `تم إلغاء الطلب ${movement.batchCode}: ${movement.cancelReason}`,
      createdAt: nowIso,
      read: false,
    });

    saveDb(state);
    res.json({ movement, state, center });
  });

  app.post('/api/movements/:id/correct', (req, res) => {
    const state = ensureDb();
    const movement = state.movements.find((m) => m.id === req.params.id);
    if (!movement) {
      return res.status(404).json({ error: 'الطلب غير موجود' });
    }

    const { status, note, byRole = 'supervisor', byName } = req.body as {
      status: MovementStatus;
      note?: string;
      byRole?: UserRole;
      byName?: string;
    };
    if (byRole !== 'supervisor' && byRole !== 'admin') {
      return res.status(403).json({ error: 'هذا الإجراء مخصص للمندوب أو الإدارة فقط.' });
    }
    if (!['requested', 'picked_up', 'delivered_to_lab'].includes(status)) {
      return res.status(400).json({ error: 'حالة التصحيح غير صالحة' });
    }

    const nowIso = new Date().toISOString();
    movement.status = status;
    if (status === 'requested') {
      movement.pickedUpAt = undefined;
      movement.deliveredToLabAt = undefined;
      movement.returnedAt = undefined;
    } else if (status === 'picked_up') {
      movement.deliveredToLabAt = undefined;
      movement.returnedAt = undefined;
    } else if (status === 'delivered_to_lab') {
      movement.returnedAt = undefined;
    }
    movement.auditTrail = [
      ...(movement.auditTrail || []),
      {
        at: nowIso,
        action: 'corrected',
        byRole,
        byName: byName || byRole,
        note: note || 'تصحيح ضغطة خاطئة',
      },
    ];

    saveDb(state);
    res.json({ movement, state });
  });

  app.patch('/api/centers/:id/courier', (req, res) => {
    const state = ensureDb();
    const center = state.centers.find((c) => c.id === req.params.id);
    if (!center) {
      return res.status(404).json({ error: 'المركز غير موجود' });
    }
    const { courierId, byRole = 'supervisor' } = req.body as {
      courierId: string;
      byRole?: UserRole;
    };
    const nextCourier = state.couriers.find((c) => c.id === courierId);
    if (!nextCourier) {
      return res.status(404).json({ error: 'المراسل غير موجود' });
    }
    if (byRole === 'supervisor' && nextCourier.sectorId !== center.sectorId) {
      return res.status(403).json({ error: 'لا يمكن إسناد مركز لمراسل من قطاع آخر.' });
    }

    const previous = state.couriers.find((c) => c.id === center.primaryCourierId);
    if (previous) {
      previous.assignedCenterIds = previous.assignedCenterIds.filter((id) => id !== center.id);
    }
    center.primaryCourierId = nextCourier.id;
    if (!nextCourier.assignedCenterIds.includes(center.id)) {
      nextCourier.assignedCenterIds.push(center.id);
    }

    const nowIso = new Date().toISOString();
    let transferredCount = 0;
    state.movements.forEach((m) => {
      if (m.centerId !== center.id || m.status !== 'requested') return;
      const oldCourierName = state.couriers.find((c) => c.id === m.courierId)?.name || 'المراسل السابق';
      m.courierId = nextCourier.id;
      transferredCount += 1;
      m.auditTrail = [
        ...(m.auditTrail || []),
        {
          at: nowIso,
          action: 'reassigned',
          byRole,
          byName: byRole,
          note: `نقل طلب غير مستلم من ${oldCourierName} إلى ${nextCourier.name}`,
        },
      ];
      const urgent = m.requestType === 'urgent';
      m.notificationStatus = {
        ...(m.notificationStatus || {}),
        appSentAt: nowIso,
        smsStatus: 'pending',
        smsDueAt: urgent
          ? nowIso
          : new Date(Date.now() + 2 * 60 * 1000).toISOString(),
      };
      if (urgent) sendSmsForMovement(state, m, true);
    });

    state.notifications.unshift({
      id: makeId('ntf'),
      channel: 'app',
      recipientRole: 'courier',
      recipientName: nextCourier.name,
      message:
        `تم إسناد مركز ${center.name} إليك ابتداءً من الطلبات الجديدة.` +
        (transferredCount > 0 ? ` وتم نقل ${transferredCount} طلب غير مستلم إليك.` : ''),
      createdAt: nowIso,
      read: false,
    });

    saveDb(state);
    res.json({ center, state });
  });

  app.post('/api/movements/scan-qr', (req, res) => {
    const state = ensureDb();
    const { code } = req.body as { code: string };
    const clean = (code || '').trim().toUpperCase();

    let targetBatch = clean;
    try {
      const parsed = JSON.parse(code) as { batchCode?: string };
      if (parsed?.batchCode) targetBatch = parsed.batchCode.trim().toUpperCase();
    } catch {
    }

    const movement = state.movements.find(
      (m) => m.batchCode.toUpperCase() === targetBatch || m.id.toUpperCase() === targetBatch
    );

    if (!movement) {
      return res.status(404).json({ error: `لم يتم العثور على دفعة بالرمز ${targetBatch}` });
    }

    if (movement.status === 'returned_to_center') {
      return res.json({
        alreadyCompleted: true,
        message: `الدفعة ${movement.batchCode} مكتملة الإرجاع للمركز مسبقاً.`,
        movement,
        state,
      });
    }

    if (movement.status === 'cancelled') {
      return res.status(400).json({
        error: `الدفعة ${movement.batchCode} ملغية ولا يمكن تحديث حالتها عبر المسح.`,
      });
    }

    const msg = advanceMovementInternal(state, movement);
    saveDb(state);
    res.json({
      alreadyCompleted: false,
      message: msg,
      movement,
      state,
    });
  });

  app.post('/api/vouchers', (req, res) => {
    const state = ensureDb();
    const {
      courierId,
      centerId,
      sampleMovementId,
      type,
      amount,
      voucherNumber,
      date,
      enteredBy = 'courier',
      notes,
      attachmentName,
      aiExtracted,
    } = req.body as {
      courierId: string;
      centerId: string;
      sampleMovementId?: string;
      type: VoucherType;
      amount: number;
      voucherNumber?: string;
      date?: string;
      enteredBy?: 'courier' | 'admin' | 'supervisor';
      notes?: string;
      attachmentName?: string;
      aiExtracted?: boolean;
    };

    if (!courierId || !centerId || !type || !amount || Number(amount) <= 0) {
      return res.status(400).json({ error: 'يرجى تعبئة جميع الحقول الإلزامية بقيم صحيحة' });
    }

    if (!['cash', 'deferred', 'guarantee'].includes(type)) {
      return res.status(400).json({ error: 'نوع السند غير صالح' });
    }

    const courier = state.couriers.find((c) => c.id === courierId);
    const center = state.centers.find((c) => c.id === centerId);
    if (!courier || !center) {
      return res.status(400).json({ error: 'المراسل أو المركز غير موجود' });
    }

    const approvalStatus: VoucherApprovalStatus =
      type === 'guarantee' ? 'pending_review' : 'auto_approved';

    const prefix = type === 'cash' ? 'REC' : type === 'deferred' ? 'DEF' : 'GUA';
    const generatedNum = `${prefix}-${Math.floor(9200 + Math.random() * 799)}`;

    const voucher: Voucher = {
      id: makeId('vch'),
      voucherNumber: (voucherNumber || '').trim() || generatedNum,
      courierId,
      centerId,
      sampleMovementId: sampleMovementId || undefined,
      type,
      amount: Number(amount),
      date: date || new Date().toISOString().slice(0, 10),
      enteredBy,
      notes: (notes || '').trim() || (type === 'guarantee' ? 'ضمان مركز في النظام' : 'سند موثق'),
      attachmentName: attachmentName || undefined,
      aiExtracted: Boolean(aiExtracted),
      approvalStatus,
      createdAt: new Date().toISOString(),
    };

    state.vouchers.unshift(voucher);

    if (type === 'guarantee') {
      state.notifications.unshift({
        id: makeId('ntf'),
        channel: 'app',
        recipientRole: 'admin',
        recipientName: 'إدارة المطابقة المالية',
        message: `سند ضمان جديد (${voucher.voucherNumber}) بقيمة ${voucher.amount} ر.ي من ${courier.name} لـ ${center.name} بانتظار المراجعة.`,
        createdAt: new Date().toISOString(),
        read: false,
      });
    }

    saveDb(state);
    res.json({ voucher, state });
  });

  app.patch('/api/vouchers/:id/decision', (req, res) => {
    const state = ensureDb();
    const voucher = state.vouchers.find((v) => v.id === req.params.id);
    if (!voucher) {
      return res.status(404).json({ error: 'السند غير موجود' });
    }

    const { decision } = req.body as {
      decision: 'approved_as_deferred' | 'suspended' | 'rejected';
    };

    if (!['approved_as_deferred', 'suspended', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'قرار غير صالح' });
    }

    voucher.approvalStatus = decision;
    const courier = state.couriers.find((c) => c.id === voucher.courierId);
    const center = state.centers.find((c) => c.id === voucher.centerId);

    const decisionLabel =
      decision === 'approved_as_deferred'
        ? 'تم اعتماد الضمان كآجل (0.5%)'
        : decision === 'suspended'
        ? 'تم تعليق الضمان حتى السداد الفعلي'
        : 'تم رفض السند لعدم التطابق';

    state.notifications.unshift({
      id: makeId('ntf'),
      channel: 'app',
      recipientRole: 'courier',
      recipientName: courier?.name || 'المراسل',
      message: `${decisionLabel} — سند ${voucher.voucherNumber} (${center?.name || ''}).`,
      createdAt: new Date().toISOString(),
      read: false,
    });

    saveDb(state);
    res.json({ voucher, state });
  });

  app.post('/api/lab-import', (req, res) => {
    const state = ensureDb();
    const { rows, replaceExisting = true, periodLabel } = req.body as {
      rows: Array<{
        centerName: string;
        sampleCount: number;
        totalAmount: number;
        labType?: string;
        date?: string;
        notes?: string;
      }>;
      replaceExisting?: boolean;
      periodLabel?: string;
    };

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'ملف تقرير المختبر فارغ أو غير صالح' });
    }

    const importBatchId = `IMP-${Date.now().toString().slice(-5)}`;
    const parsedRows: LabReportRow[] = rows
      .filter((r) => r.centerName && Number(r.totalAmount) >= 0)
      .map((r) => {
        const cleanName = String(r.centerName).trim();
        const matchedCenter = state.centers.find(
          (c) =>
            c.name.trim() === cleanName ||
            c.name.includes(cleanName) ||
            cleanName.includes(c.name) ||
            c.aliases.some((a) => cleanName.includes(a) || a.includes(cleanName))
        );

        return {
          id: makeId('lab'),
          importBatchId,
          periodLabel: periodLabel || state.currentPeriod,
          centerName: cleanName,
          centerId: matchedCenter ? matchedCenter.id : null,
          sampleCount: Math.max(0, Number(r.sampleCount) || 0),
          totalAmount: Math.max(0, Number(r.totalAmount) || 0),
          labType: (r.labType || 'غير محدد').trim(),
          date: r.date || new Date().toISOString().slice(0, 10),
          notes: r.notes || '',
        };
      });

    if (replaceExisting) {
      state.labRows = parsedRows;
    } else {
      state.labRows = [...parsedRows, ...state.labRows];
    }

    state.notifications.unshift({
      id: makeId('ntf'),
      channel: 'app',
      recipientRole: 'admin',
      recipientName: 'إدارة المطابقة المالية',
      message: `تم استيراد تقرير المختبر (${importBatchId}) بنجاح بعدد ${parsedRows.length} سطر مركز وتحديث المطابقة الآلية.`,
      createdAt: new Date().toISOString(),
      read: false,
    });

    saveDb(state);
    res.json({ importedCount: parsedRows.length, state });
  });

  app.post('/api/reconciliation/resolve', (req, res) => {
    const state = ensureDb();
    const { centerId, courierId, amount, resolutionType, note } = req.body as {
      centerId: string;
      courierId: string;
      amount: number;
      resolutionType: GapAttribution['resolutionType'];
      note?: string;
    };

    const center = state.centers.find((c) => c.id === centerId);
    const courier = state.couriers.find((c) => c.id === courierId);
    if (!center || !courier || !amount || amount <= 0) {
      return res.status(400).json({ error: 'بيانات تسوية الفجوة غير مكتملة' });
    }

    const currentReconciliation = reconcileCenters(
      state.centers,
      state.sectors,
      state.couriers,
      state.vouchers,
      state.movements,
      state.labRows,
      state.gapAttributions
    ).find((r) => r.center.id === centerId);
    const remainingGap = currentReconciliation?.gapAmount ?? 0;
    const safeAmount = Math.min(Number(amount), remainingGap);
    if (safeAmount <= 0) {
      return res.status(400).json({
        error: 'لا توجد فجوة متبقية لهذا المركز. حدّث المطابقة قبل تسجيل تسوية جديدة.',
      });
    }

    const attribution: GapAttribution = {
      id: makeId('gap'),
      centerId,
      courierId,
      amount: safeAmount,
      resolutionType,
      note: (note || '').trim() || 'تسوية مطابقة إدارية',
      updatedAt: new Date().toISOString(),
    };

    state.gapAttributions.unshift(attribution);

    if (resolutionType === 'settled_cash' && center.overdueBalance > 0) {
      center.overdueBalance = Math.max(0, center.overdueBalance - safeAmount);
      if (center.overdueBalance === 0 && center.status === 'overdue') {
        center.status = 'active';
      }
      courier.arrearsCollectedCount += 1;
    }

    state.notifications.unshift({
      id: makeId('ntf'),
      channel: 'app',
      recipientRole: 'courier',
      recipientName: courier.name,
      message: `تحديث مطابقة لمركز ${center.name}: تم تسجيل تسوية بقيمة ${safeAmount} ر.ي.`,
      createdAt: new Date().toISOString(),
      read: false,
    });

    saveDb(state);
    res.json({ attribution, state });
  });

  app.patch('/api/couriers/:id/target', (req, res) => {
    const state = ensureDb();
    const courier = state.couriers.find((c) => c.id === req.params.id);
    if (!courier) {
      return res.status(404).json({ error: 'المراسل غير موجود' });
    }
    const { regionAvg, growthTargetPct } = req.body as {
      regionAvg?: number;
      growthTargetPct?: number;
    };
    if (typeof regionAvg === 'number' && regionAvg > 0) {
      courier.regionAvg = regionAvg;
    }
    if (typeof growthTargetPct === 'number' && growthTargetPct >= 0) {
      courier.growthTargetPct = growthTargetPct;
    }
    saveDb(state);
    res.json({ courier, state });
  });

  app.post('/api/centers', (req, res) => {
    const state = ensureDb();
    const { name, sectorId, address, phone, primaryCourierId, monthlyAvgRevenue } =
      req.body as {
        name: string;
        sectorId: MedicalCenter['sectorId'];
        address: string;
        phone: string;
        primaryCourierId: string;
        monthlyAvgRevenue?: number;
      };
    if (!name || !sectorId || !primaryCourierId) {
      return res.status(400).json({ error: 'يرجى إدخال اسم المركز والقطاع والمراسل المسؤول' });
    }

    const offsetLat = (Math.random() - 0.5) * 0.03;
    const offsetLng = (Math.random() - 0.5) * 0.03;

    const newCenter: MedicalCenter = {
      id: makeId('ctr'),
      name: name.trim(),
      aliases: [name.trim()],
      sectorId,
      address: (address || '').trim() || 'صنعاء - العنوان الرئيسي',
      phone: (phone || '').trim() || '01-000000',
      location: {
        lat: Number((state.labLocation.lat + offsetLat).toFixed(4)),
        lng: Number((state.labLocation.lng + offsetLng).toFixed(4)),
      },
      primaryCourierId,
      monthlyAvgRevenue: Number(monthlyAvgRevenue) || 200_000,
      overdueBalance: 0,
      status: 'active',
    };
    state.centers.push(newCenter);
    const courier = state.couriers.find((c) => c.id === primaryCourierId);
    if (courier && !courier.assignedCenterIds.includes(newCenter.id)) {
      courier.assignedCenterIds.push(newCenter.id);
    }
    saveDb(state);
    res.json({ center: newCenter, state });
  });

  app.patch('/api/notifications/:id/read', (req, res) => {
    const state = ensureDb();
    const notification = state.notifications.find((n) => n.id === req.params.id);
    if (!notification) {
      return res.status(404).json({ error: 'التنبيه غير موجود' });
    }
    notification.read = true;
    saveDb(state);
    res.json({ notification, state });
  });

  app.patch('/api/notifications/read-all', (_req, res) => {
    const state = ensureDb();
    state.notifications.forEach((n) => {
      n.read = true;
    });
    saveDb(state);
    res.json({ state });
  });

  app.post('/api/reset-demo', (_req, res) => {
    const fresh = createInitialSeedState();
    saveDb(fresh);
    res.json({ state: fresh });
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
