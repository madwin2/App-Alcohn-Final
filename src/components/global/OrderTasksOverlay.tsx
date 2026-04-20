import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import {
  deleteOrderStickyTask,
  getOrderStickyTasksForUser,
  updateOrderStickyTaskPosition,
  type OrderStickyTask,
} from '@/lib/supabase/services/order-sticky-tasks.service';
import { updateTask } from '@/lib/supabase/services/orders.service';
import { cn } from '@/lib/utils/cn';
import stickyNoteTaskWorkmateSvg from '@/assets/sticky-notes/sticky-note-task-workmate.svg';

const NOTE_SIZE = 82;

export function OrderTasksOverlay() {
  const location = useLocation();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [tasks, setTasks] = useState<OrderStickyTask[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [removingId, setRemovingId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastPosRef = useRef({ x: 0, y: 0 });

  const isLoginRoute = location.pathname === '/login';

  const fetchTasks = useCallback(async () => {
    if (!user?.id || !isAuthenticated || isLoginRoute) return;
    const nextTasks = await getOrderStickyTasksForUser(user.id);
    setTasks(nextTasks);
  }, [user?.id, isAuthenticated, isLoginRoute]);

  useEffect(() => {
    if (authLoading || !user?.id || !isAuthenticated || isLoginRoute) return;
    fetchTasks();
  }, [fetchTasks, user?.id, isAuthenticated, authLoading, isLoginRoute]);

  useEffect(() => {
    if (authLoading || !user?.id || !isAuthenticated || isLoginRoute) return;

    const interval = window.setInterval(() => {
      fetchTasks();
    }, 12000);

    const channel = supabase
      .channel('order-sticky-tasks-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tareas_pedidos_globales' },
        () => {
          fetchTasks();
        }
      )
      .subscribe();

    return () => {
      window.clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [fetchTasks, user?.id, isAuthenticated, authLoading, isLoginRoute]);

  const handlePointerDown = useCallback((e: React.PointerEvent, task: OrderStickyTask) => {
    e.preventDefault();
    setDraggingId(task.id);
    setDragOffset({
      x: e.clientX - task.posX,
      y: e.clientY - task.posY,
    });
    lastPosRef.current = { x: task.posX, y: task.posY };
  }, []);

  useEffect(() => {
    if (!draggingId || !containerRef.current) return;

    const handlePointerMove = (e: PointerEvent) => {
      const rect = containerRef.current!.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width - NOTE_SIZE, e.clientX - rect.left - dragOffset.x));
      const y = Math.max(0, Math.min(rect.height - NOTE_SIZE, e.clientY - rect.top - dragOffset.y));
      const rounded = { x: Math.round(x), y: Math.round(y) };
      lastPosRef.current = rounded;

      setTasks((prev) => prev.map((t) => (t.id === draggingId ? { ...t, posX: rounded.x, posY: rounded.y } : t)));
    };

    const handlePointerUp = async () => {
      if (!draggingId) return;
      const { x, y } = lastPosRef.current;
      try {
        await updateOrderStickyTaskPosition(draggingId, x, y);
      } catch {
        fetchTasks();
      } finally {
        setDraggingId(null);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [dragOffset, draggingId, fetchTasks]);

  const handleDone = useCallback(async (task: OrderStickyTask) => {
    setRemovingId(task.id);
    try {
      await updateTask(task.taskId, {
        status: 'COMPLETED',
        completedAt: new Date().toISOString(),
      });
      await deleteOrderStickyTask(task.id);
      setTimeout(() => {
        setTasks((prev) => prev.filter((t) => t.id !== task.id));
        setRemovingId(null);
      }, 250);
    } catch {
      setRemovingId(null);
    }
  }, []);

  if (authLoading || !isAuthenticated || !user?.id || isLoginRoute || tasks.length === 0) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="pointer-events-none fixed left-20 right-6 top-6 bottom-6 z-[70]"
      aria-hidden
    >
      {tasks.map((task, idx) => {
        const isDefaultPos = (task.posX ?? 0) === 0 && (task.posY ?? 0) === 0;
        const left = isDefaultPos ? 60 : task.posX;
        const top = isDefaultPos ? 60 + idx * 95 : task.posY;

        return (
          <div
            key={task.id}
            className={cn(
              'group absolute w-[82px] h-[82px] transition-all duration-300 ease-out cursor-grab active:cursor-grabbing pointer-events-auto',
              removingId === task.id && 'scale-0 opacity-0 pointer-events-none',
              draggingId === task.id && 'z-50 cursor-grabbing'
            )}
            style={{ left, top }}
            onPointerDown={(e) => handlePointerDown(e, { ...task, posX: left, posY: top })}
          >
            <img
              src={stickyNoteTaskWorkmateSvg}
              alt=""
              className="w-full h-full object-contain drop-shadow-[0_4px_20px_rgba(0,0,0,0.4)] pointer-events-none"
            />
            <div className="absolute inset-0 flex items-center justify-center p-2 text-[10px] text-foreground text-center leading-tight overflow-hidden pointer-events-none">
              <span className="whitespace-pre-wrap line-clamp-3">{task.text}</span>
            </div>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-lg flex items-center justify-center">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDone(task);
                }}
                className="text-[11px] text-white/90 hover:text-white font-medium tracking-wide"
              >
                Hecho
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
