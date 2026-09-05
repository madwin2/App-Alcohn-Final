import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  fetchComercialPagosNuevosBadgeCount,
  fetchPedidosMissingFilesBadgeCount,
  fetchProgramasUrgentesSinProgramarBadgeCount,
  markComercialPagosAsSeen,
} from '@/lib/supabase/services/sidebarNotifications.service';

const POLL_MS = 60_000;

export function useSidebarNotifications() {
  const location = useLocation();
  const [pedidosBadge, setPedidosBadge] = useState(0);
  const [comercialBadge, setComercialBadge] = useState(0);
  const [programasBadge, setProgramasBadge] = useState(0);

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

  const refreshProgramas = useCallback(async () => {
    try {
      const count = await fetchProgramasUrgentesSinProgramarBadgeCount();
      setProgramasBadge(count);
    } catch (err) {
      console.warn('[sidebar] programas badge:', err);
    }
  }, []);

  useEffect(() => {
    void refreshPedidos();
    void refreshComercial();
    void refreshProgramas();
  }, [refreshPedidos, refreshComercial, refreshProgramas]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void refreshPedidos();
      void refreshComercial();
      void refreshProgramas();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [refreshPedidos, refreshComercial, refreshProgramas]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void refreshPedidos();
        void refreshComercial();
        void refreshProgramas();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refreshPedidos, refreshComercial, refreshProgramas]);

  return { pedidosBadge, comercialBadge, programasBadge };
}
