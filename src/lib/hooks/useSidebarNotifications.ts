import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  fetchComercialPagosNuevosBadgeCount,
  fetchPedidosMissingFilesBadgeCount,
  markComercialPagosAsSeen,
} from '@/lib/supabase/services/sidebarNotifications.service';

const POLL_MS = 60_000;

export function useSidebarNotifications() {
  const location = useLocation();
  const [pedidosBadge, setPedidosBadge] = useState(0);
  const [comercialBadge, setComercialBadge] = useState(0);

  const refreshPedidos = useCallback(async () => {
    try {
      const count = await fetchPedidosMissingFilesBadgeCount(50);
      setPedidosBadge(count);
    } catch (err) {
      console.warn('[sidebar] pedidos badge:', err);
    }
  }, []);

  const refreshComercial = useCallback(async () => {
    try {
      if (location.pathname === '/comercial') {
        await markComercialPagosAsSeen();
        setComercialBadge(0);
        return;
      }
      const count = await fetchComercialPagosNuevosBadgeCount();
      setComercialBadge(count);
    } catch (err) {
      console.warn('[sidebar] comercial badge:', err);
    }
  }, [location.pathname]);

  useEffect(() => {
    void refreshPedidos();
    void refreshComercial();
  }, [refreshPedidos, refreshComercial]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void refreshPedidos();
      void refreshComercial();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [refreshPedidos, refreshComercial]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void refreshPedidos();
        void refreshComercial();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refreshPedidos, refreshComercial]);

  return { pedidosBadge, comercialBadge };
}
