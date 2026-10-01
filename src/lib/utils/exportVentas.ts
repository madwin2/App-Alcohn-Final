import { Order } from '@/lib/types/index';
import { formatDateTime } from './format';
import { itemCuentaComoVenta, ordenCuentaComoVenta } from '@/lib/pedidos/tipoPedido';

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

  // Solo ventas: sin pedidos de Prueba ni de Regalo.
  const rows = orders.filter(ordenCuentaComoVenta).map((order) => {
    const fecha = formatDateTime(order.orderDate);
    const telefono = order.customer?.phoneE164 ?? '';
    const nombreApellido = [order.customer?.firstName ?? '', order.customer?.lastName ?? ''].filter(Boolean).join(' ');
    // Valor sin ítems regalo: si hay alguno, se suman solo los ítems que cuentan como venta.
    const tieneItemsRegalo = order.items?.some((i) => i.isGift);
    const valorNumero = tieneItemsRegalo
      ? order.items.filter((i) => itemCuentaComoVenta(order, i)).reduce((s, i) => s + (i.itemValue ?? 0), 0)
      : order.totalValue ?? 0;
    const valor = String(valorNumero);
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
