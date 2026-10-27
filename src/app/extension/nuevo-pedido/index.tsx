import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { LoginForm } from '@/components/auth/LoginForm';
import { NewOrderDialog } from '@/components/pedidos/NewOrder/NewOrderDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Toaster } from '@/components/ui/toaster';
import { isFbTestUser } from '@/lib/auth/access';
import { OrdersProvider } from '@/lib/context/OrdersProvider';
import { useAuth } from '@/lib/hooks/useAuth';
import {
  clienteInicialDesdePrefill,
  leerPrefillDeHash,
  type PrefillExtension,
} from '@/lib/pedidos/prefillExtension';
import { findCustomer } from '@/lib/supabase/services/orders.service';
import type { NewOrderFormData, Order } from '@/lib/types/index';

const CLAVE_PREFILL = 'extension-nuevo-pedido';

/**
 * Lee los datos del chat del fragmento (#d=...) y los pasa a sessionStorage:
 * así sobreviven al login y no quedan en la barra de direcciones.
 */
function tomarPrefill(): PrefillExtension | null {
  const desdeHash = leerPrefillDeHash(window.location.hash);
  if (desdeHash) {
    try {
      sessionStorage.setItem(CLAVE_PREFILL, JSON.stringify(desdeHash));
    } catch {
      // Sin sessionStorage igual se usa lo del hash en esta carga.
    }
    window.history.replaceState(null, '', window.location.pathname);
    return desdeHash;
  }
  try {
    const guardado = sessionStorage.getItem(CLAVE_PREFILL);
    return guardado ? (JSON.parse(guardado) as PrefillExtension) : null;
  } catch {
    return null;
  }
}

function Centrado({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center bg-background p-4">{children}</div>;
}

function Cargando({ texto }: { texto: string }) {
  return (
    <Centrado>
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {texto}
      </p>
    </Centrado>
  );
}

/**
 * "Nuevo pedido" abierto desde la extensión de WhatsApp, en una ventana aparte.
 * Es el mismo formulario de Pedidos (NewOrderDialog), con el cliente del chat
 * precargado. Va fuera del layout con menú: la ventana es solo para cargar.
 */
export default function ExtensionNuevoPedidoPage() {
  const { isAuthenticated, loading, user } = useAuth();
  const [prefill] = useState(tomarPrefill);

  if (loading) return <Cargando texto="Cargando…" />;

  if (!isAuthenticated) {
    return (
      <Centrado>
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold text-center">Alcohn AI</CardTitle>
            <CardDescription className="text-center">
              Iniciá sesión con tu usuario de la app para cargar el pedido. Queda guardada para la próxima.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
      </Centrado>
    );
  }

  if (isFbTestUser(user)) {
    return (
      <Centrado>
        <p className="text-sm text-muted-foreground">Esta cuenta no puede cargar pedidos.</p>
      </Centrado>
    );
  }

  return (
    <OrdersProvider>
      <Toaster />
      <NuevoPedidoDesdeChat prefill={prefill} />
    </OrdersProvider>
  );
}

function NuevoPedidoDesdeChat({ prefill }: { prefill: PrefillExtension | null }) {
  const [cliente, setCliente] = useState<Partial<NewOrderFormData['customer']> | null>(
    prefill ? null : { channel: 'WHATSAPP' },
  );
  const [yaEnLaApp, setYaEnLaApp] = useState(false);
  const [creado, setCreado] = useState<Order | null>(null);
  const [intento, setIntento] = useState(0);
  const creadoRef = useRef(false);

  useEffect(() => {
    if (!prefill) return;
    let vigente = true;
    findCustomer(prefill.telefono, prefill.email)
      .catch(() => null)
      .then((existente) => {
        if (!vigente) return;
        setYaEnLaApp(Boolean(existente));
        setCliente(clienteInicialDesdePrefill(prefill, existente));
      });
    return () => {
      vigente = false;
    };
  }, [prefill]);

  if (!cliente) return <Cargando texto="Buscando al cliente en la app…" />;

  if (creado) {
    const nombre = `${creado.customer.firstName} ${creado.customer.lastName}`.trim();
    return (
      <Centrado>
        <div className="w-full max-w-md space-y-6 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-green-500" />
          <div className="space-y-1">
            <h1 className="text-xl font-semibold">Pedido creado</h1>
            <p className="text-sm text-muted-foreground">{nombre ? `Para ${nombre}.` : null} Ya figura en Pedidos.</p>
          </div>
          <div className="flex justify-center gap-3">
            <Button
              variant="outline"
              onClick={() => {
                creadoRef.current = false;
                setCreado(null);
                setIntento((n) => n + 1);
              }}
            >
              Cargar otro para este cliente
            </Button>
            <Button onClick={() => window.close()}>Cerrar ventana</Button>
          </div>
        </div>
      </Centrado>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl p-6 sm:p-8">
        {prefill && (
          <p className="mb-6 rounded-lg border border-white/15 bg-white/[0.03] px-4 py-3 text-sm text-muted-foreground">
            {yaEnLaApp
              ? 'El cliente ya está en la app: se cargaron sus datos. Lo que falte se completó con el chat.'
              : 'Cliente nuevo: se completó con los datos del chat. Revisá nombre y apellido antes de seguir.'}
          </p>
        )}
        <NewOrderDialog
          key={intento}
          layout="page"
          open
          initialCustomer={cliente}
          onCreated={(order) => {
            creadoRef.current = true;
            setCreado(order);
          }}
          onOpenChange={(abierto) => {
            // Cancelar cierra la ventana; después de crear se muestra el aviso.
            if (!abierto && !creadoRef.current) window.close();
          }}
        />
      </div>
    </div>
  );
}
