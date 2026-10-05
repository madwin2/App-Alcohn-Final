/**
 * Script de Google Ads → Alcohn AI (PLAN_CONTROL_GASTOS.md).
 *
 * Manda a la app el gasto por campaña y por día de los últimos 7 días.
 * Dónde se pega: Google Ads → Herramientas → Acciones masivas → Scripts → "+" → pegar → Autorizar.
 * Programarlo "Diariamente" a las 6:00.
 *
 * Completar SECRETO con el mismo valor que el secreto GOOGLE_ADS_INGEST_SECRET de Supabase.
 * No commitear el secreto: se completa solo dentro de Google Ads.
 */
var URL_INGESTA = 'https://dgbyrejfcqearevvzdmf.supabase.co/functions/v1/gastos-ingest-google';
var SECRETO = 'COMPLETAR';
var DIAS = 7;

function fechaISO(d) {
  return Utilities.formatDate(d, AdsApp.currentAccount().getTimeZone(), 'yyyy-MM-dd');
}

function main() {
  var hoy = new Date();
  var desde = new Date(hoy.getTime() - DIAS * 24 * 60 * 60 * 1000);
  var desdeIso = fechaISO(desde);
  var hastaIso = fechaISO(hoy);

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
    payload: JSON.stringify({
      currency: AdsApp.currentAccount().getCurrencyCode(),
      desde: desdeIso,
      hasta: hastaIso,
      rows: rows,
    }),
    muteHttpExceptions: true,
  });
  Logger.log('Alcohn AI respondió ' + res.getResponseCode() + ': ' + res.getContentText());
  if (res.getResponseCode() !== 200) {
    throw new Error('Falló el envío a Alcohn AI');
  }
}
