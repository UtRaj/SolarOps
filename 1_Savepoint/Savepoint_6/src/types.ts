export type ViewTab = 'overview' | 'orders' | 'chat' | 'solar-grid' | 'fleet' | 'battery' | 'map';

export type WeatherType = 'Clear / Sunny' | 'Scattered Clouds' | 'Overcast' | 'Thunderstorm' | 'Extreme Heat';

export interface WeatherState {
  type: WeatherType;
  cloudCoverPct: number;
  ambientTempC: number;
  humidityPct: number;
  irradianceWm2: number;
}

export interface SolarFarm {
  id: number;
  stationId: 1 | 2 | 3;
  name: string;
  location: string;
  panels: number; // 60 to 120
  minPanels: number;
  maxPanels: number;
  panelWattageW: number;
  trackerType: 'Fixed Tilt (30°)' | 'Single-Axis Tracker' | 'Dual-Axis Tracker';
  currentOutputKw: number;
  peakOutputKw: number;
  efficiencyPct: number;
  inverterStatus: 'Optimal' | 'High-Load' | 'Standby';
  soilingLossPct: number;
  temperatureC: number;
}

export interface GridStation {
  id: 1 | 2 | 3;
  name: string;
  code: string;
  purpose: 'Truck Charging (Fleet)' | 'Battery Pack Charging (Dedicated)';
  active: boolean; // GS-03 can be activated/deactivated
  connectedFarmIds: number[];
  currentSolarInputKw: number;
  bessCapacityKwh: number;
  bessStoredKwh: number;
  bessSocPct: number;
  activeLoadKw: number;
  voltageV: number;
  frequencyHz: number;
  transformerTempC: number;
  status: 'Online & Supplying' | 'Standby / Deactivated';
}

export type TruckOpStatus =
  | 'Available at Depot'
  | 'Charging (Fast DC)'
  | 'Queued for Charger'
  | 'Dispatched - En Route'
  | 'At Pickup Point'
  | 'At Delivery Point 1'
  | 'At Delivery Point 2'
  | 'At Delivery Point 3'
  | 'Returning to Depot';

export interface BoxTypeConfig {
  id: string;
  name: string;
  unitWeightKg: number;
  description: string;
  iconType: 'box' | 'industrial' | 'medical' | 'dense' | 'express';
}

export interface RouteLeg {
  legIndex: number;
  fromName: string;
  fromPointId: number | 'depot';
  fromCoords: { x: number; y: number; lat: number; lng: number };
  toName: string;
  toPointId: number | 'depot';
  toCoords: { x: number; y: number; lat: number; lng: number };
  distanceKm: number;
  cargoWeightKg: number;
  boxCount: number;
  boxTypeName: string;
  actionDescription: string;
  completed: boolean;
}

export interface RouteStop {
  pointId: number;
  type: 'pickup' | 'delivery' | 'depot';
  label: string;
  completed: boolean;
}

export interface TruckRoute {
  orderId?: string;
  pickupId: number;
  deliveryIds: number[];
  legs: RouteLeg[];
  currentLegIndex: number;
  legProgressPct: number; // 0 to 100
  totalDistanceKm: number;
  distanceCompletedKm: number;
  departureSoc: number;
  estimatedReturnSoc: number;
  cargoDetails: {
    boxTypeId: string;
    boxTypeName: string;
    unitWeightKg: number;
    initialBoxes: number;
    totalWeightKg: number;
  };
  stops: RouteStop[];
  currentStopIndex: number;
}

export type ServiceClass = 'cold-chain' | 'heavy-haul' | 'express-rapid' | 'fragile-secure' | 'standard';

export interface TruckSpecialization {
  serviceType: ServiceClass;
  categoryLabel: string;
  badgeColor: string;
  maxPayloadKg: number;
  specialEquipment: string[];
  coldStorageTempC?: string;
  tariffMultiplier: number;
}

export interface Truck {
  id: number;
  name: string;
  plate: string;
  specialization: TruckSpecialization;
  batteryCapacityKwh: number; // e.g. 150 kWh
  soc: number; // Current battery power %
  arrivalSoc: number | null; // What % it returned with to prove it charges from that exact %
  opStatus: TruckOpStatus;
  connectedToCharger: boolean; // Dispatched trucks reflect as disconnected (0 kW)
  chargerBay: number | null; // 1 to 5 if charging, null otherwise
  chargeRateKw: number; // Max ~40-60 kW
  targetSoc: number; // 100%
  route: TruckRoute | null;
  currentCargo: string | null;
  totalDeliveriesCompleted: number;
  currentCoords: { x: number; y: number; lat: number; lng: number };
  motorTempC: number;
}

export interface DeliveryPoint {
  id: number;
  code: string;
  name: string;
  category: 'Warehouse / Depot' | 'Industrial Park' | 'Medical Center' | 'Airport Freight' | 'Retail Hub' | 'Technology Zone' | 'Cold Storage' | 'Logistics Cross-Dock';
  address: string;
  coords: { x: number; y: number; lat: number; lng: number };
  activeOrdersCount: number;
  cargoDescription: string;
}

export interface BatteryPack {
  id: number;
  name: string;
  capacityKwh: number; // 35 kWh
  soc: number;
  charging: boolean;
  chargeRateKw: number; // 8-12 kW
  status: 'Ready (100%)' | 'Charging (GS-03)' | 'Charging (Super Battery)' | 'Idle / Stored';
  healthPct: number;
  cycles: number;
}

export interface SuperBattery {
  name: string;
  capacityKwh: number; // 6,000 kWh (super high capacity)
  storedKwh: number;
  soc: number;
  maxChargeRateKw: number; // 300 kW
  maxDischargeRateKw: number; // 400 kW
  isCharging: boolean;
  isDischarging: boolean;
  activeNightSupply: boolean;
  lockReason: string | null; // Only charges when NO other battery is charging
  powerFlowKw: number;
}

export interface OperationalLog {
  id: string;
  timestamp: string;
  category: 'solar' | 'grid' | 'fleet' | 'battery' | 'dispatch' | 'system';
  severity: 'info' | 'success' | 'warning' | 'alert';
  message: string;
}

export interface DetailModalContent {
  type: 'truck' | 'solar-farm' | 'grid-station' | 'battery-pack' | 'super-battery' | 'delivery-point' | 'order';
  id: number | string;
  title: string;
  subtitle: string;
  data: Record<string, string | number | boolean>;
}

export type ExtraServiceId = 'cold_logistics' | 'fragile_care' | 'express_sprint' | 'tailgate_hydraulic';

export interface ExtraServiceOption {
  id: ExtraServiceId;
  name: string;
  description: string;
  surchargeAmount: number;
  surchargeType: 'flat' | 'percentage';
  percentageVal?: number;
}

export interface OrderPricing {
  distanceKm: number;
  perKmRate: number;
  perKgRate: number;
  baseDistanceFare: number;
  weightFare: number;
  extraServicesFare: number;
  subtotal: number;
  gstRatePct: number; // 18% GST
  gstAmount: number;
  totalAmount: number;
}

export type OrderStatus =
  | 'scheduled'
  | 'dispatched_to_pickup'
  | 'in_transit'
  | 'delivered'
  | 'cancelled';

export interface MerchantOrder {
  id: string;
  source: 'chatbox' | 'manual';
  merchantName: string;
  originPointId: number;
  originPointName: string;
  destinationPointId: number;
  destinationPointName: string;
  weightKg: number;
  boxCount: number;
  scheduledPickupTimeHours: number; // e.g. 17.1 for 17:06
  calculatedDispatchTimeHours: number; // calculated early departure so truck reaches origin at pickup time
  transitMinutesFromBay: number;
  requiredService: ServiceClass;
  extraServices: ExtraServiceId[];
  pricing: OrderPricing;
  status: OrderStatus;
  assignedTruckId: number | null;
  createdAtTimestamp: string;
  specialInstructions?: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'agent' | 'system';
  text: string;
  timestamp: string;
  proposedOrder?: Partial<MerchantOrder> & { pricing: OrderPricing };
  isConfirmed?: boolean;
}

