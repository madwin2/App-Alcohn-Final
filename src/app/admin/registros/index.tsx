import { useState, useEffect } from 'react';
import { Sidebar } from '@/components/pedidos/Sidebar/Sidebar';
import { useAuth } from '@/lib/hooks/useAuth';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react';
import {
  getAllRegistrationRequests,
  approveRegistrationRequest,
  rejectRegistrationRequest,
} from '@/lib/supabase/services/auth.service';
import { formatDateTime } from '@/lib/utils/format';

interface RegistrationRequest {
  id: string;
  user_id: string;
  email: string;
  nombre: string | null;
  apellido: string | null;
  estado: 'PENDIENTE' | 'APROBADO' | 'RECHAZADO';
  solicitado_en: string;
  aprobado_en: string | null;
  aprobado_por: string | null;
  motivo_rechazo: string | null;
}

export default function RegistrosAdminPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [requests, setRequests] = useState<RegistrationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const data = await getAllRegistrationRequests();
      setRequests(data);
    } catch (error: any) {
      console.error('Error fetching requests:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las solicitudes',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleApprove = async (requestId: string) => {
    if (!user) return;

    try {
      setProcessingId(requestId);
      await approveRegistrationRequest(requestId, user.id);
      toast({
        title: 'Solicitud aprobada',
        description: 'El usuario ahora puede iniciar sesión',
      });
      await fetchRequests();
    } catch (error: any) {
      console.error('Error approving request:', error);
      toast({
        title: 'Error',
        description: 'No se pudo aprobar la solicitud',
        variant: 'destructive',
      });
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (requestId: string) => {
    if (!user) return;

    const motivo = prompt('Motivo del rechazo (opcional):');
    if (motivo === null) return; // Usuario canceló

    try {
      setProcessingId(requestId);
      await rejectRegistrationRequest(requestId, user.id, motivo || undefined);
      toast({
        title: 'Solicitud rechazada',
        description: 'La solicitud ha sido rechazada',
      });
      await fetchRequests();
    } catch (error: any) {
      console.error('Error rejecting request:', error);
      toast({
        title: 'Error',
        description: 'No se pudo rechazar la solicitud',
        variant: 'destructive',
      });
    } finally {
      setProcessingId(null);
    }
  };

  const getStatusBadge = (estado: string) => {
    switch (estado) {
      case 'PENDIENTE':
        return (
          <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
            <Clock className="h-3 w-3 mr-1" />
            Pendiente
          </Badge>
        );
      case 'APROBADO':
        return (
          <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Aprobado
          </Badge>
        );
      case 'RECHAZADO':
        return (
          <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/20">
            <XCircle className="h-3 w-3 mr-1" />
            Rechazado
          </Badge>
        );
      default:
        return <Badge variant="outline">{estado}</Badge>;
    }
  };

  const pendingRequests = requests.filter(r => r.estado === 'PENDIENTE');
  const otherRequests = requests.filter(r => r.estado !== 'PENDIENTE');

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      
      <div className="flex-1 flex flex-col ml-20">
        <div className="border-b bg-background p-6">
          <h1 className="text-2xl font-bold">Gestión de Registros</h1>
          <p className="text-muted-foreground mt-1">
            Aprobar o rechazar solicitudes de registro
          </p>
        </div>

        <div className="flex-1 p-6 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Solicitudes Pendientes */}
              {pendingRequests.length > 0 && (
                <div>
                  <h2 className="text-xl font-semibold mb-4">
                    Solicitudes Pendientes ({pendingRequests.length})
                  </h2>
                  <div className="grid gap-4">
                    {pendingRequests.map((request) => (
                      <Card key={request.id}>
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <div>
                              <CardTitle className="text-lg">
                                {request.nombre && request.apellido
                                  ? `${request.nombre} ${request.apellido}`
                                  : request.email}
                              </CardTitle>
                              <CardDescription>{request.email}</CardDescription>
                            </div>
                            {getStatusBadge(request.estado)}
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            <p className="text-sm text-muted-foreground">
                              Solicitado: {formatDateTime(request.solicitado_en)}
                            </p>
                            <div className="flex gap-2">
                              <Button
                                onClick={() => handleApprove(request.id)}
                                disabled={processingId === request.id}
                                className="bg-green-600 hover:bg-green-700"
                              >
                                {processingId === request.id ? (
                                  <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Procesando...
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle2 className="mr-2 h-4 w-4" />
                                    Aprobar
                                  </>
                                )}
                              </Button>
                              <Button
                                variant="destructive"
                                onClick={() => handleReject(request.id)}
                                disabled={processingId === request.id}
                              >
                                {processingId === request.id ? (
                                  <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Procesando...
                                  </>
                                ) : (
                                  <>
                                    <XCircle className="mr-2 h-4 w-4" />
                                    Rechazar
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Otras Solicitudes */}
              {otherRequests.length > 0 && (
                <div>
                  <h2 className="text-xl font-semibold mb-4">
                    Historial ({otherRequests.length})
                  </h2>
                  <div className="grid gap-4">
                    {otherRequests.map((request) => (
                      <Card key={request.id}>
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <div>
                              <CardTitle className="text-lg">
                                {request.nombre && request.apellido
                                  ? `${request.nombre} ${request.apellido}`
                                  : request.email}
                              </CardTitle>
                              <CardDescription>{request.email}</CardDescription>
                            </div>
                            {getStatusBadge(request.estado)}
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2 text-sm">
                            <p className="text-muted-foreground">
                              Solicitado: {formatDateTime(request.solicitado_en)}
                            </p>
                            {request.aprobado_en && (
                              <p className="text-muted-foreground">
                                {request.estado === 'APROBADO' ? 'Aprobado' : 'Rechazado'}:{' '}
                                {formatDateTime(request.aprobado_en)}
                              </p>
                            )}
                            {request.motivo_rechazo && (
                              <p className="text-red-600">
                                Motivo: {request.motivo_rechazo}
                              </p>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {requests.length === 0 && (
                <Card>
                  <CardContent className="py-12 text-center">
                    <p className="text-muted-foreground">
                      No hay solicitudes de registro
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}









