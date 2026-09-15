import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AppMain } from '@/components/layout/AppMain';
import { Toaster } from '@/components/ui/toaster';
import { Badge } from '@/components/ui/badge';
import { VectorizacionHeader } from '@/components/vectorizacion/VectorizacionHeader';
import { PendientesTab } from '@/components/vectorizacion/PendientesTab/PendientesTab';
import { LoteTab } from '@/components/vectorizacion/LoteTab/LoteTab';
import { AsignarTab } from '@/components/vectorizacion/AsignarTab/AsignarTab';
import { RevisionTab } from '@/components/vectorizacion/RevisionTab/RevisionTab';
import { VectorReviewHost } from '@/components/vectorizacion/shared/VectorReviewHost';
import { VectorizarOnboardingHost } from '@/components/vectorizacion/VectorizarOnboardingHost';
import { useVectorizacionStore } from '@/lib/state/vectorizacion.store';

export default function VectorizacionPage() {
  const tab = useVectorizacionStore((s) => s.tab);
  const setTab = useVectorizacionStore((s) => s.setTab);
  const reviewCount = useVectorizacionStore((s) => s.reviewQueue.length);

  return (
    <AppMain className="flex h-svh min-h-0 flex-col overflow-hidden">
      <div className="shrink-0 border-b bg-background/90 px-6 py-4 backdrop-blur">
        <VectorizacionHeader />
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-6 pb-4 pt-3">
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as typeof tab)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <TabsList className="mb-3 w-fit shrink-0">
            <TabsTrigger value="pedidos">Pedidos</TabsTrigger>
            <TabsTrigger value="lote">Lote libre</TabsTrigger>
            <TabsTrigger value="asignar">Asignar SVG</TabsTrigger>
            <TabsTrigger value="revision" className="gap-2">
              Revisión
              {reviewCount > 0 ? (
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                  {reviewCount}
                </Badge>
              ) : null}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="pedidos" className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
            <PendientesTab />
          </TabsContent>
          <TabsContent value="lote" className="mt-0 min-h-0 flex-1 overflow-y-auto data-[state=inactive]:hidden">
            <LoteTab />
          </TabsContent>
          <TabsContent value="asignar" className="mt-0 min-h-0 flex-1 overflow-y-auto data-[state=inactive]:hidden">
            <AsignarTab />
          </TabsContent>
          <TabsContent value="revision" className="mt-0 min-h-0 flex-1 overflow-y-auto data-[state=inactive]:hidden">
            <RevisionTab />
          </TabsContent>
        </Tabs>
      </div>
      <VectorReviewHost />
      <VectorizarOnboardingHost />
      <Toaster />
    </AppMain>
  );
}
