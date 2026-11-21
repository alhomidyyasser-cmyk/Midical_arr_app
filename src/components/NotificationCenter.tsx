import React from 'react';
import { Bell, CheckCheck, ClipboardList, MessageSquare, Truck } from 'lucide-react';
import type { NotificationItem } from '../types.ts';
import { Drawer } from './Drawer.tsx';
import { EmptyState, Pill, SectionHeading } from './ui/Premium.tsx';

interface NotificationCenterProps {
  open: boolean;
  onClose: () => void;
  notifications: NotificationItem[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
}

const channelLabel = { app: 'داخل النظام', sms: 'رسالة SMS' } as const;
const roleLabel = {
  admin: 'الإدارة',
  supervisor: 'المشرف',
  courier: 'المراسل',
  center: 'المركز',
} as const;

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  open,
  onClose,
  notifications,
  onMarkRead,
  onMarkAllRead,
}) => {
  const unread = notifications.filter((n) => !n.read).length;
  const ordered = [...notifications].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="مركز التنبيهات"
      subtitle={`${notifications.length} تنبيه · ${unread} غير مقروء`}
    >
      <SectionHeading
        eyebrow="السجل المباشر"
        title="كل ما يهمك في مكان واحد"
        action={
          unread > 0 ? (
            <button className="btn-outline" onClick={onMarkAllRead} type="button">
              <CheckCheck className="h-4 w-4" />
              تحديد الكل كمقروء
            </button>
          ) : undefined
        }
      />

      <div className="mt-5 space-y-3">
        {ordered.length === 0 ? (
          <EmptyState
            icon={<Bell className="h-5 w-5" />}
            title="لا توجد تنبيهات بعد"
            description="ستظهر إشعارات الطلبات وتغييرات الحالة هنا مباشرة."
          />
        ) : (
          ordered.map((n) => (
            <article
              key={n.id}
              className={`glass-card p-4 ${n.read ? '' : 'border-[#0b6e63]/25 bg-[#0b6e63]/[0.03]'}`}
            >
              <div className="flex items-start gap-3">
                <span className="kpi-icon flex-shrink-0">
                  {n.channel === 'sms' ? (
                    <MessageSquare className="h-4 w-4" />
                  ) : n.message.includes('طلب') ? (
                    <ClipboardList className="h-4 w-4" />
                  ) : (
                    <Truck className="h-4 w-4" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone={n.channel === 'sms' ? 'gold' : 'brand'}>
                      {channelLabel[n.channel]}
                    </Pill>
                    <Pill tone="slate">{roleLabel[n.recipientRole]}</Pill>
                    {!n.read && <Pill tone="green">جديد</Pill>}
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-slate-700">{n.message}</p>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="text-[10px] text-slate-400" dir="ltr">
                      {new Date(n.createdAt).toLocaleString('en-GB')}
                    </span>
                    {!n.read && (
                      <button
                        type="button"
                        onClick={() => onMarkRead(n.id)}
                        className="text-[11px] font-bold text-[#0b6e63] hover:underline"
                      >
                        تحديد كمقروء
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </Drawer>
  );
};
