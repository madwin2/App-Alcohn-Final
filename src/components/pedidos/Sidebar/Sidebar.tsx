import { 
  Home, 
  ShoppingCart, 
  Layers, 
  Factory, 
  Calendar, 
  CheckCircle, 
  MessageCircle, 
  User,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SidebarItem } from './SidebarItem';
import { useOrdersStore } from '@/lib/state/orders.store';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';

const sidebarItems = [
  { icon: Home, label: 'Inicio', path: '/' },
  { icon: ShoppingCart, label: 'Pedidos', path: '/pedidos' },
  { icon: Layers, label: 'Vectorización', path: '/vectorizacion' },
  { icon: Factory, label: 'Producción', path: '/produccion' },
  { icon: Calendar, label: 'Programas', path: '/programas' },
  { icon: CheckCircle, label: 'Verificación', path: '/verificacion' },
  { icon: MessageCircle, label: 'WhatsApp Bot', path: '/whatsapp' },
];

export function Sidebar() {
  const { sidebarExpanded, sidebarHovered, setSidebarExpanded, setSidebarHovered } = useOrdersStore();
  const location = useLocation();
  const navigate = useNavigate();

  const isExpanded = sidebarExpanded || sidebarHovered;

  return (
    <div 
      className={cn(
        "fixed left-4 top-4 bottom-4 flex flex-col bg-card/95 backdrop-blur-sm border rounded-2xl shadow-2xl transition-all duration-700 ease-in-out",
        "hover:shadow-3xl hover:bg-card/98",
        "will-change-transform",
        isExpanded ? "w-64 z-[100]" : "w-16 z-10"
      )}
      onMouseEnter={() => setSidebarHovered(true)}
      onMouseLeave={() => setSidebarHovered(false)}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border/50">
        <div className={cn(
          "transition-all duration-700 ease-in-out overflow-hidden",
          isExpanded ? "opacity-100 max-w-[200px] ml-2" : "opacity-0 max-w-0 ml-0"
        )}>
          <h2 className="text-lg font-semibold whitespace-nowrap">App Interna</h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarExpanded(!sidebarExpanded)}
          className="h-8 w-8 rounded-full transition-all duration-300 hover:scale-110 hover:bg-accent/50"
        >
          <div className="transition-transform duration-300 ease-in-out">
            {sidebarExpanded ? (
              <ChevronLeft className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </div>
        </Button>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 flex flex-col p-3 space-y-1 items-stretch">
        {sidebarItems.map((item, index) => (
          <div
            key={item.path}
            className="flex justify-start"
          >
            <SidebarItem
              icon={item.icon}
              label={item.label}
              isActive={location.pathname === item.path}
              isExpanded={isExpanded}
              onClick={() => {
                navigate(item.path);
              }}
            />
          </div>
        ))}
      </nav>

      {/* User Profile */}
      <div className="border-t border-border/50 flex p-4 justify-start">
        <div className="flex items-center gap-3 justify-start">
          <div className="rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg transition-all duration-300 hover:scale-110 hover:shadow-xl h-10 w-10">
            <User className="h-5 w-5 text-white" />
          </div>
          <div className={cn(
            "transition-all duration-700 ease-in-out overflow-hidden",
            isExpanded ? "opacity-100 max-w-[200px] ml-2" : "opacity-0 max-w-0 ml-0"
          )}>
            <p className="text-sm font-medium truncate">Usuario Actual</p>
            <p className="text-xs text-muted-foreground truncate">usuario@empresa.com</p>
          </div>
        </div>
      </div>
    </div>
  );
}
