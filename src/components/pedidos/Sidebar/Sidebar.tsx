import { memo, useEffect } from 'react';
import {
  Home,
  ShoppingCart,
  Layers,
  Factory,
  Truck,
  Calendar,
  MessageCircle,
  User,
  ChevronLeft,
  LogOut,
  Wallet,
  Package,
  Image,
  Tag,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  Pin,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SidebarItem } from './SidebarItem';
import { useOrdersStore } from '@/lib/state/orders.store';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import { useAuth } from '@/lib/hooks/useAuth';
import { useEquipoRol } from '@/lib/hooks/useEquipoRol';
import { isFbTestUser } from '@/lib/auth/access';
import { useToast } from '@/components/ui/use-toast';
import { useSidebarNotifications } from '@/lib/hooks/useSidebarNotifications';
import { getUserProfileImage } from '@/lib/utils/userImages';

const sidebarItems = [
  { icon: Home, label: 'Inicio', path: '/', disabled: false },
  { icon: ShoppingCart, label: 'Pedidos', path: '/pedidos', disabled: false },
  { icon: Truck, label: 'Envíos', path: '/envios', disabled: false },
  { icon: Package, label: 'Stock', path: '/stock', disabled: false },
  { icon: Image, label: 'Mockups', path: '/mockups', disabled: false },
  { icon: TrendingUp, label: 'Comercial Web', path: '/comercial', disabled: false },
  { icon: Sparkles, label: 'Innovación', path: '/innovacion', disabled: false },
  { icon: Layers, label: 'Vectorización', path: '/vectorizacion', disabled: false },
  { icon: Factory, label: 'Producción', path: '/produccion', disabled: false },
  { icon: Calendar, label: 'Programas', path: '/programas' },
  { icon: AlertTriangle, label: 'Errores', path: '/errores', disabled: false },
  { icon: MessageCircle, label: 'WhatsApp Bot', path: '/whatsapp', disabled: false },
];

function SidebarInner() {
  const { sidebarExpanded, sidebarHovered, setSidebarExpanded, setSidebarHovered } = useOrdersStore();
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const { pedidosBadge, comercialBadge, programasBadge, corchoBadge } = useSidebarNotifications();
  const { esMiembroActivo } = useEquipoRol();

  const isExpanded = sidebarExpanded || sidebarHovered;

  const badgeForPath = (path: string): number => {
    if (path === '/pedidos') return pedidosBadge;
    if (path === '/comercial') return comercialBadge;
    if (path === '/programas') return programasBadge;
    return 0;
  };

  useEffect(() => {
    setSidebarHovered(false);
  }, [location.pathname, setSidebarHovered]);

  const handleSignOut = async () => {
    try {
      await signOut();
      toast({
        title: 'Sesión cerrada',
        description: 'Has cerrado sesión correctamente',
      });
      navigate('/login');
    } catch {
      toast({
        title: 'Error',
        description: 'No se pudo cerrar sesión',
        variant: 'destructive',
      });
    }
  };

  const userEmail = user?.email || 'usuario@empresa.com';
  const isRestrictedUser = isFbTestUser(user);
  const isEconomiaUser = !isRestrictedUser && user?.email?.toLowerCase() === 'julian.475@hotmail.com';
  const userName = user?.user_metadata?.nombre
    ? `${user.user_metadata.nombre} ${user.user_metadata.apellido || ''}`.trim()
    : 'Usuario Actual';
  const profileImage = getUserProfileImage(userName);

  return (
    <div
      className={cn(
        'fixed left-4 top-4 bottom-4 flex flex-col bg-card/95 backdrop-blur-sm border rounded-2xl shadow-2xl transition-[width,box-shadow,background-color] duration-200 ease-out',
        'hover:shadow-3xl hover:bg-card/98',
        isExpanded ? 'w-64 z-40' : 'w-16 z-30',
      )}
      onMouseEnter={() => setSidebarHovered(true)}
      onMouseLeave={() => setSidebarHovered(false)}
    >
      {/* Header */}
      <div
        className={cn(
          'flex items-center border-b border-border/50 p-4',
          isExpanded ? 'justify-between' : 'justify-center',
        )}
      >
        <button
          type="button"
          onClick={() => {
            if (!sidebarExpanded) setSidebarExpanded(true);
          }}
          className="flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={sidebarExpanded ? 'Alcohn' : 'Abrir menú'}
          title={sidebarExpanded ? undefined : 'Abrir menú'}
        >
          {/* PNG negro sin fondo; invert = blanco sobre la barra oscura */}
          <img
            src="/logo-alcohn.png"
            alt="Alcohn"
            className="h-8 w-8 shrink-0 object-contain invert"
            draggable={false}
          />
        </button>
        {isExpanded && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarExpanded(false)}
            className="h-8 w-8 rounded-full transition-all duration-300 hover:scale-110 hover:bg-accent/50"
            aria-label="Cerrar menú"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 flex flex-col p-3 space-y-1 items-stretch">
        {sidebarItems.map((item) => {
          const disabled = Boolean(item.disabled) || (isRestrictedUser && item.path !== '/whatsapp');
          return (
            <div key={item.path} className="flex justify-start">
              <SidebarItem
                icon={item.icon}
                label={item.label}
                isActive={
                  item.path === '/'
                    ? location.pathname === '/'
                    : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
                }
                isExpanded={isExpanded}
                disabled={disabled}
                badgeCount={disabled ? 0 : badgeForPath(item.path)}
                onClick={() => {
                  if (!disabled) {
                    navigate(item.path);
                  }
                }}
              />
            </div>
          );
        })}
        {!isRestrictedUser && esMiembroActivo && (
          <div className="flex justify-start">
            <SidebarItem
              icon={Pin}
              label="Corcho"
              isActive={location.pathname === '/corcho'}
              isExpanded={isExpanded}
              disabled={false}
              badgeCount={corchoBadge}
              onClick={() => navigate('/corcho')}
            />
          </div>
        )}
        {isEconomiaUser && (
          <>
            <div className="flex justify-start">
              <SidebarItem
                icon={Calendar}
                label="Economía"
                isActive={location.pathname === '/economia'}
                isExpanded={isExpanded}
                disabled={false}
                onClick={() => navigate('/economia')}
              />
            </div>
            <div className="flex justify-start">
              <SidebarItem
                icon={Wallet}
                label="Gastos"
                isActive={location.pathname === '/gastos'}
                isExpanded={isExpanded}
                disabled={false}
                onClick={() => navigate('/gastos')}
              />
            </div>
          </>
        )}
        <div className="flex justify-start">
          <SidebarItem
            icon={Tag}
            label="Precios"
            isActive={location.pathname === '/precios'}
            isExpanded={isExpanded}
            disabled={isRestrictedUser}
            onClick={() => {
              if (!isRestrictedUser) navigate('/precios');
            }}
          />
        </div>
      </nav>

      {/* User Profile → Mi perfil */}
      <div className="border-t border-border/50 p-4 space-y-2">
        <button
          type="button"
          onClick={() => {
            if (!isRestrictedUser) navigate('/perfil');
          }}
          disabled={isRestrictedUser}
          className={cn(
            'flex w-full items-center gap-3 justify-start rounded-xl p-1 -m-1 text-left transition-colors',
            !isRestrictedUser && 'hover:bg-accent/40 active:scale-[0.99]',
            location.pathname === '/perfil' && !isRestrictedUser && 'bg-accent/30',
            isRestrictedUser && 'cursor-default',
          )}
          title={!isExpanded ? 'Mi perfil' : undefined}
          aria-label="Mi perfil"
        >
          <div className="rounded-full overflow-hidden flex items-center justify-center shadow-lg transition-all duration-300 h-10 w-10 shrink-0 bg-gradient-to-br from-blue-500 to-purple-600">
            {profileImage ? (
              <img
                src={profileImage}
                alt={userName}
                className="h-full w-full object-cover"
                draggable={false}
              />
            ) : (
              <User className="h-5 w-5 text-white" />
            )}
          </div>
          <div
            className={cn(
              'transition-all duration-700 ease-in-out overflow-hidden',
              isExpanded ? 'opacity-100 max-w-[200px] ml-2' : 'opacity-0 max-w-0 ml-0',
            )}
          >
            <p className="text-sm font-medium truncate">{userName}</p>
            <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
          </div>
        </button>
        {isExpanded && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            className="w-full justify-start text-muted-foreground hover:text-destructive"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Cerrar Sesión
          </Button>
        )}
      </div>
    </div>
  );
}

export const Sidebar = memo(SidebarInner);
