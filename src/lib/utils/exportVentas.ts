import { Order } from '@/lib/types/index';
import { formatDateTime } from './format';

/** Escapa un valor para CSV (comillas si contiene coma, salto de línea o comilla). */
function escapeCsvValue(value: string): string {
  const s = String(value ?? '');
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Genera y descarga un CSV con las ventas (pedidos).
 * Columnas: Fecha de la compra (con hora), Teléfono del cliente, Nombre y Apellido, Valor del Pedido, Mail del cliente.
 */
export function exportVentasToCsv(orders: Order[]): void {
  const headers = [
    'Fecha de la compra (con hora)',
    'Teléfono del cliente',
    'Nombre y Apellido',
    'Valor del Pedido',
    'Mail del cliente',
  ];

  const rows = orders.map((order) => {
    const fecha = formatDateTime(order.orderDate);
    const telefono = order.customer?.phoneE164 ?? '';
    const nombreApellido = [order.customer?.firstName ?? '', order.customer?.lastName ?? ''].filter(Boolean).join(' ');
    const valor = String(order.totalValue ?? 0);
    const mail = order.customer?.email ?? '';

    return [fecha, telefono, nombreApellido, valor, mail].map(escapeCsvValue).join(',');
  });

  const csv = [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ventas-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
