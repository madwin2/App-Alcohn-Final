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
        "flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all duration-200",
        "hover:bg-accent/50 hover:text-accent-foreground hover:scale-105",
        isActive 
          ? "bg-primary text-primary-foreground shadow-lg" 
          : "text-muted-foreground hover:text-foreground",
        !isExpanded && "justify-center px-2"
      )}
      title={!isExpanded ? label : undefined}
    >
      <Icon className="h-5 w-5 flex-shrink-0" />
      {isExpanded && (
        <span className="truncate">{label}</span>
      )}
    </button>
  );
}
