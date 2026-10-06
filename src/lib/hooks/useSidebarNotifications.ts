import { useCallback, useEffect, useState } from 'react';
import {
  fetchComercialPagosNuevosBadgeCount,
  fetchPedidosMissingFilesBadgeCount,
  fetchProgramasUrgentesSinProgramarBadgeCount,
  markComercialPagosAsSeen,
} from '@/lib/supabase/services/sidebarNotifications.service';
import { contarIdeasCorchoNuevas } from '@/lib/supabase/services/equipoCorcho.service';
import { useLocation } from 'react-router-dom';

const POLL_MS = 60_000;

export function useSidebarNotifications() {
  const location = useLocation();
  const [pedidosBadge, setPedidosBadge] = useState(0);
  const [comercialBadge, setComercialBadge] = useState(0);
  const [programasBadge, setProgramasBadge] = useState(0);
  const [corchoBadge, setCorchoBadge] = useState(0);

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

  const refreshCorcho = useCallback(async () => {
    try {
      const count = await contarIdeasCorchoNuevas();
      setCorchoBadge(count);
    } catch (err) {
      console.warn('[sidebar] corcho badge:', err);
    }
  }, []);

  useEffect(() => {
    void refreshPedidos();
    void refreshComercial();
    void refreshProgramas();
    void refreshCorcho();
  }, [refreshPedidos, refreshComercial, refreshProgramas, refreshCorcho]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void refreshPedidos();
      void refreshComercial();
      void refreshProgramas();
      void refreshCorcho();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [refreshPedidos, refreshComercial, refreshProgramas, refreshCorcho]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void refreshPedidos();
        void refreshComercial();
        void refreshProgramas();
        void refreshCorcho();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refreshPedidos, refreshComercial, refreshProgramas, refreshCorcho]);

  // Al salir del corcho, refrescar el badge (las vistas se marcaron en la sesión).
  useEffect(() => {
    if (location.pathname !== '/corcho') {
      void refreshCorcho();
    }
  }, [location.pathname, refreshCorcho]);

  return { pedidosBadge, comercialBadge, programasBadge, corchoBadge };
}
