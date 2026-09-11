import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { getUserInitials, getUserProfileImage } from '@/lib/utils/userImages';

interface AvatarProps {
  name?: string | null;
  src?: string | null;
  icon?: LucideIcon;
  className?: string;
  iconClassName?: string;
}

export function Avatar({ name, src, icon: Icon, className, iconClassName }: AvatarProps) {
  const image = src ?? getUserProfileImage(name);
  const initials = getUserInitials(name);

  return (
    <div
      className={cn(
        'relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full',
        'border border-white/10 bg-white/[0.06] text-xs font-medium text-white',
        className,
      )}
    >
      {image ? (
        <img src={image} alt={name || ''} className="h-full w-full object-cover" draggable={false} />
      ) : Icon ? (
        <Icon className={cn('h-4 w-4 text-white/70', iconClassName)} strokeWidth={1.75} />
      ) : initials ? (
        <span className="bg-white/10 text-white">{initials}</span>
      ) : null}
    </div>
  );
}
