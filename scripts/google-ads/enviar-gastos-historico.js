/**
 * Script de Google Ads → Alcohn AI: CARGA HISTÓRICA (se corre UNA sola vez).
 *
 * Manda el gasto por campaña y por día desde DESDE hasta hoy, de a un mes por envío.
 * Decisión del dueño 2026-10-07: desde septiembre 2025 la publicidad de cada mes es la real de Meta y Google.
 *
 * Cómo usarlo:
 * 1. Google Ads → Herramientas → Acciones masivas → Scripts → "+" → pegar este archivo.
 * 2. Completar SECRETO (el mismo que el script diario / GOOGLE_ADS_INGEST_SECRET de Supabase).
 * 3. Autorizar y tocar "Ejecutar" (no hace falta programarlo).
 * 4. En "Registros" tiene que decir "respondió 200" una vez por mes. Después se puede borrar el script.
 *
 * Se puede volver a correr sin problema: reemplaza lo de cada mes, no duplica.
 * No commitear el secreto: se completa solo dentro de Google Ads.
 */
var URL_INGESTA = 'https://dgbyrejfcqearevvzdmf.supabase.co/functions/v1/gastos-ingest-google';
var SECRETO = 'COMPLETAR';
var DESDE = '2025-09-01';

function fechaISO(d) {
  return Utilities.formatDate(d, AdsApp.currentAccount().getTimeZone(), 'yyyy-MM-dd');
}

function finDeMes(iso) {
  var p = iso.split('-');
  var d = new Date(Date.UTC(Number(p[0]), Number(p[1]), 0));
  return d.toISOString().slice(0, 10);
}

function inicioMesSiguiente(iso) {
  var p = iso.split('-');
  var d = new Date(Date.UTC(Number(p[0]), Number(p[1]), 1));
  return d.toISOString().slice(0, 10);
}

function enviarRango(desdeIso, hastaIso, moneda) {
  var query =
    'SELECT segments.date, campaign.id, campaign.name, metrics.cost_micros ' +
    'FROM campaign ' +
    "WHERE segments.date BETWEEN '" + desdeIso + "' AND '" + hastaIso + "' " +
    'AND metrics.cost_micros > 0';

  var rows = [];
  var it = AdsApp.search(query);
  while (it.hasNext()) {
    var r = it.next();
    rows.push({
      date: r.segments.date,
      campaignId: String(r.campaign.id),
      campaignName: r.campaign.name,
      cost: Number(r.metrics.costMicros) / 1e6,
    });
  }

  var res = UrlFetchApp.fetch(URL_INGESTA, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-ingest-secret': SECRETO },
    payload: JSON.stringify({ currency: moneda, desde: desdeIso, hasta: hastaIso, rows: rows }),
    muteHttpExceptions: true,
  });
  Logger.log(desdeIso + ' → ' + hastaIso + ' (' + rows.length + ' filas): respondió ' + res.getResponseCode() + ' ' + res.getContentText());
  if (res.getResponseCode() !== 200) {
    throw new Error('Falló el envío de ' + desdeIso + ' a Alcohn AI');
  }
}

function main() {
  var hoy = fechaISO(new Date());
  var moneda = AdsApp.currentAccount().getCurrencyCode();
  var cursor = DESDE;
  while (cursor <= hoy) {
    var fin = finDeMes(cursor);
    enviarRango(cursor, fin < hoy ? fin : hoy, moneda);
    cursor = inicioMesSiguiente(cursor);
  }
}
