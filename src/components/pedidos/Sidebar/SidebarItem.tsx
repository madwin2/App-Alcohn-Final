import { cn } from '@/lib/utils/cn';
import { LucideIcon } from 'lucide-react';

interface SidebarItemProps {
  icon: LucideIcon;
  label: string;
  isActive?: boolean;
  onClick?: () => void;
  isExpanded: boolean;
  disabled?: boolean;
}

export function SidebarItem({ 
  icon: Icon, 
  label, 
  isActive = false, 
  onClick,
  isExpanded,
  disabled = false
}: SidebarItemProps) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={cn(
        "rounded-xl text-sm font-medium transition-all duration-300 ease-out",
        disabled
          ? "opacity-60 cursor-not-allowed text-gray-700 dark:text-gray-400"
          : "hover:bg-accent/50 hover:text-accent-foreground hover:scale-105 hover:shadow-md transform-gpu active:scale-95",
        isActive && !disabled
          ? "bg-primary text-primary-foreground shadow-lg" 
          : !disabled && "text-muted-foreground hover:text-foreground",
        !isExpanded 
          ? "flex items-center justify-center w-12 h-12 mx-auto" 
          : "flex items-center gap-3 px-3 py-3 w-full"
      )}
      title={!isExpanded ? label : undefined}
    >
      <Icon className={cn(
        "h-5 w-5 flex-shrink-0 transition-transform duration-300",
        disabled && "opacity-50"
      )} />
      <div className={cn(
        "transition-all duration-700 ease-in-out overflow-hidden",
        isExpanded ? "opacity-100 max-w-[200px] ml-2" : "opacity-0 max-w-0 ml-0"
      )}>
        <span className={cn(
          "truncate whitespace-nowrap",
          disabled && "line-through"
        )}>
          {label}
        </span>
      </div>
    </button>
  );
}
