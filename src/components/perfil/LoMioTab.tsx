import { Tabs, TabsContent } from '@/components/ui/tabs'
import { Insignia, PillTab, PillTabsList } from '@/components/perfil/perfilUi'
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
      <PillTabsList className="bg-transparent p-0">
        <PillTab value="anotaciones" className="px-3.5 py-1 text-[13px]">Anotaciones</PillTab>
        <PillTab value="necesidades" className="px-3.5 py-1 text-[13px]">Lo que necesito</PillTab>
        <PillTab value="crecimiento" className="px-3.5 py-1 text-[13px]">Crecimiento</PillTab>
        <PillTab value="feedback" className="px-3.5 py-1 text-[13px]">
          Feedback
          <Insignia n={feedbackNoLeido} />
        </PillTab>
      </PillTabsList>

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
