import { correoRequest, parseJsonBody } from '../http-client.js';
import type { CorreoAgency } from '../types.js';

export type ListAgenciesFilters = {
  stateId?: string;
  pickupAvailability?: boolean;
  packageReception?: boolean;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function bool(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return null;
}

function normalizeAgency(raw: unknown): CorreoAgency {
  const rec = asRecord(raw) ?? {};
  const location = asRecord(rec.location);
  const geo = location ? asRecord(location.geolocation) : null;
  const openHours = asRecord(rec.open_hours);
  const dims = asRecord(rec.maximum_package_dimensions);

  return {
    location: location
      ? {
          geolocation: geo
            ? {
                latitude: str(geo.latitude),
                longitude: str(geo.longitude),
              }
            : null,
          country_name: str(location.country_name),
          state_name: str(location.state_name),
          city_name: str(location.city_name),
          city_id: str(location.city_id),
          neighborhood_name: str(location.neighborhood_name),
          street_name: str(location.street_name),
          street_number: str(location.street_number),
          zip_code: str(location.zip_code),
        }
      : null,
    status: str(rec.status),
    schedule: str(rec.schedule),
    owner: str(rec.owner),
    email: str(rec.email),
    phone: str(rec.phone),
    agency_id: str(rec.agency_id),
    agency_name: str(rec.agency_name),
    package_reception: bool(rec.package_reception),
    pickup_availability: bool(rec.pickup_availability),
    open_hours: openHours
      ? {
          monday: str(openHours.monday),
          tuesday: str(openHours.tuesday),
          wednesday: str(openHours.wednesday),
          thursday: str(openHours.thursday),
          friday: str(openHours.friday),
          saturday: str(openHours.saturday),
          sunday: str(openHours.sunday),
          holidays: str(openHours.holidays),
        }
      : null,
    last_updated: str(rec.last_updated),
    deactivation_date: str(rec.deactivation_date),
    volumetric_capacity: rec.volumetric_capacity == null ? null : (rec.volumetric_capacity as number | string),
    maximum_package_dimensions: dims
      ? {
          height: dims.height == null ? null : (dims.height as number | string),
          length: dims.length == null ? null : (dims.length as number | string),
          width: dims.width == null ? null : (dims.width as number | string),
          weight: dims.weight == null ? null : (dims.weight as number | string),
        }
      : null,
  };
}

export async function listAgencies(filters: ListAgenciesFilters = {}): Promise<CorreoAgency[]> {
  const query: Record<string, string | undefined> = {};
  if (filters.stateId) query.stateId = filters.stateId;
  if (filters.pickupAvailability !== undefined) {
    query.pickup_availability = String(filters.pickupAvailability);
  }
  if (filters.packageReception !== undefined) {
    query.package_reception = String(filters.packageReception);
  }

  const response = await correoRequest({
    method: 'GET',
    path: '/v1/agencies',
    query,
    dumpName: 'agencies',
  });

  const parsed = parseJsonBody<unknown>(response.rawBody, '/v1/agencies');
  const wrapped = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null;
  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray(wrapped?.agencies)
      ? wrapped.agencies
      : [];
  return list.map(normalizeAgency);
}
