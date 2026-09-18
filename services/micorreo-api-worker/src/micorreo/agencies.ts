import { apiRequest, parseJsonBody } from '../http-client.js';
import type { Agency, AgencyHoursSlot } from '../types.js';

export type ListAgenciesFilters = {
  customerId: string;
  provinceCode: string;
  services?: 'package_reception' | 'pickup_availability';
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

function hoursSlot(value: unknown): AgencyHoursSlot {
  if (value === null || value === undefined) return null;
  const rec = asRecord(value);
  if (!rec) return null;
  return { start: str(rec.start), end: str(rec.end) };
}

function normalizeAgency(raw: unknown): Agency {
  const rec = asRecord(raw) ?? {};
  const services = asRecord(rec.services);
  const location = asRecord(rec.location);
  const address = location ? asRecord(location.address) : null;
  const hours = asRecord(rec.hours);

  return {
    code: str(rec.code),
    name: str(rec.name),
    manager: str(rec.manager),
    email: str(rec.email),
    phone: str(rec.phone),
    status: str(rec.status),
    services: services
      ? {
          packageReception: bool(services.packageReception ?? services.package_reception),
          pickupAvailability: bool(services.pickupAvailability ?? services.pickup_availability),
        }
      : null,
    location: location
      ? {
          address: address
            ? {
                streetName: str(address.streetName),
                streetNumber: str(address.streetNumber),
                floor: str(address.floor),
                apartment: str(address.apartment),
                locality: str(address.locality),
                city: str(address.city),
                province: str(address.province),
                provinceCode: str(address.provinceCode),
                postalCode: str(address.postalCode),
              }
            : null,
          latitude: str(location.latitude),
          longitude: str(location.longitude),
        }
      : null,
    hours: hours
      ? {
          sunday: hoursSlot(hours.sunday),
          monday: hoursSlot(hours.monday),
          tuesday: hoursSlot(hours.tuesday),
          wednesday: hoursSlot(hours.wednesday),
          thursday: hoursSlot(hours.thursday),
          friday: hoursSlot(hours.friday),
          saturday: hoursSlot(hours.saturday),
          holidays: hoursSlot(hours.holidays),
        }
      : null,
  };
}

export async function listAgencies(filters: ListAgenciesFilters): Promise<Agency[]> {
  const query: Record<string, string | undefined> = {
    customerId: filters.customerId,
    provinceCode: filters.provinceCode,
  };
  if (filters.services) query.services = filters.services;

  const response = await apiRequest({
    method: 'GET',
    path: '/agencies',
    query,
    dumpName: `agencies-${filters.provinceCode}`,
  });

  const parsed = parseJsonBody<unknown>(response.rawBody, '/agencies');
  const list = Array.isArray(parsed) ? parsed : [];
  return list.map(normalizeAgency);
}
