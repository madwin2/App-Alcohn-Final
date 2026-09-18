export type DeliveryType = 'D' | 'S';

export type TokenResult = {
  token: string;
  expiresAt: Date;
  expiresRaw: string;
  issuedAt: Date;
  ttlMinutes: number;
};

export type CustomerResult = {
  customerId: string;
  createdAt: string | null;
};

export type AgencyHoursSlot = { start: string | null; end: string | null } | null;

export type Agency = {
  code: string | null;
  name: string | null;
  manager: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
  services: {
    packageReception: boolean | null;
    pickupAvailability: boolean | null;
  } | null;
  location: {
    address: {
      streetName: string | null;
      streetNumber: string | null;
      floor: string | null;
      apartment: string | null;
      locality: string | null;
      city: string | null;
      province: string | null;
      provinceCode: string | null;
      postalCode: string | null;
    } | null;
    latitude: string | null;
    longitude: string | null;
  } | null;
  hours: {
    sunday: AgencyHoursSlot;
    monday: AgencyHoursSlot;
    tuesday: AgencyHoursSlot;
    wednesday: AgencyHoursSlot;
    thursday: AgencyHoursSlot;
    friday: AgencyHoursSlot;
    saturday: AgencyHoursSlot;
    holidays: AgencyHoursSlot;
  } | null;
};

export type RateItem = {
  deliveredType: string | null;
  productType: string | null;
  productName: string | null;
  price: number | null;
  deliveryTimeMin: string | null;
  deliveryTimeMax: string | null;
};

export type RatesResult = {
  customerId: string | null;
  validTo: string | null;
  validToParsed: Date | null;
  rates: RateItem[];
};

export type AddressPayload = {
  streetName: string | null;
  streetNumber: string | null;
  floor: string | null;
  apartment: string | null;
  city: string | null;
  provinceCode: string | null;
  postalCode: string | null;
};

export type ImportPayload = {
  customerId: string;
  extOrderId: string;
  orderNumber: string | null;
  sender: {
    name: string | null;
    phone: string | null;
    cellPhone: string | null;
    email: string | null;
    originAddress: AddressPayload;
  };
  recipient: {
    name: string;
    phone: string;
    cellPhone: string;
    email: string;
  };
  shipping: {
    deliveryType: DeliveryType;
    productType: string;
    agency: string | null;
    address: AddressPayload | null;
    weight: number;
    declaredValue: number;
    height: number;
    length: number;
    width: number;
  };
};

export type ImportResult = {
  createdAt: string;
};

export type RegistryEntry = {
  extOrderId: string;
  orderNumber: string | null;
  createdAt: string;
  deliveryType: DeliveryType;
  agency: string | null;
  destinatario: string;
  env: string;
  notes?: string;
};

export type RawHttpResponse = {
  status: number;
  headers: Record<string, string>;
  rawBody: string;
};
