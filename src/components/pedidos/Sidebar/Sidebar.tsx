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
  const { sidebarExpanded, setSidebarExpanded } = useOrdersStore();

  return (
    <div className={cn(
      "fixed left-4 top-4 bottom-4 flex flex-col bg-card/95 backdrop-blur-sm border rounded-2xl shadow-2xl transition-all duration-300",
      sidebarExpanded ? "w-64 z-[100]" : "w-16 z-10"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border/50">
        {sidebarExpanded && (
          <h2 className="text-lg font-semibold">App Interna</h2>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarExpanded(!sidebarExpanded)}
          className="h-8 w-8 rounded-full"
        >
          {sidebarExpanded ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 p-4 space-y-2">
        {sidebarItems.map((item) => (
          <SidebarItem
            key={item.path}
            icon={item.icon}
            label={item.label}
            isActive={item.path === '/pedidos'}
            isExpanded={sidebarExpanded}
            onClick={() => {
              // Aquí iría la navegación real
              console.log(`Navegando a ${item.path}`);
            }}
          />
        ))}
      </nav>

      {/* User Profile */}
      <div className="p-4 border-t border-border/50">
        <div className={cn(
          "flex items-center gap-3",
          !sidebarExpanded && "justify-center"
        )}>
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
            <User className="h-5 w-5 text-white" />
          </div>
          {sidebarExpanded && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">Usuario Actual</p>
              <p className="text-xs text-muted-foreground truncate">usuario@empresa.com</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
