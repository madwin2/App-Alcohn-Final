import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import type { AppArea, NotificacionItem } from '@/lib/notificaciones/types';
import {
  fetchMyNotifications,
  fetchNotificationByDestinatarioId,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/supabase/services/notificaciones.service';

export function useNotifications() {
  const { user } = useAuth();
  const [items, setItems] = useState<NotificacionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [badgePulse, setBadgePulse] = useState(false);
  const prevUnreadRef = useRef(0);

  const reload = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await fetchMyNotifications();
      setItems(data);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setItems([]);
      setLoading(false);
      return;
    }
    void reload();

    const channel = supabase
      .channel(`notificaciones-feed-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notificacion_destinatarios',
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          const id = (payload.new as { id?: string } | null)?.id;
          if (!id) {
            void reload(true);
            return;
          }
          const item = await fetchNotificationByDestinatarioId(id);
          if (!item) {
            void reload(true);
            return;
          }
          setItems((prev) => {
            if (prev.some((p) => p.destinatarioId === item.destinatarioId)) return prev;
            return [{ ...item, isNew: true }, ...prev];
          });
          window.setTimeout(() => {
            setItems((prev) =>
              prev.map((p) =>
                p.destinatarioId === item.destinatarioId ? { ...p, isNew: false } : p,
              ),
            );
          }, 1100);
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notificacion_destinatarios',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as { id?: string; leida_at?: string | null } | null;
          if (!row?.id) return;
          setItems((prev) =>
            prev.map((p) =>
              p.destinatarioId === row.id ? { ...p, leidaAt: row.leida_at ?? null } : p,
            ),
          );
        },
      )
      .subscribe();

    const onVisible = () => {
      if (document.visibilityState === 'visible') void reload(true);
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(channel);
    };
  }, [user?.id, reload]);

  const unreadCount = useMemo(() => items.filter((i) => !i.leidaAt).length, [items]);
  const unreadByArea = useMemo(() => {
    const map: Record<AppArea, number> = { produccion: 0, logistica: 0, ventas: 0 };
    for (const item of items) {
      if (item.leidaAt || !item.area) continue;
      map[item.area] += 1;
    }
    return map;
  }, [items]);

  useEffect(() => {
    if (unreadCount > prevUnreadRef.current) {
      setBadgePulse(true);
      const t = window.setTimeout(() => setBadgePulse(false), 700);
      prevUnreadRef.current = unreadCount;
      return () => window.clearTimeout(t);
    }
    prevUnreadRef.current = unreadCount;
  }, [unreadCount]);

  const markRead = useCallback(async (destinatarioId: string) => {
    setItems((prev) =>
      prev.map((p) =>
        p.destinatarioId === destinatarioId
          ? { ...p, leidaAt: p.leidaAt ?? new Date().toISOString() }
          : p,
      ),
    );
    await markNotificationRead(destinatarioId);
  }, []);

  const markAllRead = useCallback(async (area?: AppArea | null) => {
    const now = new Date().toISOString();
    setItems((prev) =>
      prev.map((p) => {
        if (p.leidaAt) return p;
        if (area && p.area !== area) return p;
        return { ...p, leidaAt: now };
      }),
    );
    await markAllNotificationsRead(area);
  }, []);

  return {
    items,
    loading,
    unreadCount,
    unreadByArea,
    badgePulse,
    reload,
    markRead,
    markAllRead,
  };
}
