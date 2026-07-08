import { cn } from '@/lib/utils/cn';
import { LucideIcon } from 'lucide-react';

interface SidebarItemProps {
  icon: LucideIcon;
  label: string;
  isActive?: boolean;
  onClick?: () => void;
  isExpanded: boolean;
  disabled?: boolean;
  /** Contador de notificación (rojo). 0 / undefined = oculto. */
  badgeCount?: number;
}

export function SidebarItem({ 
  icon: Icon, 
  label, 
  isActive = false, 
  onClick,
  isExpanded,
  disabled = false,
  badgeCount = 0,
}: SidebarItemProps) {
  const showBadge = !disabled && badgeCount > 0;
  const badgeLabel = badgeCount > 99 ? '99+' : String(badgeCount);

  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={cn(
        "relative rounded-xl text-sm font-medium transition-colors duration-150 ease-out",
        disabled
          ? "opacity-60 cursor-not-allowed text-gray-700 dark:text-gray-400"
          : "hover:bg-accent/50 hover:text-accent-foreground active:scale-[0.98]",
        isActive && !disabled
          ? "bg-primary text-primary-foreground shadow-lg" 
          : !disabled && "text-muted-foreground hover:text-foreground",
        !isExpanded 
          ? "flex items-center justify-center w-12 h-12 mx-auto" 
          : "flex items-center gap-3 px-3 py-3 w-full"
      )}
      title={!isExpanded ? (showBadge ? `${label} (${badgeLabel})` : label) : undefined}
    >
      <span className="relative flex-shrink-0">
        <Icon className={cn(
          "h-5 w-5 transition-transform duration-300",
          disabled && "opacity-50"
        )} />
        {showBadge && !isExpanded && (
          <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white shadow-sm">
            {badgeLabel}
          </span>
        )}
      </span>
      <div className={cn(
        "transition-all duration-200 ease-out overflow-hidden",
        isExpanded ? "opacity-100 max-w-[200px] ml-2" : "opacity-0 max-w-0 ml-0"
      )}>
        <span className={cn(
          "truncate whitespace-nowrap",
          disabled && "line-through"
        )}>
          {label}
        </span>
      </div>
      {showBadge && isExpanded && (
        <span className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-semibold leading-none text-white">
          {badgeLabel}
        </span>
      )}
    </button>
  );
}
