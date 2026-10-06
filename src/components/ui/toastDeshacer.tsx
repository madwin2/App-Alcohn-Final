import { ToastAction } from '@/components/ui/toast';
import { toast } from '@/components/ui/use-toast';

/** Toast breve (5s) con acción Deshacer. */
export function toastConDeshacer(
  title: string,
  onDeshacer: () => void | Promise<void>,
) {
  return toast({
    title,
    duration: 5000,
    action: (
      <ToastAction
        altText="Deshacer"
        onClick={(e) => {
          e.preventDefault();
          void onDeshacer();
        }}
      >
        Deshacer
      </ToastAction>
    ),
  });
}
