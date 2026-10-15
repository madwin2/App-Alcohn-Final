import { AlertTriangle } from 'lucide-react'
import { colorEstado } from '../ChipEstado'
import { Bloque, Fila, Lista, Vacio, hace, nombreCliente } from './areaUi'
import { ETAPAS_ENVIO, TRANSPORTE, porTransporte, useEnvios } from './datos'
import { Flujo } from './graficos'

/**
 * Logística, en gráfico: el recorrido del envío como flujo (Para enviar → Hacer etiqueta →
 * Error de etiqueta → Etiqueta lista → Despachado, falta el seguimiento). Cada etapa dice cuántos
 * pedidos hay y por qué transporte; el error de etiqueta se marca como alerta. Abajo, los errores
 * con su mensaje (lo que hay que destrabar).
 */

export function FlujoEnvios({ compacto }: { compacto?: boolean }) {
  const { porEtapa } = useEnvios()
  return (
    <Flujo
      compacto={compacto}
      etapas={ETAPAS_ENVIO.map(e => {
        const lista = porEtapa.get(e.clave) ?? []
        const transportes = porTransporte(lista)
        return {
          texto: e.texto,
          n: lista.length,
          alerta: e.clave === 'ERROR_ETIQUETA',
          // Mismo color que el estado de envío en Pedidos ("Para enviar" = Sin envío).
          color: colorEstado(
            'envio',
            e.clave === 'enviar' ? 'SIN_ENVIO' : e.clave
          ),
          detalle: transportes.length ? (
            <span className="flex flex-col gap-0.5">
              {transportes.slice(0, 4).map(t => (
                <span key={t.texto} className="flex justify-between gap-2">
                  <span className="truncate">{t.texto}</span>
                  <span className="tabular-nums text-white/75">{t.n}</span>
                </span>
              ))}
            </span>
          ) : undefined,
        }
      })}
    />
  )
}

export function ErroresEtiqueta() {
  const { porEtapa } = useEnvios()
  const errores = porEtapa.get('ERROR_ETIQUETA') ?? []
  if (errores.length === 0) return <Vacio>No hay etiquetas con error.</Vacio>
  return (
    <Lista>
      {errores.map(o => (
        <Fila
          key={o.id}
          izquierda={
            <AlertTriangle className="size-4 shrink-0 text-[#f6a33d]" />
          }
          titulo={nombreCliente(o.customer)}
          detalle={
            o.labelErrorMessage ||
            o.shippingLabelError ||
            'Error al generar la etiqueta'
          }
          derecha={TRANSPORTE[o.shipping?.carrier ?? 'SIN']}
          subDerecha={hace(o.labelGeneratedAt ?? o.createdAt) ?? undefined}
        />
      ))}
    </Lista>
  )
}

export function AreaLogistica({
  variante = 'panel',
}: {
  variante?: 'panel' | 'compacto'
}) {
  const { porEtapa } = useEnvios()
  const errores = (porEtapa.get('ERROR_ETIQUETA') ?? []).length

  if (variante === 'compacto') {
    return (
      <div className="space-y-4">
        <FlujoEnvios compacto />
        {errores ? (
          <div className="flex max-h-[220px] min-h-0 flex-col">
            <ErroresEtiqueta />
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] gap-3">
      <Bloque titulo="Recorrido de los envíos" ir="/envios">
        <FlujoEnvios />
      </Bloque>
      <Bloque
        titulo="Errores de etiqueta"
        ir="/envios"
        derecha={
          <span
            className={
              errores
                ? 'text-[12px] text-[#f6a33d]'
                : 'text-[12px] text-white/35'
            }
          >
            {errores}
          </span>
        }
      >
        <ErroresEtiqueta />
      </Bloque>
    </div>
  )
}
