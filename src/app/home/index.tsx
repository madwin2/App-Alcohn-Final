import { useMemo, useEffect, useState, useCallback, useRef, useDeferredValue } from 'react';
import { Package } from 'lucide-react';
import { AppMain } from '@/components/layout/AppMain';
import { useOrders } from '@/lib/hooks/useOrders';
import { useAuth } from '@/lib/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Toaster } from '@/components/ui/toaster';
import { cn } from '@/lib/utils/cn';
import type { Order, OrderItem } from '@/lib/types';
import { getApprovedUsers } from '@/lib/supabase/services/auth.service';
import { supabase } from '@/lib/supabase/client';
import {
  getDashboardTasksForUser,
  deleteDashboardTask,
  type DashboardTask,
} from '@/lib/supabase/services/dashboard-tasks.service';
import { AddTaskToColleagueDialog } from '@/components/home/AddTaskToColleagueDialog';
import {
  updateDashboardTaskPosition,
} from '@/lib/supabase/services/dashboard-tasks.service';
import {
  parseStockReplenishTask,
  syncStockReplenishTasksForCurrentUser,
  type StockReplenishPayload,
} from '@/lib/supabase/services/stock.service';
import { StockReplenishSection } from '@/components/home/StockReplenishSection';
import stickyNoteAddSvg from '@/assets/sticky-notes/sticky-note-add.svg';
import stickyNoteTaskSvg from '@/assets/sticky-notes/sticky-note-task.svg';
import stickyNoteAddWorkmateSvg from '@/assets/sticky-notes/sticky-note-add-workmate.svg';
import stickyNoteTaskWorkmateSvg from '@/assets/sticky-notes/sticky-note-task-workmate.svg';
import {
  getUserInicioImage,
  getUserProfileImage,
} from '@/lib/utils/userImages';
import { UserTaskWidget } from '@/components/home/UserTaskWidget';
import { HomeUserDock } from '@/components/home/HomeUserDock';

const NOTE_SIZE = 82;

interface StickyNote {
  id: string;
  text: string;
  x: number;
  y: number;
}

function useStickyNotes(userId?: string | null) {
  const [notes, setNotes] = useState<StickyNote[]>([]);

  useEffect(() => {
    if (!userId) return;
    try {
      const raw = localStorage.getItem(`dashboard_notes_${userId}`);
      if (raw) {
        const parsed = JSON.parse(raw) as (StickyNote | { id: string; text: string })[];
        setNotes(
          parsed.map((n) =>
            'x' in n && typeof n.x === 'number'
              ? n
              : { ...n, x: 0, y: 0 }
          )
        );
      }
    } catch {
      // ignore
    }
  }, [userId]);

  const persist = (next: StickyNote[]) => {
    setNotes(next);
    if (!userId) return;
    try {
      localStorage.setItem(`dashboard_notes_${userId}`, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const addNote = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const next: StickyNote[] = [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        text: trimmed,
        x: 0,
        y: 0,
      },
      ...notes,
    ];
    persist(next);
  };

  const removeNote = (id: string) => {
    const next = notes.filter((n) => n.id !== id);
    persist(next);
  };

  const updateNotePosition = (id: string, x: number, y: number) => {
    const next = notes.map((n) => (n.id === id ? { ...n, x, y } : n));
    persist(next);
  };

  return { notes, addNote, removeNote, updateNotePosition };
}

interface StampWithOrder {
  order: Order;
  item: OrderItem;
}

interface OrderWithItems {
  order: Order;
  items: OrderItem[];
}

function groupStampsByOrder(stamps: StampWithOrder[]): OrderWithItems[] {
  const byOrder = new Map<string, OrderWithItems>();
  for (const { order, item } of stamps) {
    const existing = byOrder.get(order.id);
    if (existing) {
      existing.items.push(item);
    } else {
      byOrder.set(order.id, { order, items: [item] });
    }
  }
  return Array.from(byOrder.values());
}

export default function HomePage() {
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const { orders } = useOrders();
  const deferredOrders = useDeferredValue(orders);

  const userName =
    user?.user_metadata?.nombre
      ? `${user.user_metadata.nombre} ${user.user_metadata.apellido || ''}`.trim()
      : 'Usuario';

  const { notes, addNote, removeNote, updateNotePosition } = useStickyNotes(user?.id);
  const [isAdding, setIsAdding] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removingColleagueId, setRemovingColleagueId] = useState<string | null>(null);
  const [approvedUsers, setApprovedUsers] = useState<Array<{ id: string; name: string }>>([]);
  const [colleagueTasks, setColleagueTasks] = useState<DashboardTask[]>([]);
  const [isAddToColleagueOpen, setIsAddToColleagueOpen] = useState(false);
  const [stockReplenishSyncedAt, setStockReplenishSyncedAt] = useState<Date | null>(null);
  // Animación de entrada del saludo "Hola Nombre!" al cargar la página
  const [greetingVisible, setGreetingVisible] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setGreetingVisible(true), 250);
    return () => window.clearTimeout(t);
  }, []);

  // Scroll por tandas (snap): 0 = vista inicial (cards laterales + saludo),
  // 1 = Sellos Listos, 2 = Pedidos prioritarios.
  // Cada gesto de scroll sube/baja una tanda (no es scroll libre).
  const [tanda, setTanda] = useState(0);
  const TOTAL_TANDAS = 3;
  useEffect(() => {
    let cooldown = false;
    // Evita que el snap por tandas interfiera cuando hay un modal/diálogo abierto
    // (Radix marca el diálogo con data-state="open") o cuando el evento viene de un
    // control interactivo (inputs, textareas, selects, listas desplegables, etc.).
    const isModalOpen = () =>
      typeof document !== 'undefined' &&
      document.querySelector(
        '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
      ) !== null;
    const isInteractiveTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      if (target.isContentEditable) return true;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (
        target.closest(
          '[role="dialog"], [role="alertdialog"], [role="listbox"], [role="menu"], [role="combobox"]',
        )
      ) {
        return true;
      }
      return false;
    };
    const handleWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < 5) return;
      if (isModalOpen() || isInteractiveTarget(e.target)) return;
      e.preventDefault();
      if (cooldown) return;
      cooldown = true;
      window.setTimeout(() => {
        cooldown = false;
      }, 750);
      if (e.deltaY > 0) {
        setTanda((p) => Math.min(p + 1, TOTAL_TANDAS - 1));
      } else {
        setTanda((p) => Math.max(p - 1, 0));
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isModalOpen() || isInteractiveTarget(e.target)) return;
      if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        setTanda((p) => Math.min(p + 1, TOTAL_TANDAS - 1));
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        setTanda((p) => Math.max(p - 1, 0));
      } else if (e.key === 'Home') {
        e.preventDefault();
        setTanda(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setTanda(TOTAL_TANDAS - 1);
      }
    };
    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const fetchColleagueTasks = useCallback(async () => {
    if (!user?.id || !isAuthenticated) return;
    await syncStockReplenishTasksForCurrentUser();
    const tasks = await getDashboardTasksForUser(user.id);
    setColleagueTasks(tasks);
    setStockReplenishSyncedAt(new Date());
  }, [user?.id, isAuthenticated]);

  /** Tareas tipo reposición vs post-its sociales entre compañeros */
  const { stockReplenishVms, stickyColleagueTasks } = useMemo(() => {
    const stockReplenishVms: { task: DashboardTask; payload: StockReplenishPayload }[] = [];
    const stickyColleagueTasks: DashboardTask[] = [];

    colleagueTasks.forEach((task) => {
      const payload = parseStockReplenishTask(task.texto);
      if (payload) {
        stockReplenishVms.push({ task, payload });
      } else {
        stickyColleagueTasks.push(task);
      }
    });

    stockReplenishVms.sort(
      (a, b) => new Date(a.task.createdAt).getTime() - new Date(b.task.createdAt).getTime(),
    );
    return { stockReplenishVms, stickyColleagueTasks };
  }, [colleagueTasks]);

  useEffect(() => {
    if (authLoading) return;
    fetchColleagueTasks();
  }, [fetchColleagueTasks]);

  // Fallback + realtime para que las tareas de compañeros se actualicen sin refresh
  useEffect(() => {
    if (authLoading || !user?.id || !isAuthenticated) return;

    const interval = window.setInterval(() => {
      fetchColleagueTasks();
    }, 12000);

    const channel = supabase
      .channel('tasks-dashboard-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tareas_dashboard' },
        () => {
          fetchColleagueTasks();
        },
      )
      .subscribe();

    return () => {
      window.clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [user?.id, fetchColleagueTasks, authLoading, isAuthenticated]);

  const handleMarkDone = useCallback((id: string) => {
    setRemovingId(id);
    setTimeout(() => {
      removeNote(id);
      setRemovingId(null);
    }, 300);
  }, [removeNote]);

  const handleColleagueTaskDone = useCallback(
    async (id: string) => {
      setRemovingColleagueId(id);
      try {
        await deleteDashboardTask(id);
        setTimeout(() => {
          setColleagueTasks((prev) => prev.filter((t) => t.id !== id));
          setRemovingColleagueId(null);
        }, 300);
      } catch {
        setRemovingColleagueId(null);
      }
    },
    []
  );

  const handleColleagueTaskMove = useCallback(
    async (id: string, x: number, y: number) => {
      setColleagueTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, posX: x, posY: y } : t))
      );
      try {
        await updateDashboardTaskPosition(id, x, y);
      } catch {
        // revert on error
        fetchColleagueTasks();
      }
    },
    [fetchColleagueTasks]
  );

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isPersonalNote, setIsPersonalNote] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastPosRef = useRef({ x: 0, y: 0 });

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, id: string, currentX: number, currentY: number, personal: boolean) => {
      e.preventDefault();
      setDraggingId(id);
      setIsPersonalNote(personal);
      setDragOffset({
        x: e.clientX - currentX,
        y: e.clientY - currentY,
      });
      lastPosRef.current = { x: currentX, y: currentY };
    },
    []
  );

  useEffect(() => {
    if (!draggingId || !containerRef.current) return;

    const handlePointerMove = (e: PointerEvent) => {
      const rect = containerRef.current!.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width - NOTE_SIZE, e.clientX - rect.left - dragOffset.x));
      const y = Math.max(0, Math.min(rect.height - NOTE_SIZE, e.clientY - rect.top - dragOffset.y));
      const rounded = { x: Math.round(x), y: Math.round(y) };
      lastPosRef.current = rounded;

      if (isPersonalNote) {
        updateNotePosition(draggingId, rounded.x, rounded.y);
      } else {
        setColleagueTasks((prev) =>
          prev.map((t) =>
            t.id === draggingId ? { ...t, posX: rounded.x, posY: rounded.y } : t
          )
        );
      }
    };

    const handlePointerUp = () => {
      if (!isPersonalNote && draggingId) {
        const { x, y } = lastPosRef.current;
        handleColleagueTaskMove(draggingId, x, y);
      }
      setDraggingId(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [draggingId, dragOffset, isPersonalNote, updateNotePosition, handleColleagueTaskMove]);

  useEffect(() => {
    let mounted = true;
    getApprovedUsers()
      .then((users) => {
        if (mounted) setApprovedUsers(users);
      })
      .catch(() => {
        if (mounted) setApprovedUsers([]);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  const { monthlyItems, dailyItems, stampsEnviarFoto, stampsEsperandoPago, stampsParaEnviar, stampsDeudores, priorityStamps } =
    useMemo(() => {
      let monthly = 0;
      let daily = 0;

      const allStamps: StampWithOrder[] = [];

      for (const order of deferredOrders) {
        // Usar fecha de creación real de la orden (created_at) para "cargados en el sistema"
        const createdAt = order.createdAt ? new Date(order.createdAt) : null;
        const orderDateStr = order.orderDate?.split('T')[0];
        const refDate = createdAt ?? (orderDateStr ? new Date(orderDateStr + 'T12:00:00') : null);
        if (!refDate) continue;
        const refYear = refDate.getFullYear();
        const refMonth = refDate.getMonth() + 1;
        const refDay = refDate.getDate();
        const refDateStr = `${refYear}-${String(refMonth).padStart(2, '0')}-${String(refDay).padStart(2, '0')}`;
        const orderInCurrentMonth = refYear === currentYear && refMonth === currentMonth + 1;
        const orderIsToday = refDateStr === todayKey;

        for (const item of order.items) {
          if (orderInCurrentMonth) monthly += 1;
          if (orderIsToday) daily += 1;
          allStamps.push({ order, item });
        }
      }

      const stampsEnviarFoto = allStamps.filter(
        ({ item }) => item.fabricationState === 'HECHO' && item.saleState === 'SEÑADO',
      );
      const stampsEsperandoPago = allStamps.filter(
        ({ item }) => item.fabricationState === 'HECHO' && item.saleState === 'FOTO_ENVIADA',
      );
      const stampsParaEnviar = allStamps.filter(
        ({ item }) =>
          item.fabricationState === 'HECHO' &&
          item.saleState === 'TRANSFERIDO' &&
          item.shippingState === 'SIN_ENVIO',
      );
      const stampsDeudores = allStamps.filter(
        ({ item }) => item.saleState === 'DEUDOR',
      );

      const priorityStamps = allStamps.filter(({ order, item }) => {
        const isPriority = item.isPriority;
        const hasDeadline = !!order.deadlineAt;
        const shipping = item.shippingState;
        const shipped =
          shipping === 'DESPACHADO' || shipping === 'SEGUIMIENTO_ENVIADO';
        return (isPriority || hasDeadline) && !shipped;
      });

      return {
        monthlyItems: monthly,
        dailyItems: daily,
        stampsEnviarFoto,
        stampsEsperandoPago,
        stampsParaEnviar,
        stampsDeudores,
        priorityStamps,
      };
    }, [deferredOrders, currentMonth, currentYear, todayKey]);

  // Objetivos fijos (por ahora definidos en código; más adelante pueden venir de BD)
  const MONTHLY_GOAL = 200;
  const DAILY_GOAL = 10;

  const monthlyProgress = MONTHLY_GOAL > 0 ? Math.min((monthlyItems / MONTHLY_GOAL) * 100, 100) : 0;
  const dailyProgress = DAILY_GOAL > 0 ? Math.min((dailyItems / DAILY_GOAL) * 100, 100) : 0;

  return (
    <AppMain className="relative h-screen overflow-hidden p-0">
      <main className="relative h-screen overflow-hidden">
        {/* HERO siempre visible: top bar + 3 columnas (Stock | Personaje | Espacio).
            No hay scroll de página: cada gesto de scroll dispara una tanda. */}
        <section className="absolute inset-0 flex flex-col px-8 pt-8 pb-0 overflow-hidden">
        {/* Primera fila: objetivos · usuarios · botones (grid de 3 columnas iguales para que la cápsula quede centrada al viewport) */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-10 w-full items-start shrink-0">
          {/* Columna izquierda: Objetivos */}
          <div className="flex flex-col gap-4 w-full xl:max-w-[320px]">
          {/* Objetivos */}
          <div className="flex flex-col justify-center gap-3 text-xs h-[120px] w-[220px]">
            <h2 className="text-lg font-semibold tracking-tight">Objetivos</h2>
            <div className="space-y-1 w-[220px]">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Ventas totales del mes</span>
                <span className="text-[11px] text-muted-foreground">
                  {monthlyItems.toLocaleString('es-AR')} / {MONTHLY_GOAL.toLocaleString('es-AR')}
                </span>
              </div>
              <div className="relative h-2 rounded-full bg-zinc-800 overflow-hidden w-full">
                <div
                  className="absolute inset-y-0 left-0 bg-zinc-300 transition-all"
                  style={{ width: `${monthlyProgress}%` }}
                />
              </div>
            </div>
            <div className="space-y-1 w-[220px]">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Ventas del día</span>
                <span className="text-[11px] text-muted-foreground">
                  {dailyItems.toLocaleString('es-AR')} / {DAILY_GOAL.toLocaleString('es-AR')}
                </span>
              </div>
              <div className="relative h-2 rounded-full bg-zinc-800 overflow-hidden w-full">
                <div
                  className="absolute inset-y-0 left-0 bg-red-500 transition-all"
                  style={{ width: `${dailyProgress}%` }}
                />
              </div>
            </div>
          </div>
          </div>

          {/* Usuarios - cápsula con borde (solo los que tienen foto de perfil) */}
          {(() => {
            const baseUsers = approvedUsers.length
              ? approvedUsers
              : [{ id: user?.id || 'me', name: userName }];
            const usersWithPhoto = baseUsers
              .map((u) => ({ ...u, profile: getUserProfileImage(u.name) }))
              .filter((u): u is { id: string; name: string; profile: string } => !!u.profile);

            if (usersWithPhoto.length === 0) {
              return <div className="min-h-[120px]" />;
            }

            return <HomeUserDock users={usersWithPhoto} />;
          })()}

          {/* Botones add - al mismo nivel que Objetivos y usuarios */}
          <div className="flex items-center gap-2 min-h-[120px] justify-center xl:justify-end">
            <button
              type="button"
              onClick={() => setIsAdding(true)}
              className="w-[82px] h-[82px] flex-shrink-0 p-0 border-0 bg-transparent cursor-pointer hover:scale-105 active:scale-95 transition-transform duration-200 focus:outline-none focus:ring-2 focus:ring-white/20 focus:ring-offset-2 focus:ring-offset-background rounded-lg"
              aria-label="Agregar nota"
            >
              <img
                src={stickyNoteAddSvg}
                alt="Agregar nota"
                className="w-full h-full object-contain drop-shadow-[0_4px_20px_rgba(0,0,0,0.4)]"
              />
            </button>
            <button
              type="button"
              onClick={() => setIsAddToColleagueOpen(true)}
              className="w-[82px] h-[82px] flex-shrink-0 p-0 border-0 bg-transparent cursor-pointer hover:scale-105 active:scale-95 transition-transform duration-200 focus:outline-none focus:ring-2 focus:ring-white/20 focus:ring-offset-2 focus:ring-offset-background rounded-lg"
              aria-label="Asignar tarea a compañero"
            >
              <img
                src={stickyNoteAddWorkmateSvg}
                alt="Asignar tarea a compañero"
                className="w-full h-full object-contain drop-shadow-[0_4px_20px_rgba(0,0,0,0.4)]"
              />
            </button>
          </div>
        </div>

        {/* Sticky notes - posición absoluta dentro del hero, flotan sobre el contenido */}
        <div
          ref={containerRef}
          className="absolute left-8 right-8 top-[136px] bottom-[42vh] pointer-events-none z-30"
          style={{ minHeight: 200 }}
        >
            {/* Notas propias (grises) - arrastrables */}
            {notes.map((note) => (
              <div
                key={note.id}
                className={cn(
                  'group absolute w-[82px] h-[82px] transition-all duration-300 ease-out cursor-grab active:cursor-grabbing pointer-events-auto',
                  removingId === note.id && 'scale-0 opacity-0 pointer-events-none',
                  draggingId === note.id && 'z-50 cursor-grabbing',
                )}
                style={{ left: note.x, top: note.y }}
                onPointerDown={(e) => handlePointerDown(e, note.id, note.x, note.y, true)}
              >
                <img
                  src={stickyNoteTaskSvg}
                  alt=""
                  className="w-full h-full object-contain drop-shadow-[0_4px_20px_rgba(0,0,0,0.4)] pointer-events-none"
                />
                <div className="absolute inset-0 flex items-center justify-center p-2 text-[10px] text-foreground text-center leading-tight overflow-hidden pointer-events-none">
                  <span className="whitespace-pre-wrap line-clamp-3">{note.text}</span>
                </div>
                <div className="absolute inset-0 bg-black/50 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-lg flex items-center justify-center">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMarkDone(note.id);
                    }}
                    className="text-[11px] text-white/90 hover:text-white font-medium tracking-wide"
                  >
                    Hecho
                  </button>
                </div>
              </div>
            ))}
            {/* Tareas de compañeros (amarillas) - arrastrables */}
            {stickyColleagueTasks.map((task, idx) => {
              const rawLeft = task.posX ?? 0;
              const rawTop = task.posY ?? 0;
              // Si una tarea nueva todavía no tiene posición guardada, (0,0) puede quedar tapada.
              // Usamos un fallback para que sea visible y desplazable.
              const isDefaultPos = rawLeft === 0 && rawTop === 0;
              const left = isDefaultPos ? 60 : rawLeft;
              const top = isDefaultPos ? 60 + idx * 95 : rawTop;

              return (
              <div
                key={task.id}
                className={cn(
                  'group absolute w-[82px] h-[82px] transition-all duration-300 ease-out cursor-grab active:cursor-grabbing pointer-events-auto z-20',
                  removingColleagueId === task.id && 'scale-0 opacity-0 pointer-events-none',
                  draggingId === task.id && 'z-50 cursor-grabbing',
                )}
                style={{ left, top }}
                onPointerDown={(e) =>
                  handlePointerDown(e, task.id, left, top, false)
                }
              >
                <img
                  src={stickyNoteTaskWorkmateSvg}
                  alt=""
                  className="w-full h-full object-contain drop-shadow-[0_4px_20px_rgba(0,0,0,0.4)] pointer-events-none"
                />
                <div className="absolute inset-0 flex items-center justify-center p-2 text-[10px] text-foreground text-center leading-tight overflow-hidden pointer-events-none">
                  <span
                    className="whitespace-pre-wrap line-clamp-3"
                    title={task.creadoPorNombre ? `De ${task.creadoPorNombre}` : undefined}
                  >
                    {task.texto}
                  </span>
                </div>
                <div className="absolute inset-0 bg-black/50 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-lg flex items-center justify-center">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleColleagueTaskDone(task.id);
                    }}
                    className="text-[11px] text-white/90 hover:text-white font-medium tracking-wide"
                  >
                    Hecho
                  </button>
                </div>
              </div>
              );
            })}
            {/* Formulario agregar nota propia (cuando está activo) */}
            {isAdding ? (
              <div
                className="absolute left-0 top-0 w-[140px] h-[140px] animate-in fade-in zoom-in-95 duration-300 overflow-hidden z-40 pointer-events-auto"
                style={{ animationDuration: '300ms' }}
              >
                <img
                  src={stickyNoteTaskSvg}
                  alt=""
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                />
                <div className="absolute inset-[10%] flex flex-col min-w-0 overflow-hidden">
                  <textarea
                    autoFocus
                    value={draftText}
                    onChange={(e) => setDraftText(e.target.value)}
                    placeholder="Escribí acá..."
                    className="flex-1 min-h-0 w-full min-w-0 resize-none bg-transparent text-[11px] text-foreground placeholder:text-muted-foreground/80 border-0 outline-none focus:ring-0"
                    rows={4}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setIsAdding(false);
                        setDraftText('');
                      }
                    }}
                  />
                  <div className="flex gap-3 justify-end pt-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAdding(false);
                        setDraftText('');
                      }}
                      className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (draftText.trim()) {
                          addNote(draftText.trim());
                          setDraftText('');
                          setIsAdding(false);
                        }
                      }}
                      className="text-[10px] text-foreground hover:text-white transition-colors font-medium"
                    >
                      Listo
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
        </div>

        <AddTaskToColleagueDialog
          open={isAddToColleagueOpen}
          onOpenChange={setIsAddToColleagueOpen}
          colleagues={approvedUsers.length ? approvedUsers : [{ id: user?.id || 'me', name: userName }]}
          currentUserId={user?.id || ''}
          onTaskCreated={fetchColleagueTasks}
        />

        {/* 3 columnas dentro del hero: Stock | Personaje | Espacio.
            Las laterales se contraen verticalmente cuando tanda > 0. */}
        {(() => {
          const inicioImage = getUserInicioImage(userName);
          const stockEmpty = stockReplenishVms.length === 0;
          // Estilos compartidos: cards laterales se contraen al scrollear (tanda > 0).
          const lateralCollapseStyle: React.CSSProperties = {
            maxHeight: tanda === 0 ? '100%' : 0,
            opacity: tanda === 0 ? 1 : 0,
            transform: tanda === 0 ? 'translateY(0)' : 'translateY(-12px)',
          };
          // Placeholder vacío (sin borde ni fondo) para columnas que no tienen contenido.
          const placeholderStyle: React.CSSProperties = {
            ...lateralCollapseStyle,
            border: 'none',
            background: 'transparent',
          };

          return (
            <div className="flex-1 grid grid-cols-1 xl:grid-cols-3 gap-6 min-h-0 mt-4 relative">
              {/* Columna 1: Stock */}
              <div
                className="rounded-2xl overflow-hidden border border-white/10 bg-card/50 transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform"
                style={lateralCollapseStyle}
              >
                <div className="h-full overflow-y-auto">
                  {stockEmpty ? (
                    <div className="h-full flex flex-col items-center justify-center text-center px-6 py-10 gap-3">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
                        <Package className="h-7 w-7 text-emerald-300/90" strokeWidth={1.5} />
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-base font-semibold tracking-tight text-white">El stock está al día</h3>
                        <p className="text-xs text-muted-foreground max-w-[260px] mx-auto">
                          No hay tareas de reposición pendientes. Volvé a chequear cuando haya nuevos envíos.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <StockReplenishSection
                      entries={stockReplenishVms}
                      lastSyncedAt={stockReplenishSyncedAt}
                      onCompleted={async () => {
                        await fetchColleagueTasks();
                      }}
                    />
                  )}
                </div>
              </div>

              {/* Columna 2: Personaje grande, llega hasta el final del hero. Saludo superpuesto. */}
              <div className="relative flex flex-col items-center overflow-hidden">
                {/* Glow radial cálido de fondo */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background:
                      'radial-gradient(55% 55% at 50% 45%, rgba(255,210,140,0.22) 0%, rgba(255,170,90,0.08) 40%, rgba(0,0,0,0) 75%)',
                  }}
                />
                {/* Halo concentrado detrás del personaje */}
                {inicioImage && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute left-1/2 top-[40%] -translate-x-1/2 -translate-y-1/2 w-[460px] h-[460px] rounded-full"
                    style={{
                      background:
                        'radial-gradient(circle, rgba(255,235,200,0.25) 0%, rgba(255,200,140,0.08) 40%, rgba(0,0,0,0) 70%)',
                      filter: 'blur(10px)',
                    }}
                  />
                )}

                {/* Personaje grande, ocupa toda la columna y llega al ras del bottom del viewport.
                    `-mt-16` lo sube un toque para que la cabeza quede más arriba en la pantalla. */}
                {inicioImage && (
                  <div className="absolute inset-0 flex items-start justify-center overflow-hidden pointer-events-none">
                    <img
                      src={inicioImage}
                      alt={userName}
                      className="h-[940px] md:h-[1140px] w-auto max-w-none object-contain object-top select-none drop-shadow-[0_24px_40px_rgba(0,0,0,0.55)] -mt-10"
                      draggable={false}
                    />
                  </div>
                )}

                {/* Fade inferior, da contraste al saludo sin tapar al personaje */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-[180px]"
                  style={{
                    background:
                      'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.3) 55%, rgba(0,0,0,0) 100%)',
                  }}
                />

                {/* Saludo SUPERPUESTO al personaje (absolute bottom). Aparece al cargar y desaparece al scrollear. */}
                <div
                  className="absolute inset-x-0 bottom-6 z-20 text-center px-4 space-y-1 will-change-transform pointer-events-none"
                  style={{
                    opacity: tanda === 0 && greetingVisible ? 1 : 0,
                    transform:
                      tanda === 0 && greetingVisible
                        ? 'translateY(0)'
                        : tanda === 0
                          ? 'translateY(24px)'
                          : 'translateY(-20px)',
                    transition:
                      'opacity 900ms cubic-bezier(0.22,1,0.36,1), transform 900ms cubic-bezier(0.22,1,0.36,1)',
                  }}
                >
                  <h1 className="text-5xl md:text-7xl font-semibold tracking-tight drop-shadow-[0_4px_18px_rgba(0,0,0,0.75)]">
                    Hola {userName.split(' ')[0]}!
                  </h1>
                  <p className="text-2xl md:text-3xl text-muted-foreground drop-shadow-[0_2px_10px_rgba(0,0,0,0.65)]">
                    Bienvenido a Alcohn.
                  </p>
                </div>
              </div>

              {/* Columna 3: Espacio futuro - sin borde (placeholder hasta agregar contenido) */}
              <div
                className="rounded-2xl overflow-hidden transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform"
                style={placeholderStyle}
              >
                <UserTaskWidget
                  userId={user?.id || ''}
                  users={approvedUsers.length ? approvedUsers : user?.id ? [{ id: user.id, name: userName }] : []}
                />
              </div>
            </div>
          );
        })()}
        </section>

        {/* Stack de tandas en la zona inferior del viewport. Cada una se controla con `tanda`.
            Acumulación: cuando entra una nueva, la anterior se contrae hacia arriba.
            Si no hay espacio, la más vieja desaparece. */}
        <div className="absolute inset-x-0 bottom-0 z-10 px-8 pb-8 flex flex-col gap-4 pointer-events-none">
          {/* Sellos listos: visible cuando tanda >= 1. Se contrae cuando llega Prioritarios (tanda=2).
              Animamos solo max-height + translateY (sin opacity) para que el blur del glass se vea
              desde el primer frame de la entrada. */}
          <div
            className="overflow-hidden transition-[max-height,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] origin-top will-change-transform pointer-events-auto"
            style={{
              maxHeight: tanda === 1 ? '60vh' : tanda >= 2 ? '24vh' : 0,
              transform: tanda >= 1 ? 'translateY(0)' : 'translateY(48px)',
            }}
          >
            <section className="space-y-3 pt-2">
              <h2 className="text-lg font-semibold tracking-tight">Sellos Listos</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <SellosColumn
                  title="Enviar foto"
                  subtitle="Hecho · Venta: Señado"
                  orders={groupStampsByOrder(stampsEnviarFoto)}
                  compact={tanda >= 2}
                />
                <SellosColumn
                  title="Esperando pago"
                  subtitle="Hecho · Venta: Foto enviada"
                  orders={groupStampsByOrder(stampsEsperandoPago)}
                  compact={tanda >= 2}
                />
                <SellosColumn
                  title="Para enviar"
                  subtitle="Hecho · Venta: Transferido · Envío: Sin Envío"
                  orders={groupStampsByOrder(stampsParaEnviar)}
                  compact={tanda >= 2}
                />
                <SellosColumn
                  title="Deudores"
                  subtitle="Venta: Deudor"
                  orders={groupStampsByOrder(stampsDeudores)}
                  compact={tanda >= 2}
                />
              </div>
            </section>
          </div>

          {/* Prioritarios: visible cuando tanda >= 2. Mismo patrón que Sellos:
              animamos solo max-height + translateY para que el glass de las cards aparezca íntegro. */}
          <div
            className="overflow-hidden transition-[max-height,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] origin-top will-change-transform pointer-events-auto"
            style={{
              maxHeight: tanda >= 2 ? '50vh' : 0,
              transform: tanda >= 2 ? 'translateY(0)' : 'translateY(48px)',
            }}
          >
            <section className="space-y-3 pt-2">
              <h2 className="text-lg font-semibold tracking-tight">Pedidos prioritarios y con fecha límite</h2>
              {groupStampsByOrder(priorityStamps).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hay pedidos prioritarios ni con fecha límite pendientes de envío.
                </p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-5">
                  {groupStampsByOrder(priorityStamps).map(({ order, items }) => {
                    const firstItem = items[0];
                    const thumb = firstItem.files?.vectorPreviewUrl || firstItem.files?.baseUrl;
                    return (
                      <div
                        key={order.id}
                        className="rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-2xl shadow-[0_12px_30px_-10px_rgba(0,0,0,0.6)] p-2 text-[11px]"
                      >
                        <div className="flex flex-col gap-1">
                          <div className="w-full aspect-square rounded-md overflow-hidden bg-muted/30">
                            {thumb ? (
                              <img src={thumb} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">
                                —
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 px-0.5">
                            <p className="font-medium truncate text-[11px]">{firstItem.designName}</p>
                            {order.deadlineAt && (
                              <p className="text-[10px] text-muted-foreground">
                                Límite:{' '}
                                {new Date(order.deadlineAt).toLocaleDateString('es-AR', {
                                  day: '2-digit',
                                  month: '2-digit',
                                })}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>

        {/* Indicador de tanda actual (puntitos a la derecha) */}
        <div className="absolute right-6 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-2 pointer-events-auto">
          {Array.from({ length: TOTAL_TANDAS }).map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setTanda(idx)}
              className={cn(
                'h-2 rounded-full transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
                tanda === idx ? 'bg-white w-6' : 'bg-white/30 hover:bg-white/60 w-2',
              )}
              aria-label={`Ir a tanda ${idx + 1}`}
            />
          ))}
        </div>
      </main>

      <Toaster />
    </AppMain>
  );
}

interface SellosColumnProps {
  title: string;
  subtitle: string;
  orders: OrderWithItems[];
  /** Modo compacto cuando la tanda se contrae para dejar lugar a otra. */
  compact?: boolean;
}

function SellosColumn({ title, subtitle, orders, compact = false }: SellosColumnProps) {
  return (
    <Card className="border border-white/10 bg-white/[0.04] backdrop-blur-2xl shadow-[0_20px_60px_-20px_rgba(0,0,0,0.7)] transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]">
      <CardHeader className={cn('pb-2 transition-all duration-500', compact && 'pb-1 pt-3')}>
        <CardTitle className="flex items-center justify-between text-base">
          <span>{title}</span>
          <Badge variant="outline" className="text-[11px] border-white/20 text-muted-foreground">
            {orders.length}
          </Badge>
        </CardTitle>
        {!compact && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </CardHeader>
      <CardContent className="pt-0">
        {orders.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">
            No hay pedidos en este estado.
          </p>
        ) : (
          <div
            className="pr-2 overflow-y-auto transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ height: compact ? 0 : '10rem' }}
          >
            <div className="space-y-2 text-xs">
              {orders.map(({ order, items }) => {
                const firstItem = items[0];
                return (
                  <div
                    key={order.id}
                    className="rounded-md border border-white/10 bg-background/60 backdrop-blur-md px-3 py-2 space-y-2"
                  >
                    <div className="flex gap-2 items-start">
                      <div className="flex gap-0.5 shrink-0">
                        {items.map((item) => {
                          const thumb = item.files?.vectorPreviewUrl || item.files?.baseUrl;
                          const isVectorPreview = !!item.files?.vectorPreviewUrl;
                          return (
                            <div
                              key={item.id}
                              className={cn(
                                'w-8 h-8 rounded border border-white/10 overflow-hidden flex-shrink-0',
                                isVectorPreview ? 'bg-white' : 'bg-muted',
                              )}
                            >
                              {thumb ? (
                                <img src={thumb} alt="" className="w-full h-full object-contain" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">—</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{firstItem.designName}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {order.customer.firstName} {order.customer.lastName}
                        </p>
                        {order.deadlineAt && (
                          <p className="text-[11px] text-muted-foreground">
                            Límite: {new Date(order.deadlineAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

