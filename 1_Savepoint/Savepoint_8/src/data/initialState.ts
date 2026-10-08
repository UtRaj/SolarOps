import {
  DeliveryPoint,
  Truck,
  SolarFarm,
  GridStation,
  BatteryPack,
  SuperBattery,
  WeatherState,
  ExtraServiceOption,
  MerchantOrder
} from '../types';

export const DEPOT_COORDS = { x: 50, y: 50, lat: 18.5204, lng: 73.8567 };

export const INITIAL_DELIVERY_POINTS: DeliveryPoint[] = [
  {
    id: 1,
    code: 'DP-01',
    name: 'Central Warehouse & Hub',
    category: 'Warehouse / Depot',
    address: 'Bay 12, Terminal Blvd, Sector 1',
    coords: { x: 50, y: 50, lat: 18.5204, lng: 73.8567 },
    activeOrdersCount: 8,
    cargoDescription: 'Heavy pallets, consumer electronics & retail stock'
  },
  {
    id: 2,
    code: 'DP-02',
    name: 'North Logistics Cargo Terminal',
    category: 'Logistics Cross-Dock',
    address: '400 North Industrial Expressway',
    coords: { x: 52, y: 22, lat: 18.5721, lng: 73.8710 },
    activeOrdersCount: 4,
    cargoDescription: 'Palletized manufacturing components'
  },
  {
    id: 3,
    code: 'DP-03',
    name: 'Riverfront Medical & Pharma Center',
    category: 'Medical Center',
    address: '88 Riverfront Drive, Healthcare District',
    coords: { x: 26, y: 38, lat: 18.5350, lng: 73.8210 },
    activeOrdersCount: 3,
    cargoDescription: 'Temperature-sensitive pharmaceuticals & vaccines'
  },
  {
    id: 4,
    code: 'DP-04',
    name: 'West Industrial Manufacturing Zone',
    category: 'Industrial Park',
    address: 'Plot 104, Foundry Way, Western Belt',
    coords: { x: 18, y: 64, lat: 18.4980, lng: 73.8050 },
    activeOrdersCount: 5,
    cargoDescription: 'Machined steel parts & robotic assemblies'
  },
  {
    id: 5,
    code: 'DP-05',
    name: 'South Metro Commercial Plaza',
    category: 'Retail Hub',
    address: '15 South Galleria Avenue',
    coords: { x: 38, y: 82, lat: 18.4650, lng: 73.8420 },
    activeOrdersCount: 6,
    cargoDescription: 'Packaged consumer retail goods & fashion inventory'
  },
  {
    id: 6,
    code: 'DP-06',
    name: 'Airport Cargo Gate 4',
    category: 'Airport Freight',
    address: 'Cargo Apron East, International Airport',
    coords: { x: 82, y: 30, lat: 18.5580, lng: 73.9180 },
    activeOrdersCount: 9,
    cargoDescription: 'Express air-freight parcels & urgent imports'
  },
  {
    id: 7,
    code: 'DP-07',
    name: 'East Tech Park Fulfillment',
    category: 'Technology Zone',
    address: 'Building 7, Cyber Valley Boulevard',
    coords: { x: 86, y: 55, lat: 18.5150, lng: 73.9310 },
    activeOrdersCount: 4,
    cargoDescription: 'Semiconductor wafers, servers & optic components'
  },
  {
    id: 8,
    code: 'DP-08',
    name: 'Silicon Valley Research Campus',
    category: 'Technology Zone',
    address: 'Innovation Ring Road, Sector 9',
    coords: { x: 74, y: 70, lat: 18.4890, lng: 73.9050 },
    activeOrdersCount: 2,
    cargoDescription: 'Lab instruments & sensitive prototypes'
  },
  {
    id: 9,
    code: 'DP-09',
    name: 'Southwest Fresh Produce Market',
    category: 'Warehouse / Depot',
    address: 'Terminal 3, Agri-Wholesale Yard',
    coords: { x: 28, y: 72, lat: 18.4810, lng: 73.8240 },
    activeOrdersCount: 7,
    cargoDescription: 'Fresh fruit crates & organic dairy boxes'
  },
  {
    id: 10,
    code: 'DP-10',
    name: 'Harbor Marine Intermodal Yard',
    category: 'Logistics Cross-Dock',
    address: 'Pier 22 Container Facility',
    coords: { x: 88, y: 78, lat: 18.4720, lng: 73.9450 },
    activeOrdersCount: 5,
    cargoDescription: 'Imported container crates & maritime spares'
  },
  {
    id: 11,
    code: 'DP-11',
    name: 'East Cold Storage Logistics Hub',
    category: 'Cold Storage',
    address: 'FreezeZone Facility, Highway 18',
    coords: { x: 76, y: 18, lat: 18.5790, lng: 73.9020 },
    activeOrdersCount: 4,
    cargoDescription: 'Frozen foods & cryo-preserved biologics'
  },
  {
    id: 12,
    code: 'DP-12',
    name: 'Northwest Suburban Retail Park',
    category: 'Retail Hub',
    address: '220 Suburban Arterial Way',
    coords: { x: 30, y: 16, lat: 18.5830, lng: 73.8320 },
    activeOrdersCount: 3,
    cargoDescription: 'Home improvement & hardware supplies'
  },
  {
    id: 13,
    code: 'DP-13',
    name: 'University Science Quadrangle',
    category: 'Technology Zone',
    address: 'Chancellor Ave, Education District',
    coords: { x: 42, y: 32, lat: 18.5440, lng: 73.8450 },
    activeOrdersCount: 2,
    cargoDescription: 'Academic publications & computing workstations'
  },
  {
    id: 14,
    code: 'DP-14',
    name: 'South Industrial Engineering Park',
    category: 'Industrial Park',
    address: 'Sector 5 Heavy Fabricators Strip',
    coords: { x: 58, y: 88, lat: 18.4520, lng: 73.8790 },
    activeOrdersCount: 4,
    cargoDescription: 'Heavy machinery spare bearings & valves'
  },
  {
    id: 15,
    code: 'DP-15',
    name: 'Cross-Dock Rapid Transit Station',
    category: 'Logistics Cross-Dock',
    address: '77 Transit Corridor Interchange',
    coords: { x: 68, y: 44, lat: 18.5290, lng: 73.8920 },
    activeOrdersCount: 5,
    cargoDescription: 'Same-day e-commerce parcels & express freight'
  }
];

export const INITIAL_TRUCKS: Truck[] = [
  {
    id: 1,
    name: 'Truck-01',
    plate: 'EV-TRK-101',
    specialization: {
      serviceType: 'refrigerated-cryo',
      categoryLabel: 'Refrigerated Cryo-Chassis EV',
      badgeColor: 'text-cyan-800 bg-cyan-50 border-cyan-200',
      maxPayloadKg: 2200,
      specialEquipment: ['Sub-Zero Cryo Chiller (-20°C)', 'Pharma Active Temp Telemetry', 'Dual-Wall Vacuum Thermal Insulation'],
      coldStorageTempC: '-20°C to +4°C',
      tariffMultiplier: 1.25
    },
    batteryCapacityKwh: 150,
    soc: 21, // As requested in prompt: returns at 21%, starts charging from 21%
    arrivalSoc: 21,
    opStatus: 'Charging (Fast DC)',
    connectedToCharger: true,
    chargerBay: 1,
    chargeRateKw: 48,
    targetSoc: 100,
    route: null,
    currentCargo: null,
    totalDeliveriesCompleted: 14,
    currentCoords: { ...DEPOT_COORDS },
    motorTempC: 38.2
  },
  {
    id: 2,
    name: 'Truck-02',
    plate: 'EV-TRK-102',
    specialization: {
      serviceType: 'refrigerated-cryo',
      categoryLabel: 'Refrigerated Cryo-Chassis EV',
      badgeColor: 'text-cyan-800 bg-cyan-50 border-cyan-200',
      maxPayloadKg: 2200,
      specialEquipment: ['Multi-Zone Active Chiller', 'IoT Temp & Humidity Live Stream', 'Perishables Deep-Freeze Hold'],
      coldStorageTempC: '-18°C to +2°C',
      tariffMultiplier: 1.25
    },
    batteryCapacityKwh: 150,
    soc: 63, // As requested in prompt: returns at 63%, starts charging from 63%
    arrivalSoc: 63,
    opStatus: 'Charging (Fast DC)',
    connectedToCharger: true,
    chargerBay: 2,
    chargeRateKw: 52,
    targetSoc: 100,
    route: null,
    currentCargo: null,
    totalDeliveriesCompleted: 19,
    currentCoords: { ...DEPOT_COORDS },
    motorTempC: 36.5
  },
  {
    id: 3,
    name: 'Truck-03',
    plate: 'EV-TRK-103',
    specialization: {
      serviceType: 'heavy-duty-flatbed',
      categoryLabel: 'Heavy-Duty Flatbed Rig',
      badgeColor: 'text-amber-800 bg-amber-50 border-amber-200',
      maxPayloadKg: 3800,
      specialEquipment: ['Industrial Pallet Deck (3.8-ton)', 'Reinforced Triple-Leaf Suspension', 'High-Torque Dual Motor AWD'],
      tariffMultiplier: 1.20
    },
    batteryCapacityKwh: 150,
    soc: 78,
    arrivalSoc: 78,
    opStatus: 'Charging (Fast DC)',
    connectedToCharger: true,
    chargerBay: 3,
    chargeRateKw: 44,
    targetSoc: 100,
    route: null,
    currentCargo: null,
    totalDeliveriesCompleted: 22,
    currentCoords: { ...DEPOT_COORDS },
    motorTempC: 35.0
  },
  {
    id: 4,
    name: 'Truck-04',
    plate: 'EV-TRK-104',
    specialization: {
      serviceType: 'heavy-duty-flatbed',
      categoryLabel: 'Heavy-Duty Flatbed Rig',
      badgeColor: 'text-amber-800 bg-amber-50 border-amber-200',
      maxPayloadKg: 3800,
      specialEquipment: ['Heavy Machinery Anchor Points', 'Reinforced Steel Deck Frame', 'Torque-Vectoring Traction'],
      tariffMultiplier: 1.20
    },
    batteryCapacityKwh: 150,
    soc: 45,
    arrivalSoc: 45,
    opStatus: 'Charging (Fast DC)',
    connectedToCharger: true,
    chargerBay: 4,
    chargeRateKw: 50,
    targetSoc: 100,
    route: null,
    currentCargo: null,
    totalDeliveriesCompleted: 11,
    currentCoords: { ...DEPOT_COORDS },
    motorTempC: 37.1
  },
  {
    id: 5,
    name: 'Truck-05',
    plate: 'EV-TRK-105',
    specialization: {
      serviceType: 'express-sprinter',
      categoryLabel: 'Aerodynamic Rapid Sprinter',
      badgeColor: 'text-emerald-800 bg-emerald-50 border-emerald-200',
      maxPayloadKg: 1600,
      specialEquipment: ['Carbon Aero Composite Canopy', 'Priority Fast Route Telematics', 'High-Speed Courier Shelves'],
      tariffMultiplier: 1.18
    },
    batteryCapacityKwh: 150,
    soc: 85,
    arrivalSoc: 85,
    opStatus: 'Charging (Fast DC)',
    connectedToCharger: true,
    chargerBay: 5,
    chargeRateKw: 40,
    targetSoc: 100,
    route: null,
    currentCargo: null,
    totalDeliveriesCompleted: 17,
    currentCoords: { ...DEPOT_COORDS },
    motorTempC: 34.8
  },
  {
    id: 6,
    name: 'Truck-06',
    plate: 'EV-TRK-106',
    specialization: {
      serviceType: 'express-sprinter',
      categoryLabel: 'Aerodynamic Rapid Sprinter',
      badgeColor: 'text-emerald-800 bg-emerald-50 border-emerald-200',
      maxPayloadKg: 1600,
      specialEquipment: ['Sprint Aero Body Kit', 'Fast-Handoff Cargo Side Hatch', 'Same-Day Urban Telematics'],
      tariffMultiplier: 1.18
    },
    batteryCapacityKwh: 150,
    soc: 32,
    arrivalSoc: 32,
    opStatus: 'Queued for Charger', // 6th truck waiting in line as only 5 can charge at once!
    connectedToCharger: false,
    chargerBay: null,
    chargeRateKw: 0,
    targetSoc: 100,
    route: null,
    currentCargo: null,
    totalDeliveriesCompleted: 9,
    currentCoords: { ...DEPOT_COORDS },
    motorTempC: 41.0
  },
  {
    id: 7,
    name: 'Truck-07',
    plate: 'EV-TRK-107',
    specialization: {
      serviceType: 'air-ride-vault',
      categoryLabel: 'Air-Suspension Secure Vault',
      badgeColor: 'text-purple-800 bg-purple-50 border-purple-200',
      maxPayloadKg: 1900,
      specialEquipment: ['Pneumatic Active Air-Ride Suspension', 'Anti-Vibration Bedding Dampers', 'Class-1000 Clean Hold Enclosure'],
      tariffMultiplier: 1.22
    },
    batteryCapacityKwh: 150,
    soc: 100,
    arrivalSoc: null,
    opStatus: 'Available at Depot',
    connectedToCharger: false,
    chargerBay: null,
    chargeRateKw: 0,
    targetSoc: 100,
    route: null,
    currentCargo: null,
    totalDeliveriesCompleted: 25,
    currentCoords: { ...DEPOT_COORDS },
    motorTempC: 28.4
  },
  {
    id: 8,
    name: 'Truck-08',
    plate: 'EV-TRK-108',
    specialization: {
      serviceType: 'air-ride-vault',
      categoryLabel: 'Air-Suspension Secure Vault',
      badgeColor: 'text-purple-800 bg-purple-50 border-purple-200',
      maxPayloadKg: 1900,
      specialEquipment: ['Air-Ride Anti-Shock Decking', 'Tri-Axis G-Force Shock Logger', 'Climate Regulated Cleanroom Vault'],
      tariffMultiplier: 1.22
    },
    batteryCapacityKwh: 150,
    soc: 100,
    arrivalSoc: null,
    opStatus: 'Available at Depot',
    connectedToCharger: false,
    chargerBay: null,
    chargeRateKw: 0,
    targetSoc: 100,
    route: null,
    currentCargo: null,
    totalDeliveriesCompleted: 16,
    currentCoords: { ...DEPOT_COORDS },
    motorTempC: 27.9
  },
  {
    id: 9,
    name: 'Truck-09',
    plate: 'EV-TRK-109',
    specialization: {
      serviceType: 'standard-dry-van',
      categoryLabel: 'Modular Enclosed Dry Van',
      badgeColor: 'text-blue-800 bg-blue-50 border-blue-200',
      maxPayloadKg: 2600,
      specialEquipment: ['Weatherproof Enclosed Cargo Box', 'Foldable Loading Ramp', 'Universal Lashing Tracks'],
      tariffMultiplier: 1.00
    },
    batteryCapacityKwh: 150,
    soc: 94,
    arrivalSoc: null,
    opStatus: 'Available at Depot',
    connectedToCharger: false,
    chargerBay: null,
    chargeRateKw: 0,
    targetSoc: 100,
    route: null,
    currentCargo: null,
    totalDeliveriesCompleted: 21,
    currentCoords: { ...DEPOT_COORDS },
    motorTempC: 29.1
  },
  {
    id: 10,
    name: 'Truck-10',
    plate: 'EV-TRK-110',
    specialization: {
      serviceType: 'standard-dry-van',
      categoryLabel: 'Modular Enclosed Dry Van',
      badgeColor: 'text-blue-800 bg-blue-50 border-blue-200',
      maxPayloadKg: 2600,
      specialEquipment: ['Universal Cargo Deck Anchors', 'Dual Side Access Rollers', 'FMCG Retail Enclosure'],
      tariffMultiplier: 1.00
    },
    batteryCapacityKwh: 150,
    soc: 100,
    arrivalSoc: null,
    opStatus: 'Available at Depot',
    connectedToCharger: false,
    chargerBay: null,
    chargeRateKw: 0,
    targetSoc: 100,
    route: null,
    currentCargo: null,
    totalDeliveriesCompleted: 30,
    currentCoords: { ...DEPOT_COORDS },
    motorTempC: 26.8
  }
];

export const INITIAL_GRID_STATIONS: GridStation[] = [
  {
    id: 1,
    code: 'GS-01',
    name: 'Grid Station 01 (Northern Infeed)',
    purpose: 'Truck Charging (Fleet)',
    active: true,
    connectedFarmIds: [1, 2, 3],
    currentSolarInputKw: 0,
    bessCapacityKwh: 1500,
    bessStoredKwh: 980,
    bessSocPct: 65,
    activeLoadKw: 0,
    voltageV: 401.5,
    frequencyHz: 50.01,
    transformerTempC: 44.2,
    status: 'Online & Supplying'
  },
  {
    id: 2,
    code: 'GS-02',
    name: 'Grid Station 02 (Southern Infeed)',
    purpose: 'Truck Charging (Fleet)',
    active: true,
    connectedFarmIds: [4, 5, 6],
    currentSolarInputKw: 0,
    bessCapacityKwh: 1500,
    bessStoredKwh: 1120,
    bessSocPct: 74,
    activeLoadKw: 0,
    voltageV: 399.8,
    frequencyHz: 49.99,
    transformerTempC: 42.8,
    status: 'Online & Supplying'
  },
  {
    id: 3,
    code: 'GS-03',
    name: 'Grid Station 03 (Dedicated Battery Station)',
    purpose: 'Battery Pack Charging (Dedicated)',
    active: false, // Inactive by default, can be activated as requested in prompt!
    connectedFarmIds: [7, 8, 9],
    currentSolarInputKw: 0,
    bessCapacityKwh: 2000,
    bessStoredKwh: 1400,
    bessSocPct: 70,
    activeLoadKw: 0,
    voltageV: 400.0,
    frequencyHz: 50.00,
    transformerTempC: 31.5,
    status: 'Standby / Deactivated'
  }
];

export const INITIAL_SOLAR_FARMS: SolarFarm[] = [
  // 3 Farms connected to GS-01
  {
    id: 1,
    stationId: 1,
    name: 'Solar Farm 01 (North Ridge)',
    location: 'Ridge Valley Sector A',
    panels: 60,
    minPanels: 60,
    maxPanels: 120,
    panelWattageW: 400,
    trackerType: 'Fixed Tilt (30°)',
    currentOutputKw: 0,
    peakOutputKw: 0,
    efficiencyPct: 98.2,
    inverterStatus: 'Optimal',
    soilingLossPct: 1.5,
    temperatureC: 32.4
  },
  {
    id: 2,
    stationId: 1,
    name: 'Solar Farm 02 (Suncrest Array)',
    location: 'Ridge Valley Sector B',
    panels: 60,
    minPanels: 60,
    maxPanels: 120,
    panelWattageW: 400,
    trackerType: 'Single-Axis Tracker',
    currentOutputKw: 0,
    peakOutputKw: 0,
    efficiencyPct: 98.6,
    inverterStatus: 'Optimal',
    soilingLossPct: 1.8,
    temperatureC: 33.1
  },
  {
    id: 3,
    stationId: 1,
    name: 'Solar Farm 03 (Meridian Plains)',
    location: 'Ridge Valley Sector C',
    panels: 60,
    minPanels: 60,
    maxPanels: 120,
    panelWattageW: 400,
    trackerType: 'Dual-Axis Tracker',
    currentOutputKw: 0,
    peakOutputKw: 0,
    efficiencyPct: 99.1,
    inverterStatus: 'Optimal',
    soilingLossPct: 1.2,
    temperatureC: 31.8
  },

  // 3 Farms connected to GS-02
  {
    id: 4,
    stationId: 2,
    name: 'Solar Farm 04 (South Meadows)',
    location: 'South Valley Plot 1',
    panels: 60,
    minPanels: 60,
    maxPanels: 120,
    panelWattageW: 400,
    trackerType: 'Fixed Tilt (30°)',
    currentOutputKw: 0,
    peakOutputKw: 0,
    efficiencyPct: 98.0,
    inverterStatus: 'Optimal',
    soilingLossPct: 2.0,
    temperatureC: 34.0
  },
  {
    id: 5,
    stationId: 2,
    name: 'Solar Farm 05 (Helios Horizon)',
    location: 'South Valley Plot 2',
    panels: 60,
    minPanels: 60,
    maxPanels: 120,
    panelWattageW: 400,
    trackerType: 'Single-Axis Tracker',
    currentOutputKw: 0,
    peakOutputKw: 0,
    efficiencyPct: 98.7,
    inverterStatus: 'Optimal',
    soilingLossPct: 1.6,
    temperatureC: 33.5
  },
  {
    id: 6,
    stationId: 2,
    name: 'Solar Farm 06 (Delta Solar Basin)',
    location: 'South Valley Plot 3',
    panels: 60,
    minPanels: 60,
    maxPanels: 120,
    panelWattageW: 400,
    trackerType: 'Dual-Axis Tracker',
    currentOutputKw: 0,
    peakOutputKw: 0,
    efficiencyPct: 99.0,
    inverterStatus: 'Optimal',
    soilingLossPct: 1.3,
    temperatureC: 32.7
  },

  // 3 Farms connected to GS-03 (Activated when GS-03 is turned ON)
  {
    id: 7,
    stationId: 3,
    name: 'Solar Farm 07 (Battery Dedicated Array 1)',
    location: 'Eastern Substation Sector 1',
    panels: 60,
    minPanels: 60,
    maxPanels: 120,
    panelWattageW: 400,
    trackerType: 'Single-Axis Tracker',
    currentOutputKw: 0,
    peakOutputKw: 0,
    efficiencyPct: 98.8,
    inverterStatus: 'Standby',
    soilingLossPct: 1.4,
    temperatureC: 29.5
  },
  {
    id: 8,
    stationId: 3,
    name: 'Solar Farm 08 (Battery Dedicated Array 2)',
    location: 'Eastern Substation Sector 2',
    panels: 60,
    minPanels: 60,
    maxPanels: 120,
    panelWattageW: 400,
    trackerType: 'Dual-Axis Tracker',
    currentOutputKw: 0,
    peakOutputKw: 0,
    efficiencyPct: 99.2,
    inverterStatus: 'Standby',
    soilingLossPct: 1.1,
    temperatureC: 29.1
  },
  {
    id: 9,
    stationId: 3,
    name: 'Solar Farm 09 (Battery Dedicated Array 3)',
    location: 'Eastern Substation Sector 3',
    panels: 60,
    minPanels: 60,
    maxPanels: 120,
    panelWattageW: 400,
    trackerType: 'Fixed Tilt (30°)',
    currentOutputKw: 0,
    peakOutputKw: 0,
    efficiencyPct: 98.3,
    inverterStatus: 'Standby',
    soilingLossPct: 1.7,
    temperatureC: 30.0
  }
];

export const INITIAL_BATTERY_PACKS: BatteryPack[] = Array.from({ length: 15 }, (_, i) => {
  const id = i + 1;
  const isReady = id <= 9; // 9 ready packs, rest can charge
  const soc = isReady ? 100 : 45 + ((id * 9) % 45);
  return {
    id,
    name: `Pack-${String(id).padStart(2, '0')}`,
    capacityKwh: 35,
    soc,
    charging: !isReady,
    chargeRateKw: !isReady ? 9.5 : 0,
    status: isReady ? 'Ready (100%)' : 'Charging (GS-03)',
    healthPct: 99 - (id % 4),
    cycles: 120 + id * 14
  };
});

export const INITIAL_SUPER_BATTERY: SuperBattery = {
  name: 'Super High-Capacity BESS Unit (Omega-6000)',
  capacityKwh: 6000, // Super high capacity as requested
  storedKwh: 4250,
  soc: 70.8,
  maxChargeRateKw: 350,
  maxDischargeRateKw: 500,
  isCharging: false,
  isDischarging: false,
  activeNightSupply: false,
  lockReason: null,
  powerFlowKw: 0
};

export const INITIAL_WEATHER: WeatherState = {
  type: 'Clear / Sunny',
  cloudCoverPct: 10,
  ambientTempC: 28.5,
  humidityPct: 42,
  irradianceWm2: 850
};

export const EXTRA_SERVICES_CATALOG: ExtraServiceOption[] = [
  {
    id: 'hydraulic_liftgate',
    name: 'Automated Hydraulic Liftgate',
    description: 'Heavy-duty 2.5-ton powered tailgate lift platform for dockless ground-level loading and pallet transfer.',
    surchargeAmount: 850,
    surchargeType: 'flat',
    iconTag: '🏗️'
  },
  {
    id: 'iot_telemetry',
    name: 'IoT Multi-Sensor Datalogger',
    description: 'Live NIST-calibrated continuous digital streaming of ambient temperature, humidity, tilt, and shock G-forces.',
    surchargeAmount: 450,
    surchargeType: 'flat',
    iconTag: '📡'
  },
  {
    id: 'white_glove',
    name: 'White-Glove Inside Delivery',
    description: 'Two-person certified logistics team providing inside-building carriage, direct shelf placement, and packaging disposal.',
    surchargeAmount: 950,
    surchargeType: 'flat',
    iconTag: '🧤'
  },
  {
    id: 'hazmat_containment',
    name: 'Hazmat Spill Safety Escort',
    description: 'Certified regulatory containment secondary barriers, spill neutralizing kit, and certified hazmat manifest handling.',
    surchargeAmount: 1600,
    surchargeType: 'flat',
    iconTag: '☣️'
  },
  {
    id: 'transit_insurance',
    name: 'Comprehensive Cargo Insurance',
    description: 'Full ₹25 Lakh transit indemnification policy with cryptographic tamper-evident electronic seals.',
    surchargeAmount: 1200,
    surchargeType: 'flat',
    iconTag: '🛡️'
  },
  // Legacy aliases
  {
    id: 'cold_logistics',
    name: 'IoT Multi-Sensor Datalogger (Legacy)',
    description: 'Active environmental sensor tracking telemetry.',
    surchargeAmount: 450,
    surchargeType: 'flat'
  },
  {
    id: 'tailgate_hydraulic',
    name: 'Automated Hydraulic Liftgate (Legacy)',
    description: 'Ground-level hydraulic tailgate platform.',
    surchargeAmount: 850,
    surchargeType: 'flat'
  },
  {
    id: 'fragile_care',
    name: 'Comprehensive Cargo Insurance (Legacy)',
    description: 'Transit risk coverage with tamper seals.',
    surchargeAmount: 1200,
    surchargeType: 'flat'
  },
  {
    id: 'express_sprint',
    name: 'White-Glove Inside Delivery (Legacy)',
    description: 'Inside delivery and direct placement.',
    surchargeAmount: 950,
    surchargeType: 'flat'
  }
];

export const INITIAL_ORDERS: MerchantOrder[] = [
  {
    id: 'ORD-8101',
    source: 'chatbox',
    merchantName: 'BioHealth Pharma Laboratories',
    originPointId: 2,
    originPointName: 'North Logistics Cargo Terminal (DP-02)',
    destinationPointId: 11,
    destinationPointName: 'East Cold Storage Logistics Hub (DP-11)',
    deliveries: [
      {
        stopIndex: 0,
        deliveryPointId: 11,
        deliveryPointName: 'East Cold Storage Logistics Hub (DP-11)',
        cargoWeightKg: 850,
        boxCount: 17,
        distanceFromPrevKm: 24.8,
        status: 'pending'
      }
    ],
    totalWeightKg: 850,
    totalBoxes: 17,
    weightKg: 850,
    boxCount: 17,
    scheduledPickupTimeHours: 14.5, // 14:30
    calculatedDispatchTimeHours: 14.28, // Leaves depot early (~13 min before) to arrive at 14:30
    transitMinutesFromBay: 13,
    requiredService: 'refrigerated-cryo',
    extraServices: ['iot_telemetry'],
    pricing: {
      distanceKm: 24.8,
      perKmRate: 30.0,
      perKgRate: 4.5,
      baseDistanceFare: 744.0,
      weightFare: 3825.0,
      extraServicesFare: 450.0,
      subtotal: 5019.0,
      gstRatePct: 18,
      gstAmount: 903.42,
      totalAmount: 5922.42,
      stopBreakdown: [
        {
          stopIndex: 0,
          pointId: 11,
          pointName: 'East Cold Storage Logistics Hub (DP-11)',
          weightKg: 850,
          legDistanceKm: 24.8,
          weightFare: 3825.0,
          distanceFare: 744.0,
          stopSubtotal: 4569.0
        }
      ]
    },
    status: 'scheduled',
    assignedTruckId: 1,
    createdAtTimestamp: 'Today, 11:20 AM',
    specialInstructions: 'Critical vaccine coolers. Maintain active refrigeration below -15°C throughout transit.'
  },
  {
    id: 'ORD-8102',
    source: 'manual',
    merchantName: 'Apex Precision Heavy Engineering',
    originPointId: 3,
    originPointName: 'West Auto Ancillary Cluster (DP-03)',
    destinationPointId: 14,
    destinationPointName: 'South Industrial Engineering Park (DP-14)',
    deliveries: [
      {
        stopIndex: 0,
        deliveryPointId: 5,
        deliveryPointName: 'Airport Cargo Terminal (DP-05)',
        cargoWeightKg: 1200,
        boxCount: 2,
        distanceFromPrevKm: 14.2,
        status: 'pending'
      },
      {
        stopIndex: 1,
        deliveryPointId: 14,
        deliveryPointName: 'South Industrial Engineering Park (DP-14)',
        cargoWeightKg: 1600,
        boxCount: 2,
        distanceFromPrevKm: 14.4,
        status: 'pending'
      }
    ],
    totalWeightKg: 2800,
    totalBoxes: 4,
    weightKg: 2800,
    boxCount: 4,
    scheduledPickupTimeHours: 16.0, // 16:00
    calculatedDispatchTimeHours: 15.75, // Leaves ~15 min early
    transitMinutesFromBay: 15,
    requiredService: 'heavy-duty-flatbed',
    extraServices: ['hydraulic_liftgate'],
    pricing: {
      distanceKm: 28.6,
      perKmRate: 28.8,
      perKgRate: 4.5,
      baseDistanceFare: 823.68,
      weightFare: 12600.0,
      extraServicesFare: 850.0,
      subtotal: 14273.68,
      gstRatePct: 18,
      gstAmount: 2569.26,
      totalAmount: 16842.94,
      stopBreakdown: [
        {
          stopIndex: 0,
          pointId: 5,
          pointName: 'Airport Cargo Terminal (DP-05)',
          weightKg: 1200,
          legDistanceKm: 14.2,
          weightFare: 5400.0,
          distanceFare: 408.96,
          stopSubtotal: 5808.96
        },
        {
          stopIndex: 1,
          pointId: 14,
          pointName: 'South Industrial Engineering Park (DP-14)',
          weightKg: 1600,
          legDistanceKm: 14.4,
          weightFare: 7200.0,
          distanceFare: 414.72,
          stopSubtotal: 7614.72
        }
      ]
    },
    status: 'scheduled',
    assignedTruckId: 3,
    createdAtTimestamp: 'Today, 12:45 PM',
    specialInstructions: 'Steel gearbox castings. Requires hydraulic liftgate for dockless offload.'
  },
  {
    id: 'ORD-8103',
    source: 'chatbox',
    merchantName: 'Photonix Semiconductor Systems',
    originPointId: 7,
    originPointName: 'East Tech Park Fulfillment (DP-07)',
    destinationPointId: 8,
    destinationPointName: 'Silicon Valley Research Campus (DP-08)',
    deliveries: [
      {
        stopIndex: 0,
        deliveryPointId: 8,
        deliveryPointName: 'Silicon Valley Research Campus (DP-08)',
        cargoWeightKg: 420,
        boxCount: 14,
        distanceFromPrevKm: 16.4,
        status: 'pending'
      }
    ],
    totalWeightKg: 420,
    totalBoxes: 14,
    weightKg: 420,
    boxCount: 14,
    scheduledPickupTimeHours: 17.1, // 17:06
    calculatedDispatchTimeHours: 16.85, // Leaves 16:51 to arrive at 17:06
    transitMinutesFromBay: 15,
    requiredService: 'air-ride-vault',
    extraServices: ['transit_insurance'],
    pricing: {
      distanceKm: 16.4,
      perKmRate: 29.28,
      perKgRate: 4.5,
      baseDistanceFare: 480.19,
      weightFare: 1890.0,
      extraServicesFare: 1200.0,
      subtotal: 3570.19,
      gstRatePct: 18,
      gstAmount: 642.63,
      totalAmount: 4212.82,
      stopBreakdown: [
        {
          stopIndex: 0,
          pointId: 8,
          pointName: 'Silicon Valley Research Campus (DP-08)',
          weightKg: 420,
          legDistanceKm: 16.4,
          weightFare: 1890.0,
          distanceFare: 480.19,
          stopSubtotal: 2370.19
        }
      ]
    },
    status: 'scheduled',
    assignedTruckId: 7,
    createdAtTimestamp: 'Today, 01:15 PM',
    specialInstructions: 'Wafer lithography cassettes. Air-ride suspension and sealed cargo hold required.'
  }
];
