import { cn } from '@/lib/utils/cn';
import { LucideIcon } from 'lucide-react';

interface SidebarItemProps {
  icon: LucideIcon;
  label: string;
  isActive?: boolean;
  onClick?: () => void;
  isExpanded: boolean;
}

export function SidebarItem({ 
  icon: Icon, 
  label, 
  isActive = false, 
  onClick,
  isExpanded 
}: SidebarItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-xl text-sm font-medium transition-all duration-300 ease-out",
        "hover:bg-accent/50 hover:text-accent-foreground hover:scale-105 hover:shadow-md",
        "transform-gpu active:scale-95",
        isActive 
          ? "bg-primary text-primary-foreground shadow-lg" 
          : "text-muted-foreground hover:text-foreground",
        !isExpanded 
          ? "flex items-center justify-center w-12 h-12 mx-auto" 
          : "flex items-center gap-3 px-3 py-3 w-full"
      )}
      title={!isExpanded ? label : undefined}
    >
      <Icon className="h-5 w-5 flex-shrink-0 transition-transform duration-300" />
      <div className={cn(
        "transition-all duration-700 ease-in-out overflow-hidden",
        isExpanded ? "opacity-100 max-w-[200px] ml-2" : "opacity-0 max-w-0 ml-0"
      )}>
        <span className="truncate whitespace-nowrap">{label}</span>
      </div>
    </button>
  );
}
