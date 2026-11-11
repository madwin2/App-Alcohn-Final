export type DeliveryType = 'homeDelivery' | 'agency' | 'locker';

export type LabelFormat = '10x15' | 'label' | '';

export type CorreoAddress = {
  streetName: string;
  streetNumber: string;
  cityName: string;
  floor: string;
  department: string;
  state: string;
  zipCode: string;
};

export type CorreoSenderData = {
  businessName: string;
  areaCodePhone: string;
  phoneNumber: string;
  areaCodeCellphone: string;
  cellphoneNumber: string;
  email: string;
  observation: string;
  address: CorreoAddress;
};

export type CorreoShippingData = {
  name: string;
  areaCodePhone: string;
  phoneNumber: string;
  areaCodeCellphone: string;
  cellphoneNumber: string;
  email: string;
  observation: string;
  address: CorreoAddress;
};

export type CorreoParcel = {
  dimensions: {
    height: string;
    width: string;
    depth: string;
  };
  productWeight: string;
  productCategory: string;
  declaredValue: string;
};

export type CorreoOrderPayload = {
  sellerId: string;
  trackingNumber: string;
  order: {
    senderData: CorreoSenderData;
    shippingData: CorreoShippingData;
    parcels: CorreoParcel[];
    deliveryType: DeliveryType;
    agencyId: string;
    saleDate: string;
    serviceType: string;
    shipmentClientId: string;
  };
};

export type CorreoAgency = {
  location: {
    geolocation: { latitude: string | null; longitude: string | null } | null;
    country_name: string | null;
    state_name: string | null;
    city_name: string | null;
    city_id: string | null;
    neighborhood_name: string | null;
    street_name: string | null;
    street_number: string | null;
    zip_code: string | null;
  } | null;
  status: string | null;
  schedule: string | null;
  owner: string | null;
  email: string | null;
  phone: string | null;
  agency_id: string | null;
  agency_name: string | null;
  package_reception: boolean | null;
  pickup_availability: boolean | null;
  open_hours: {
    monday: string | null;
    tuesday: string | null;
    wednesday: string | null;
    thursday: string | null;
    friday: string | null;
    saturday: string | null;
    sunday: string | null;
    holidays: string | null;
  } | null;
  last_updated: string | null;
  deactivation_date: string | null;
  volumetric_capacity: number | string | null;
  maximum_package_dimensions: {
    height: number | string | null;
    length: number | string | null;
    width: number | string | null;
    weight: number | string | null;
  } | null;
};

export type LabelItemResult = {
  trackingNumber: string;
  fileBase64: string;
  fileName: string;
  result: string;
  ok: boolean;
};

export type TrackingEvent = {
  facilityId: string | null;
  facility: string | null;
  statusId: string | null;
  status: string | null;
  date: string | null;
  dateParsed: Date | null;
  sign: string | null;
};

export type TrackingItem = {
  trackingNumber: string;
  quantity: number;
  countryId: string | null;
  serviceType: string | null;
  events: TrackingEvent[];
  empty: boolean;
};

export type TrackingHttpVariant = 'GET_BODY' | 'GET_QUERY' | 'POST';

export type CancelResult = {
  codigo: number | null;
  mensaje: string;
  raw: unknown;
};

export type RegistryEntry = {
  trackingNumber: string;
  createdAt: string;
  deliveryType: string;
  destinatario: string;
  cancelled: boolean;
  cancelledAt: string | null;
  notes?: string;
};

export type RawHttpResponse = {
  status: number;
  headers: Record<string, string>;
  rawBody: string;
};
