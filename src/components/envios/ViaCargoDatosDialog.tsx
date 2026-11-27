import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/client';
import type { Order } from '@/lib/types';
import { emailToPersistOnCliente } from '@/lib/utils/enviosEmail';
import { parseShippingText, type ParsedShippingData } from '@/lib/utils/parseShippingText';
import {
  PROVINCES,
  canonicalizeProvince,
  normalizeLocality,
  normalizePhoneDigitsForEnvios,
} from '@/lib/utils/shippingNormalization';

type TipoEnvio = 'Domicilio' | 'Sucursal';

interface ViaCargoForm {
  tipoEnvio: TipoEnvio;
  fullName: string;
  dni: string;
  province: string;
  locality: string;
  address: string;
  postalCode: string;
  phone: string;
  email: string;
}

const SELECT_EMPTY_VALUE = '__empty__';

const onlyDigits = (value: string) => value.replace(/\D/g, '');

/** El parser de envíos no trae DNI: se busca solo cuando viene rotulado ("DNI 30.123.456"). */
const extractDni = (text: string): string => {
  const match = text.match(/\bd\.?n\.?i\.?\b\D{0,6}(\d{1,2}\.?\d{3}\.?\d{3})/i);
  return match ? onlyDigits(match[1]) : '';
};

const formFromOrder = (order: Order): ViaCargoForm => ({
  tipoEnvio: order.shipping.service === 'SUCURSAL' ? 'Sucursal' : 'Domicilio',
  fullName: `${order.customer.firstName || ''} ${order.customer.lastName || ''}`.trim(),
  dni: '',
  province: '',
  locality: '',
  address: '',
  postalCode: '',
  phone: normalizePhoneDigitsForEnvios(order.customer.phoneE164 || ''),
  email: order.customer.email?.trim() || '',
});

interface ViaCargoDatosDialogProps {
  order: Order | null;
  userId?: string;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Datos del destinatario para Via Cargo. No usa el padrón de Correo ni sube nada a MiCorreo:
 * Via Cargo no tiene integración, la etiqueta se imprime desde la app.
 */
export function ViaCargoDatosDialog({ order, userId, onClose, onSaved }: ViaCargoDatosDialogProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<ViaCargoForm | null>(null);
  const [rawText, setRawText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!order) {
      setForm(null);
      setRawText('');
      return;
    }
    const base = formFromOrder(order);
    setForm(base);
    setRawText('');
    if (!order.direccionId) return;

    let cancelled = false;
    setIsLoading(true);
    void (async () => {
      const { data, error } = await supabase
        .from('direcciones')
        .select('nombre,apellido,dni,provincia,localidad,domicilio,codigo_postal,telefono')
        .eq('id', order.direccionId!)
        .maybeSingle();
      if (cancelled) return;
      setIsLoading(false);
      if (error || !data) {
        toast({
          title: 'No se pudieron cargar los datos actuales',
          description: 'Podés completarlos a mano y guardar.',
          variant: 'destructive',
        });
        return;
      }
      setForm({
        ...base,
        fullName: `${data.nombre || ''} ${data.apellido || ''}`.trim() || base.fullName,
        dni: data.dni || '',
        province: canonicalizeProvince(data.provincia || '') || data.provincia || '',
        locality: data.localidad || '',
        address: data.domicilio || '',
        postalCode: data.codigo_postal || '',
        phone: normalizePhoneDigitsForEnvios(data.telefono || '') || base.phone,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [order, toast]);

  const update = (patch: Partial<ViaCargoForm>) => setForm((prev) => (prev ? { ...prev, ...patch } : prev));

  const handleParse = async () => {
    if (!form || !rawText.trim()) return;
    setIsParsing(true);
    const fallback = parseShippingText(rawText);
    let parsed: ParsedShippingData = fallback;
    try {
      const response = await fetch('/api/parse-shipping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: rawText }),
      });
      if (response.ok) {
        const ai = ((await response.json())?.parsed ?? null) as Partial<ParsedShippingData> | null;
        if (ai) {
          parsed = {
            fullName: ai.fullName?.trim() || fallback.fullName,
            province: ai.province?.trim() || fallback.province,
            locality: ai.locality?.trim() || fallback.locality,
            address: ai.address?.trim() || fallback.address,
            postalCode: ai.postalCode?.trim() || fallback.postalCode,
            email: ai.email?.trim() || fallback.email,
            phone: ai.phone?.trim() || fallback.phone,
          };
        }
      }
    } catch {
      // Sin IA queda el parser local.
    } finally {
      setIsParsing(false);
    }

    update({
      fullName: parsed.fullName || form.fullName,
      dni: extractDni(rawText) || form.dni,
      province: canonicalizeProvince(parsed.province) || parsed.province || form.province,
      locality: parsed.locality ? normalizeLocality(parsed.locality) : form.locality,
      address: parsed.address || form.address,
      postalCode: parsed.postalCode || form.postalCode,
      email: form.email || parsed.email,
      phone: form.phone || normalizePhoneDigitsForEnvios(parsed.phone),
    });
    toast({ title: 'Texto interpretado', description: 'Revisá los datos antes de guardar.' });
  };

  const handleSave = async () => {
    if (!order || !form) return;
    const fullName = form.fullName.trim();
    const missing = [
      !fullName && 'nombre',
      !form.province.trim() && 'provincia',
      !form.locality.trim() && 'localidad',
      !form.address.trim() && (form.tipoEnvio === 'Sucursal' ? 'sucursal' : 'domicilio'),
    ].filter(Boolean);
    if (missing.length) {
      toast({
        title: 'Faltan datos',
        description: `Completá: ${missing.join(', ')}.`,
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      const nameParts = fullName.split(/\s+/);
      const { data: addressRow, error: addressError } = await supabase
        .from('direcciones')
        .insert({
          cliente_id: order.customer.id,
          activa: true,
          nombre: nameParts[0],
          apellido: nameParts.slice(1).join(' ') || '-',
          dni: onlyDigits(form.dni) || null,
          provincia: canonicalizeProvince(form.province) || form.province.trim(),
          localidad: normalizeLocality(form.locality),
          domicilio: form.address.trim(),
          codigo_postal: form.postalCode.trim() || '0000',
          telefono: normalizePhoneDigitsForEnvios(form.phone) || null,
        })
        .select('id')
        .single();
      if (addressError) throw addressError;

      const isEditing = Boolean(order.shippingDataLoadedAt);
      const orderUpdate: Record<string, unknown> = {
        direccion_id: addressRow.id,
        tipo_envio: form.tipoEnvio,
      };
      if (isEditing) {
        orderUpdate.envio_datos_editado = true;
      } else if (userId) {
        orderUpdate.envio_datos_cargado_por = userId;
        orderUpdate.envio_datos_cargado_at = new Date().toISOString();
        orderUpdate.envio_datos_editado = false;
      }
      const { error: orderError } = await supabase.from('ordenes').update(orderUpdate).eq('id', order.id);
      if (orderError) throw orderError;

      const mailParaCliente = emailToPersistOnCliente({
        customerEmail: order.customer.email,
        parsedEmail: form.email,
      });
      if (mailParaCliente) {
        await supabase.from('clientes').update({ mail: mailParaCliente }).eq('id', order.customer.id);
      }

      toast({ title: 'Datos de Via Cargo guardados', description: 'Ya podés imprimir la etiqueta.' });
      onSaved();
      onClose();
    } catch (saveError) {
      toast({
        title: 'Error al guardar datos',
        description: saveError instanceof Error ? saveError.message : 'No se pudo guardar la información.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const isSucursal = form?.tipoEnvio === 'Sucursal';

  return (
    <Dialog open={!!order} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Datos de envío Via Cargo</DialogTitle>
          <DialogDescription>
            Son los datos que salen en la etiqueta como destinatario. No se suben a ningún sistema.
          </DialogDescription>
        </DialogHeader>

        {form ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="via-cargo-raw-text">Texto del cliente (opcional)</Label>
              <Textarea
                id="via-cargo-raw-text"
                value={rawText}
                onChange={(event) => setRawText(event.target.value)}
                placeholder="Pegá acá los datos que mandó el cliente..."
                className="min-h-[240px]"
              />
              <Button variant="outline" onClick={() => void handleParse()} disabled={isParsing || !rawText.trim()}>
                {isParsing ? 'Interpretando...' : 'Interpretar texto'}
              </Button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={!isSucursal ? 'default' : 'outline'}
                  onClick={() => update({ tipoEnvio: 'Domicilio' })}
                >
                  Domicilio
                </Button>
                <Button
                  variant={isSucursal ? 'default' : 'outline'}
                  onClick={() => update({ tipoEnvio: 'Sucursal' })}
                >
                  Sucursal
                </Button>
              </div>

              <div className="grid grid-cols-[1fr_8rem] gap-2">
                <div className="space-y-1.5">
                  <Label>Nombre completo</Label>
                  <Input value={form.fullName} onChange={(e) => update({ fullName: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>DNI</Label>
                  <Input
                    value={form.dni}
                    inputMode="numeric"
                    onChange={(e) => update({ dni: onlyDigits(e.target.value) })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>Provincia</Label>
                  <Select
                    value={form.province || SELECT_EMPTY_VALUE}
                    onValueChange={(value) => update({ province: value === SELECT_EMPTY_VALUE ? '' : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Provincia" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[min(60vh,320px)]">
                      <SelectItem value={SELECT_EMPTY_VALUE}>(vacío)</SelectItem>
                      {form.province && !(PROVINCES as readonly string[]).includes(form.province) ? (
                        <SelectItem value={form.province}>{form.province}</SelectItem>
                      ) : null}
                      {PROVINCES.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Localidad</Label>
                  <Input
                    value={form.locality}
                    onChange={(e) => update({ locality: e.target.value })}
                    onBlur={(e) => update({ locality: normalizeLocality(e.target.value) })}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>{isSucursal ? 'Sucursal Via Cargo (dirección o nombre)' : 'Domicilio (calle y número)'}</Label>
                <Input
                  value={form.address}
                  onChange={(e) => update({ address: e.target.value })}
                  placeholder={isSucursal ? 'Ej.: Terminal de ómnibus, Av. ... 123' : 'Calle, número, piso…'}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>Código postal</Label>
                  <Input value={form.postalCode} onChange={(e) => update({ postalCode: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Teléfono</Label>
                  <Input
                    value={form.phone}
                    onChange={(e) => update({ phone: normalizePhoneDigitsForEnvios(e.target.value) })}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input
                  value={form.email}
                  readOnly={Boolean(order?.customer.email?.trim())}
                  title={order?.customer.email?.trim() ? 'Es el mail de la ficha del cliente' : undefined}
                  onChange={(e) => update({ email: e.target.value })}
                />
              </div>
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void handleSave()} disabled={!form || isSaving || isLoading}>
            {isSaving ? 'Guardando...' : 'Guardar datos'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
