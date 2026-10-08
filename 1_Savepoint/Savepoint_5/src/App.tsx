import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Header } from './components/Header';
import { OverviewDashboard } from './components/OverviewDashboard';
import { SolarGridRoom } from './components/SolarGridRoom';
import { FleetLogisticsRoom } from './components/FleetLogisticsRoom';
import { BatteryStationRoom } from './components/BatteryStationRoom';
import { LogisticsMap } from './components/LogisticsMap';
import { ActivityLog } from './components/ActivityLog';
import { TileDetailModal } from './components/TileDetailModal';

import {
  ViewTab,
  WeatherType,
  WeatherState,
  GridStation,
  SolarFarm,
  Truck,
  TruckOpStatus,
  DeliveryPoint,
  BatteryPack,
  SuperBattery,
  OperationalLog,
  DetailModalContent
} from './types';

import {
  INITIAL_DELIVERY_POINTS,
  INITIAL_TRUCKS,
  INITIAL_GRID_STATIONS,
  INITIAL_SOLAR_FARMS,
  INITIAL_BATTERY_PACKS,
  INITIAL_SUPER_BATTERY,
  INITIAL_WEATHER,
  DEPOT_COORDS
} from './data/initialState';

import {
  clamp,
  formatTime,
  isNightTime,
  calculateFarmOutput,
  calculateDistanceKm,
  calculateLegEnergyConsumption
} from './utils/solarPhysics';

import { BOX_TYPES, generateRouteLegs } from './data/cargoBoxes';

export default function App() {
  // Navigation
  const [currentTab, setCurrentTab] = useState<ViewTab>('overview');

  // Simulation Clock & Speed
  const [simHours, setSimHours] = useState<number>(9.5); // 09:30 AM
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(5);
  const [isPaused, setIsPaused] = useState<boolean>(false);

  // Weather
  const [weather, setWeather] = useState<WeatherState>(INITIAL_WEATHER);

  // Domain State
  const [stations, setStations] = useState<GridStation[]>(INITIAL_GRID_STATIONS);
  const [farms, setFarms] = useState<SolarFarm[]>(INITIAL_SOLAR_FARMS);
  const [trucks, setTrucks] = useState<Truck[]>(INITIAL_TRUCKS);
  const [deliveryPoints] = useState<DeliveryPoint[]>(INITIAL_DELIVERY_POINTS);
  const [packs, setPacks] = useState<BatteryPack[]>(INITIAL_BATTERY_PACKS);
  const [superBattery, setSuperBattery] = useState<SuperBattery>(INITIAL_SUPER_BATTERY);

  // Telemetry Logs
  const [logs, setLogs] = useState<OperationalLog[]>([
    {
      id: 'log-0',
      timestamp: '09:30',
      category: 'system',
      severity: 'info',
      message: 'SCADA platform online. 2 Grid Stations active for fleet, GS-03 on standby for batteries, 10 EV trucks ready.'
    },
    {
      id: 'log-1',
      timestamp: '09:30',
      category: 'fleet',
      severity: 'success',
      message: 'Fleet charging bays active: 5 of 5 bays loaded. Truck-06 placed in charger waiting queue.'
    }
  ]);

  // Telemetry Inspector Modal
  const [activeModal, setActiveModal] = useState<DetailModalContent | null>(null);

  const addLog = useCallback((category: OperationalLog['category'], severity: OperationalLog['severity'], message: string) => {
    setLogs((prev) => [
      {
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: formatTime(simHours),
        category,
        severity,
        message
      },
      ...prev.slice(0, 49)
    ]);
  }, [simHours]);

  const isNight = isNightTime(simHours);

  // Toggle Grid Station 03 (Dedicated to Batteries)
  const handleToggleGrid3 = useCallback(() => {
    setStations((prev) =>
      prev.map((s) => {
        if (s.id === 3) {
          const nextState = !s.active;
          addLog(
            'grid',
            nextState ? 'success' : 'warning',
            nextState
              ? 'Grid Station 03 activated! Dedicated power channel online for 15 battery swap packs.'
              : 'Grid Station 03 deactivated (Standby mode). Battery swap rack on local buffer.'
          );
          return {
            ...s,
            active: nextState,
            status: nextState ? 'Online & Supplying' : 'Standby / Deactivated'
          };
        }
        return s;
      })
    );
  }, [addLog]);

  // Adjust Solar Farm panel count (60 to 120 panels)
  const handleUpdateFarmPanels = useCallback((farmId: number, newPanels: number) => {
    const clampedPanels = clamp(newPanels, 60, 120);
    setFarms((prev) =>
      prev.map((f) => {
        if (f.id === farmId) {
          addLog(
            'solar',
            'info',
            `${f.name} array capacity adjusted to ${clampedPanels} panels (${((clampedPanels * f.panelWattageW) / 1000).toFixed(1)} kWp).`
          );
          return { ...f, panels: clampedPanels };
        }
        return f;
      })
    );
  }, [addLog]);

  // Weather Preset Change
  const handleWeatherChange = useCallback((type: WeatherType) => {
    let cloud = 10;
    let temp = 28;
    let hum = 40;
    let irr = 850;

    switch (type) {
      case 'Clear / Sunny':
        cloud = 5;
        temp = 30;
        hum = 35;
        irr = 950;
        break;
      case 'Scattered Clouds':
        cloud = 40;
        temp = 26;
        hum = 55;
        irr = 620;
        break;
      case 'Overcast':
        cloud = 85;
        temp = 22;
        hum = 75;
        irr = 280;
        break;
      case 'Thunderstorm':
        cloud = 95;
        temp = 19;
        hum = 90;
        irr = 110;
        break;
      case 'Extreme Heat':
        cloud = 0;
        temp = 42;
        hum = 18;
        irr = 1020;
        break;
    }

    setWeather({
      type,
      cloudCoverPct: cloud,
      ambientTempC: temp,
      humidityPct: hum,
      irradianceWm2: irr
    });

    addLog('system', 'info', `Atmospheric weather preset set to: ${type}. Ambient temperature: ${temp}°C, clouds: ${cloud}%.`);
  }, [addLog]);

  // Dispatch a Truck on a multi-stop route
  const handleDispatchTruck = useCallback((
    truckId: number,
    pickupId: number,
    deliveryIds: number[],
    boxTypeId: string = 'industrial',
    boxCount: number = 40
  ) => {
    const truck = trucks.find((t) => t.id === truckId);
    if (!truck) return;

    // Dispatched truck disconnects and charges 0 kW
    const wasCharging = truck.opStatus === 'Charging (Fast DC)';
    const freedBay = truck.chargerBay;

    const pickupPoint = deliveryPoints.find((dp) => dp.id === pickupId) || deliveryPoints[0];
    const deliveryPointsList = deliveryIds
      .map((did) => deliveryPoints.find((dp) => dp.id === did))
      .filter(Boolean) as DeliveryPoint[];

    const selectedBoxConfig = BOX_TYPES.find((b) => b.id === boxTypeId) || BOX_TYPES[0];
    const count = boxCount || 40;

    const plan = generateRouteLegs(
      DEPOT_COORDS,
      pickupPoint,
      deliveryPointsList,
      selectedBoxConfig,
      count
    );

    // Calculate energy consumption for the entire route
    let totalMissionKwh = 0;
    plan.legs.forEach((leg) => {
      const { kwh } = calculateLegEnergyConsumption(leg.distanceKm, leg.cargoWeightKg);
      totalMissionKwh += kwh;
    });

    const totalSocDrop = (totalMissionKwh / truck.batteryCapacityKwh) * 100;
    const estReturn = Math.max(5, Number((truck.soc - totalSocDrop).toFixed(1)));

    const stops = [
      { pointId: pickupId, type: 'pickup' as const, label: `Pickup at ${pickupPoint.code}`, completed: false },
      ...deliveryPointsList.map((dp, i) => ({
        pointId: dp.id,
        type: 'delivery' as const,
        label: `Delivery ${i + 1} at ${dp.code}`,
        completed: false
      }))
    ];

    setTrucks((prev) => {
      let updated = prev.map((t) => {
        if (t.id === truckId) {
          return {
            ...t,
            opStatus: 'Dispatched - En Route' as const,
            connectedToCharger: false, // Dispatched trucks reflect as disconnected (0 kW)
            chargerBay: null,
            chargeRateKw: 0,
            arrivalSoc: null,
            currentCargo: `${count} boxes (${plan.totalInitialWeightKg.toLocaleString()} kg)`,
            route: {
              pickupId,
              deliveryIds,
              legs: plan.legs,
              currentLegIndex: 0,
              legProgressPct: 0,
              totalDistanceKm: plan.totalDistanceKm,
              distanceCompletedKm: 0,
              departureSoc: t.soc,
              estimatedReturnSoc: estReturn,
              cargoDetails: {
                boxTypeId: selectedBoxConfig.id,
                boxTypeName: selectedBoxConfig.name,
                unitWeightKg: selectedBoxConfig.unitWeightKg,
                initialBoxes: count,
                totalWeightKg: plan.totalInitialWeightKg
              },
              stops,
              currentStopIndex: 0
            }
          };
        }
        return t;
      });

      // If a bay was freed by this dispatched truck, promote the first queued truck!
      if (wasCharging && freedBay !== null) {
        const queuedTruck = updated.find((t) => t.opStatus === 'Queued for Charger');
        if (queuedTruck) {
          updated = updated.map((t) => {
            if (t.id === queuedTruck.id) {
              return {
                ...t,
                opStatus: 'Charging (Fast DC)' as const,
                connectedToCharger: true,
                chargerBay: freedBay,
                chargeRateKw: 48,
                arrivalSoc: t.soc // Starts charging from its exact current power!
              };
            }
            return t;
          });
          addLog(
            'fleet',
            'success',
            `Bay #${freedBay} freed up by dispatch! ${queuedTruck.name} promoted from queue to charge from ${queuedTruck.soc.toFixed(0)}% to 100%.`
          );
        }
      }

      return updated;
    });

    addLog(
      'dispatch',
      'info',
      `${truck.name} (${truck.plate}) dispatched! Route: Depot → ${pickupPoint.code} → ${deliveryPointsList.map((d) => d.code).join(' → ')} → Depot. Total: ${plan.totalDistanceKm} km · Cargo: ${count} boxes (${plan.totalInitialWeightKg.toLocaleString()} kg).`
    );
  }, [trucks, deliveryPoints, addLog]);

  // Instant Return Truck to Depot (Simulate Route Completion)
  const handleInstantReturnTruck = useCallback((truckId: number) => {
    setTrucks((prev) => {
      const targetTruck = prev.find((t) => t.id === truckId);
      if (!targetTruck || !targetTruck.route) return prev;

      // Realistic return power calculation (e.g. 21% or 63% as requested)
      const calculatedReturnSoc = clamp(targetTruck.route.estimatedReturnSoc + (Math.random() * 4 - 2), 12, 85);
      const activeChargersCount = prev.filter((t) => t.opStatus === 'Charging (Fast DC)').length;

      let nextStatus: TruckOpStatus = 'Queued for Charger';
      let nextConnected = false;
      let nextBay: number | null = null;
      let nextRate = 0;

      // If less than 5 trucks are charging, allocate a free bay (1 to 5)
      if (activeChargersCount < 5) {
        const occupiedBays = prev.map((t) => t.chargerBay).filter(Boolean);
        const freeBay = [1, 2, 3, 4, 5].find((b) => !occupiedBays.includes(b)) || (activeChargersCount + 1);
        nextStatus = 'Charging (Fast DC)';
        nextConnected = true;
        nextBay = freeBay;
        nextRate = 48;

        addLog(
          'fleet',
          'success',
          `${targetTruck.name} returned to Depot at ${calculatedReturnSoc.toFixed(0)}%! Allocated Bay #${freeBay}. Charging starts from ${calculatedReturnSoc.toFixed(0)}% to 100%.`
        );
      } else {
        addLog(
          'fleet',
          'warning',
          `${targetTruck.name} returned to Depot at ${calculatedReturnSoc.toFixed(0)}%! Max 5 charging bays full. Truck placed in queue.`
        );
      }

      return prev.map((t) => {
        if (t.id === truckId) {
          return {
            ...t,
            soc: calculatedReturnSoc,
            arrivalSoc: calculatedReturnSoc, // Preserves exact arrival percentage for charging start!
            opStatus: nextStatus,
            connectedToCharger: nextConnected,
            chargerBay: nextBay,
            chargeRateKw: nextRate,
            currentCargo: null,
            route: null,
            totalDeliveriesCompleted: t.totalDeliveriesCompleted + (targetTruck.route?.deliveryIds.length || 2),
            currentCoords: { ...DEPOT_COORDS }
          };
        }
        return t;
      });
    });
  }, [addLog]);

  // Battery Swap Action
  const handlePerformSwap = useCallback((truckId: number) => {
    const readyPack = packs.find((p) => p.soc >= 99);
    const truck = trucks.find((t) => t.id === truckId);

    if (!readyPack || !truck) {
      alert('Cannot perform swap: A ready 100% battery pack is required.');
      return;
    }

    if (truck.opStatus.startsWith('En Route')) {
      alert('Cannot perform swap while truck is en route. Truck must be at Central Depot.');
      return;
    }

    const oldSoc = truck.soc;
    const requiredEnergyKwh = 35; // 1 modular pack capacity

    // Rule 5: Night swap draws from Super Battery first!
    let drawnFromSuper = false;
    let superExhausted = false;

    if (isNight) {
      if (superBattery.storedKwh >= requiredEnergyKwh) {
        drawnFromSuper = true;
        setSuperBattery((prev) => {
          const newStored = Math.max(0, prev.storedKwh - requiredEnergyKwh);
          return {
            ...prev,
            storedKwh: newStored,
            soc: (newStored / prev.capacityKwh) * 100
          };
        });
      } else {
        superExhausted = true;
        // Remaining energy pulled from GS-03 grid station
        setSuperBattery((prev) => ({
          ...prev,
          storedKwh: 0,
          soc: 0
        }));
      }
    }

    // Update the pack: old battery goes into rack to charge
    setPacks((prev) =>
      prev.map((p) => {
        if (p.id === readyPack.id) {
          return {
            ...p,
            soc: oldSoc,
            charging: true,
            status: 'Charging (GS-03)' as const,
            cycles: p.cycles + 1
          };
        }
        return p;
      })
    );

    // Update truck to 100%
    setTrucks((prev) =>
      prev.map((t) => {
        if (t.id === truckId) {
          return {
            ...t,
            soc: 100,
            arrivalSoc: null,
            opStatus: 'Available at Depot' as const,
            connectedToCharger: false,
            chargerBay: null,
            chargeRateKw: 0
          };
        }
        return t;
      })
    );

    if (isNight) {
      if (drawnFromSuper) {
        addLog(
          'battery',
          'success',
          `Night Battery Swap: ${truck.name} received 100% pack! 35 kWh drawn directly from Super Battery (0 kW from Grid Station). Old ${oldSoc.toFixed(0)}% pack placed on recharge rack.`
        );
      } else {
        addLog(
          'battery',
          'warning',
          `Super Battery exhausted (0 kWh)! Night Battery Swap for ${truck.name} fell back to GS-03 Grid Station power.`
        );
      }
    } else {
      addLog(
        'battery',
        'success',
        `Daytime Battery Swap: ${truck.name} received 100% pack! Old ${oldSoc.toFixed(0)}% pack placed on GS-03 recharge rack.`
      );
    }
  }, [packs, trucks, isNight, superBattery.storedKwh, addLog]);

  // Toggle individual pack charging
  const handleTogglePackCharging = useCallback((packId: number) => {
    setPacks((prev) => {
      const target = prev.find((p) => p.id === packId);
      if (!target || target.soc >= 100) return prev;
      const nextCharging = !target.charging;

      if (nextCharging) {
        // Ensure GS-03 is active so charging actually proceeds
        setStations((prevStations) =>
          prevStations.map((s) => (s.id === 3 ? { ...s, active: true, status: 'Online & Supplying' as const } : s))
        );
        addLog(
          'battery',
          'info',
          `${target.name} charging started (+9.5 kW via GS-03).`
        );
      } else {
        addLog('battery', 'info', `${target.name} charging paused.`);
      }

      return prev.map((p) =>
        p.id === packId
          ? {
              ...p,
              charging: nextCharging,
              status: nextCharging ? ('Charging (GS-03)' as const) : ('Idle / Stored' as const)
            }
          : p
      );
    });
  }, [addLog]);

  // Plug in a truck to an available charging bay (or waiting queue if 5 active)
  const handlePlugInTruck = useCallback((truckId: number) => {
    setTrucks((prev) => {
      const truck = prev.find((t) => t.id === truckId);
      if (!truck || truck.opStatus === 'Charging (Fast DC)' || truck.opStatus.startsWith('En Route')) {
        return prev;
      }

      const currentlyCharging = prev.filter((t) => t.opStatus === 'Charging (Fast DC)');
      const occupiedBays = currentlyCharging.map((t) => t.chargerBay).filter(Boolean) as number[];
      const availableBays = [1, 2, 3, 4, 5].filter((b) => !occupiedBays.includes(b));

      if (availableBays.length > 0) {
        const bay = availableBays[0];
        addLog(
          'fleet',
          'success',
          `${truck.name} plugged into Charger Bay #${bay}! Charging started from ${truck.soc.toFixed(0)}% to 100%.`
        );
        return prev.map((t) =>
          t.id === truckId
            ? {
                ...t,
                opStatus: 'Charging (Fast DC)' as const,
                connectedToCharger: true,
                chargerBay: bay,
                chargeRateKw: 48,
                arrivalSoc: t.arrivalSoc ?? t.soc
              }
            : t
        );
      } else {
        addLog(
          'fleet',
          'info',
          `All 5 charging bays occupied. ${truck.name} placed in waiting queue. Will auto-connect once a bay frees up.`
        );
        return prev.map((t) =>
          t.id === truckId
            ? {
                ...t,
                opStatus: 'Queued for Charger' as const,
                connectedToCharger: false,
                chargerBay: null,
                chargeRateKw: 0,
                arrivalSoc: t.arrivalSoc ?? t.soc
              }
            : t
        );
      }
    });
  }, [addLog]);

  // Complete charge on a truck immediately (simulates 100% full, frees bay, promotes next queued truck)
  const handleCompleteChargeTruck = useCallback((truckId: number) => {
    setTrucks((prev) => {
      const truck = prev.find((t) => t.id === truckId);
      if (!truck) return prev;
      const freedBay = truck.chargerBay;

      addLog(
        'fleet',
        'success',
        `${truck.name} reached 100% full charge! ${freedBay ? `Bay #${freedBay} freed up.` : ''}`
      );

      let updated = prev.map((t) =>
        t.id === truckId
          ? {
              ...t,
              soc: 100,
              opStatus: 'Available at Depot' as const,
              connectedToCharger: false,
              chargerBay: null,
              chargeRateKw: 0
            }
          : t
      );

      if (freedBay) {
        const nextQueued = updated.find((t) => t.opStatus === 'Queued for Charger');
        if (nextQueued) {
          addLog(
            'fleet',
            'success',
            `Queue handoff: ${nextQueued.name} allocated Charger Bay #${freedBay}! Charging starts from ${nextQueued.soc.toFixed(0)}% to 100%.`
          );
          updated = updated.map((t) =>
            t.id === nextQueued.id
              ? {
                  ...t,
                  opStatus: 'Charging (Fast DC)' as const,
                  connectedToCharger: true,
                  chargerBay: freedBay,
                  chargeRateKw: 48,
                  arrivalSoc: t.arrivalSoc ?? t.soc
                }
              : t
          );
        }
      }

      return updated;
    });
  }, [addLog]);

  // Fast charge a battery pack to 100%
  const handleFastChargePack = useCallback((packId: number) => {
    setPacks((prev) =>
      prev.map((p) => {
        if (p.id === packId) {
          addLog('battery', 'success', `${p.name} reached 100% full charge! Available for instant vehicle swaps.`);
          return {
            ...p,
            soc: 100,
            charging: false,
            status: 'Ready (100%)' as const
          };
        }
        return p;
      })
    );
  }, [addLog]);

  // Batch activate charging for all packs with soc < 100
  const handleActivateAllPacksCharging = useCallback(() => {
    setStations((prev) =>
      prev.map((s) => (s.id === 3 ? { ...s, active: true, status: 'Online & Supplying' as const } : s))
    );

    setPacks((prev) =>
      prev.map((p) => {
        if (p.soc < 99.5) {
          return {
            ...p,
            charging: true,
            status: 'Charging (GS-03)' as const
          };
        }
        return p;
      })
    );

    addLog(
      'battery',
      'info',
      'Grid Station 03 online: All battery swap packs under 100% switched to active charging.'
    );
  }, [addLog]);

  // Synchronized state refs for unhindered 1-second simulation clock
  const packsRef = useRef(packs);
  packsRef.current = packs;

  const stationsRef = useRef(stations);
  stationsRef.current = stations;

  const deliveryPointsRef = useRef(deliveryPoints);
  deliveryPointsRef.current = deliveryPoints;

  const weatherRef = useRef(weather);
  weatherRef.current = weather;

  // Main SCADA Simulation Loop
  useEffect(() => {
    if (isPaused) return;

    const interval = setInterval(() => {
      // 1. Advance simulation time
      const deltaHours = (speedMultiplier / 60) * 0.2;
      setSimHours((prev) => (prev + deltaHours) % 24);

      const currentWeather = weatherRef.current;
      const currentStations = stationsRef.current;
      const currentDPs = deliveryPointsRef.current;

      // 2. Compute Solar Farm outputs
      setFarms((prevFarms) =>
        prevFarms.map((farm) => {
          const station = currentStations.find((s) => s.id === farm.stationId);
          if (station && !station.active) {
            return { ...farm, currentOutputKw: 0, inverterStatus: 'Standby' };
          }
          const output = calculateFarmOutput(farm, simHours, currentWeather);
          return {
            ...farm,
            currentOutputKw: output,
            peakOutputKw: Math.max(farm.peakOutputKw, output),
            inverterStatus: output > 30 ? 'High-Load' : 'Optimal'
          };
        })
      );

      // 3. Update Grid Stations solar inputs
      setStations((prevStations) =>
        prevStations.map((station) => {
          if (!station.active) {
            return { ...station, currentSolarInputKw: 0, activeLoadKw: 0 };
          }
          return {
            ...station,
            voltageV: 400 + (Math.random() - 0.5) * 2,
            frequencyHz: 50.0 + (Math.random() - 0.5) * 0.04
          };
        })
      );

      // 4. Progress Trucks En Route & Manage Charging Bays
      setTrucks((prevTrucks) => {
        // A. Move trucks en route along explicit sequential legs
        let updated = prevTrucks.map((truck) => {
          if (!truck.route || truck.opStatus === 'Available at Depot' || truck.opStatus === 'Charging (Fast DC)' || truck.opStatus === 'Queued for Charger') {
            return truck;
          }

          const route = truck.route;
          if (!route.legs || route.legs.length === 0) {
            return truck;
          }

          const currentLeg = route.legs[route.currentLegIndex];
          if (!currentLeg) {
            return truck;
          }

          // Progress calculation: smooth interpolation based on speed multiplier and leg distance
          const speedFactor = speedMultiplier / 5;
          const legDist = Math.max(1.5, currentLeg.distanceKm);
          const progressStep = (speedFactor * 13) / legDist;
          const newLegProgress = Math.min(100, route.legProgressPct + progressStep);
          const deltaProgress = newLegProgress - route.legProgressPct;

          // Accurate physics-based battery depletion:
          // Traversed distance in this tick
          const deltaDistanceKm = currentLeg.distanceKm * (deltaProgress / 100);
          const { kwh } = calculateLegEnergyConsumption(deltaDistanceKm, currentLeg.cargoWeightKg);
          const deltaSoc = (kwh / truck.batteryCapacityKwh) * 100;
          const newSoc = clamp(truck.soc - deltaSoc, 5, 100);

          // Interpolates strictly between currentLeg.fromCoords and currentLeg.toCoords:
          const fromC = currentLeg.fromCoords;
          const toC = currentLeg.toCoords;
          const progressRatio = newLegProgress / 100;
          const currentX = fromC.x + (toC.x - fromC.x) * progressRatio;
          const currentY = fromC.y + (toC.y - fromC.y) * progressRatio;
          const currentLat = fromC.lat + (toC.lat - fromC.lat) * progressRatio;
          const currentLng = fromC.lng + (toC.lng - fromC.lng) * progressRatio;

          if (newLegProgress >= 100) {
            const nextLegIndex = route.currentLegIndex + 1;
            const updatedDistCompleted = Number((route.distanceCompletedKm + currentLeg.distanceKm).toFixed(1));

            if (nextLegIndex >= route.legs.length) {
              // Mission Complete! Truck has finished the final return leg and arrived back at Central Depot.
              const activeChargersCount = prevTrucks.filter((t) => t.opStatus === 'Charging (Fast DC)').length;
              let nextStatus: TruckOpStatus = 'Queued for Charger';
              let nextConnected = false;
              let nextBay: number | null = null;
              let nextRate = 0;

              if (activeChargersCount < 5) {
                const occupiedBays = prevTrucks.map((t) => t.chargerBay).filter(Boolean);
                const freeBay = [1, 2, 3, 4, 5].find((b) => !occupiedBays.includes(b)) || (activeChargersCount + 1);
                nextStatus = 'Charging (Fast DC)';
                nextConnected = true;
                nextBay = freeBay;
                nextRate = 48;
              }

              return {
                ...truck,
                soc: newSoc,
                arrivalSoc: newSoc,
                route: null,
                currentCargo: null,
                currentCoords: { ...DEPOT_COORDS },
                opStatus: nextStatus,
                connectedToCharger: nextConnected,
                chargerBay: nextBay,
                chargeRateKw: nextRate,
                totalDeliveriesCompleted: truck.totalDeliveriesCompleted + route.deliveryIds.length
              };
            } else {
              const nextLeg = route.legs[nextLegIndex];
              return {
                ...truck,
                soc: newSoc,
                currentCoords: { ...toC },
                opStatus: 'Dispatched - En Route' as const,
                currentCargo: nextLeg.cargoWeightKg > 0 ? `${nextLeg.boxCount} boxes (${nextLeg.cargoWeightKg.toLocaleString()} kg)` : 'Empty Tare',
                route: {
                  ...route,
                  currentLegIndex: nextLegIndex,
                  legProgressPct: 0,
                  distanceCompletedKm: updatedDistCompleted,
                  currentStopIndex: Math.min(nextLegIndex, (route.stops?.length || 1) - 1)
                }
              };
            }
          }

          return {
            ...truck,
            soc: newSoc,
            currentCoords: {
              x: currentX,
              y: currentY,
              lat: currentLat,
              lng: currentLng
            },
            currentCargo: currentLeg.cargoWeightKg > 0 ? `${currentLeg.boxCount} boxes (${currentLeg.cargoWeightKg.toLocaleString()} kg)` : 'Empty Tare',
            route: {
              ...route,
              legProgressPct: newLegProgress,
              distanceCompletedKm: Number((route.distanceCompletedKm + deltaDistanceKm).toFixed(1))
            }
          };
        });

        // B. Charging Progress for trucks in active bays (Up to 5 bays max)
        const newlyFreedBays: number[] = [];
        const chargeSocInc = 1.8 * Math.max(1, speedMultiplier * 0.4);

        updated = updated.map((truck) => {
          if (truck.opStatus === 'Charging (Fast DC)' && truck.connectedToCharger) {
            const nextSoc = clamp(truck.soc + chargeSocInc, 0, 100);

            if (nextSoc >= 99.5) {
              const freedBay = truck.chargerBay;
              if (freedBay) newlyFreedBays.push(freedBay);

              addLog(
                'fleet',
                'success',
                `${truck.name} reached 100% full charge! Bay #${freedBay} freed up for queued trucks.`
              );

              return {
                ...truck,
                soc: 100,
                opStatus: 'Available at Depot' as const,
                connectedToCharger: false,
                chargerBay: null,
                chargeRateKw: 0
              };
            }

            return {
              ...truck,
              soc: nextSoc
            };
          }
          return truck;
        });

        // C. Allocate free bays to queued trucks (Strict 5 simultaneous limit)
        const currentlyCharging = updated.filter((t) => t.opStatus === 'Charging (Fast DC)');
        const occupiedBays = new Set(currentlyCharging.map((t) => t.chargerBay).filter(Boolean));
        const availableBays = [1, 2, 3, 4, 5].filter((b) => !occupiedBays.has(b));

        if (availableBays.length > 0) {
          let bayIdx = 0;

          // Priority 1: Trucks explicitly queued
          updated = updated.map((truck) => {
            if (truck.opStatus === 'Queued for Charger' && bayIdx < availableBays.length) {
              const allocatedBay = availableBays[bayIdx++];
              addLog(
                'fleet',
                'success',
                `Queue handoff: ${truck.name} allocated Charger Bay #${allocatedBay}! Charging starts from ${truck.soc.toFixed(0)}% to 100%.`
              );
              return {
                ...truck,
                opStatus: 'Charging (Fast DC)' as const,
                connectedToCharger: true,
                chargerBay: allocatedBay,
                chargeRateKw: 48,
                arrivalSoc: truck.arrivalSoc ?? truck.soc
              };
            }
            return truck;
          });

          // Priority 2: Automatically charge low trucks waiting at depot if bays are free
          if (bayIdx < availableBays.length) {
            updated = updated.map((truck) => {
              if (
                truck.opStatus === 'Available at Depot' &&
                truck.soc < 85 &&
                !truck.connectedToCharger &&
                bayIdx < availableBays.length
              ) {
                const allocatedBay = availableBays[bayIdx++];
                addLog(
                  'fleet',
                  'info',
                  `Bay #${allocatedBay} allocated to ${truck.name} (${truck.soc.toFixed(0)}% battery). Fast DC charging initiated.`
                );
                return {
                  ...truck,
                  opStatus: 'Charging (Fast DC)' as const,
                  connectedToCharger: true,
                  chargerBay: allocatedBay,
                  chargeRateKw: 48,
                  arrivalSoc: truck.soc
                };
              }
              return truck;
            });
          }
        }

        return updated;
      });

      // 5. Battery Swap Rack (15 Packs) Charging Logic via GS-03
      const packChargeInc = 2.0 * Math.max(1, speedMultiplier * 0.4);

      setPacks((prevPacks) =>
        prevPacks.map((pack) => {
          if (!pack.charging || pack.soc >= 100) return pack;

          const nextSoc = clamp(pack.soc + packChargeInc, 0, 100);

          if (nextSoc >= 99.5) {
            addLog(
              'battery',
              'success',
              `${pack.name} reached 100% full charge! Ready for instant vehicle swap.`
            );
            return {
              ...pack,
              soc: 100,
              charging: false,
              status: 'Ready (100%)' as const
            };
          }

          return { ...pack, soc: nextSoc, status: 'Charging (GS-03)' as const };
        })
      );

      // 6. Super Battery Charging Rule:
      // "only there should be super battery with super high capacity which would charge only when no other battery is charging"
      const currentPacks = packsRef.current;
      const isAnySwapPackCharging = currentPacks.some((p) => p.charging && p.soc < 100);

      setSuperBattery((prevSuper) => {
        if (isAnySwapPackCharging) {
          return {
            ...prevSuper,
            isCharging: false,
            lockReason: 'Charging locked: Swap pack in rack is actively charging'
          };
        }

        // When NO other battery is charging:
        if (prevSuper.storedKwh < prevSuper.capacityKwh) {
          const chargeEnergy = (prevSuper.maxChargeRateKw * (deltaHours * 60)) / 60;
          const newStored = clamp(prevSuper.storedKwh + chargeEnergy, 0, prevSuper.capacityKwh);
          return {
            ...prevSuper,
            storedKwh: newStored,
            soc: (newStored / prevSuper.capacityKwh) * 100,
            isCharging: true,
            lockReason: null
          };
        }

        return {
          ...prevSuper,
          isCharging: false,
          lockReason: 'Super Battery 100% Full (6,000 kWh Reserve)'
        };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isPaused, speedMultiplier, addLog]);

  // Compute total live solar output
  const totalSolarKw = farms.reduce((sum, f) => sum + f.currentOutputKw, 0);
  const activeTruckChargersCount = trucks.filter((t) => t.opStatus === 'Charging (Fast DC)').length;
  const totalFleetPowerDrawnKw = trucks
    .filter((t) => t.opStatus === 'Charging (Fast DC)')
    .reduce((sum, t) => sum + t.chargeRateKw, 0);
  const totalBatteryRackDrawnKw = packs
    .filter((p) => p.charging && p.soc < 100)
    .reduce((sum, p) => sum + p.chargeRateKw, 0);

  const grid3Active = stations.find((s) => s.id === 3)?.active ?? false;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans selection:bg-blue-100 selection:text-blue-900">
      {/* Persistent Navigation Header with dropdowns & sim controls */}
      <Header
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        simHours={simHours}
        onSimHoursChange={setSimHours}
        speedMultiplier={speedMultiplier}
        onSpeedChange={setSpeedMultiplier}
        isPaused={isPaused}
        onTogglePause={() => setIsPaused((p) => !p)}
        weatherType={weather.type}
        onWeatherChange={handleWeatherChange}
        isNight={isNight}
        activeTruckChargersCount={activeTruckChargersCount}
        grid3Active={grid3Active}
      />

      {/* Main Content View Switcher */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        {currentTab === 'overview' && (
          <OverviewDashboard
            stations={stations}
            farms={farms}
            trucks={trucks}
            packs={packs}
            superBattery={superBattery}
            onNavigateTab={setCurrentTab}
            onToggleGrid3={handleToggleGrid3}
            onSelectDetail={setActiveModal}
            isNight={isNight}
            totalSolarKw={totalSolarKw}
          />
        )}

        {currentTab === 'solar-grid' && (
          <SolarGridRoom
            stations={stations}
            farms={farms}
            onToggleGrid3={handleToggleGrid3}
            onUpdateFarmPanels={handleUpdateFarmPanels}
            onSelectDetail={setActiveModal}
            totalSolarOutputKw={totalSolarKw}
            totalFleetPowerDrawnKw={totalFleetPowerDrawnKw}
            totalBatteryRackDrawnKw={totalBatteryRackDrawnKw}
          />
        )}

        {currentTab === 'fleet' && (
          <FleetLogisticsRoom
            trucks={trucks}
            deliveryPoints={deliveryPoints}
            onDispatchTruck={handleDispatchTruck}
            onInstantReturnTruck={handleInstantReturnTruck}
            onSwapTruckBattery={handlePerformSwap}
            onPlugInTruck={handlePlugInTruck}
            onCompleteChargeTruck={handleCompleteChargeTruck}
            onSelectDetail={setActiveModal}
            activeChargerCount={activeTruckChargersCount}
          />
        )}

        {currentTab === 'battery' && (
          <BatteryStationRoom
            packs={packs}
            superBattery={superBattery}
            gridStation3={stations.find((s) => s.id === 3)!}
            onToggleGrid3={handleToggleGrid3}
            onTogglePackCharging={handleTogglePackCharging}
            onFastChargePack={handleFastChargePack}
            onActivateAllPacksCharging={handleActivateAllPacksCharging}
            onPerformSwap={handlePerformSwap}
            trucks={trucks}
            isNight={isNight}
            onSelectDetail={setActiveModal}
          />
        )}

        {currentTab === 'map' && (
          <LogisticsMap
            deliveryPoints={deliveryPoints}
            trucks={trucks}
            onSelectDetail={setActiveModal}
          />
        )}

        {currentTab === 'logs' && (
          <ActivityLog logs={logs} onClearLogs={() => setLogs([])} />
        )}
      </main>

      {/* Telemetry Detail Modal for Clicked Tiles */}
      <TileDetailModal content={activeModal} onClose={() => setActiveModal(null)} />

      {/* Compact Status Footer */}
      <footer className="border-t border-slate-200/80 bg-white py-3 px-4 text-center text-xs text-slate-400">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            Meridian SCADA Microgrid &amp; Electric Logistics Platform · 2+1 Grid Stations · 9 Solar Arrays · 10 Trucks · 15 DPs
          </span>
          <span className="font-mono text-[11px] text-slate-500">
            Current Sim Time: {formatTime(simHours)} ({isNight ? '🌙 Night Mode' : '☀️ Day Mode'})
          </span>
        </div>
      </footer>
    </div>
  );
}
