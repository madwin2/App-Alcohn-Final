import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AnotacionesTab } from '@/components/perfil/AnotacionesTab'
import { NecesidadesTab } from '@/components/perfil/NecesidadesTab'
import { CrecimientoTab } from '@/components/perfil/CrecimientoTab'
import { FeedbackTab } from '@/components/perfil/FeedbackTab'

const SUBTABS = [
  'anotaciones',
  'necesidades',
  'crecimiento',
  'feedback',
] as const
export type LoMioSubtab = (typeof SUBTABS)[number]

export function sanitizeLoMioSub(raw: string | null | undefined): LoMioSubtab {
  const t = raw || 'anotaciones'
  return SUBTABS.includes(t as LoMioSubtab) ? (t as LoMioSubtab) : 'anotaciones'
}

interface LoMioTabProps {
  sub: LoMioSubtab
  onSubChange: (sub: LoMioSubtab) => void
  personaNombre: string
  refreshKey: number
  feedbackNoLeido: number
  onUnreadChange: (n: number) => void
}

export function LoMioTab({
  sub,
  onSubChange,
  personaNombre,
  refreshKey,
  feedbackNoLeido,
  onUnreadChange,
}: LoMioTabProps) {
  return (
    <Tabs value={sub} onValueChange={v => onSubChange(sanitizeLoMioSub(v))}>
      <TabsList className="h-auto flex-wrap">
        <TabsTrigger value="anotaciones">Anotaciones</TabsTrigger>
        <TabsTrigger value="necesidades">Lo que necesito</TabsTrigger>
        <TabsTrigger value="crecimiento">Crecimiento</TabsTrigger>
        <TabsTrigger value="feedback" className="gap-1.5">
          Feedback
          {feedbackNoLeido > 0 ? (
            <span className="rounded-full bg-amber-500/90 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-950">
              {feedbackNoLeido}
            </span>
          ) : null}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="anotaciones" className="mt-4">
        <AnotacionesTab />
      </TabsContent>
      <TabsContent value="necesidades" className="mt-4">
        <NecesidadesTab personaNombre={personaNombre} refreshKey={refreshKey} />
      </TabsContent>
      <TabsContent value="crecimiento" className="mt-4">
        <CrecimientoTab />
      </TabsContent>
      <TabsContent value="feedback" className="mt-4">
        <FeedbackTab refreshKey={refreshKey} onUnreadChange={onUnreadChange} />
      </TabsContent>
    </Tabs>
  )
}
