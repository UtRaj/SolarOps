import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Header } from './components/Header';
import { OverviewDashboard } from './components/OverviewDashboard';
import { SolarGridRoom } from './components/SolarGridRoom';
import { FleetLogisticsRoom } from './components/FleetLogisticsRoom';
import { BatteryStationRoom } from './components/BatteryStationRoom';
import { LogisticsMap } from './components/LogisticsMap';
import { TileDetailModal } from './components/TileDetailModal';
import { OrderDashboard } from './components/OrderDashboard';
import { MerchantOrderChat } from './components/MerchantOrderChat';
import { EventArchitectureModal } from './components/EventArchitectureModal';

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
  DetailModalContent,
  MerchantOrder
} from './types';

import {
  INITIAL_DELIVERY_POINTS,
  INITIAL_TRUCKS,
  INITIAL_GRID_STATIONS,
  INITIAL_SOLAR_FARMS,
  INITIAL_BATTERY_PACKS,
  INITIAL_SUPER_BATTERY,
  INITIAL_WEATHER,
  INITIAL_ORDERS,
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

import { generateOrderRoute, generateMultiStopOrderRoute, DeliveryStopInput, autoAssignTruckForOrder } from './utils/pricingEngine';
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

  // Commercial Merchant Orders Pipeline
  const [orders, setOrders] = useState<MerchantOrder[]>(INITIAL_ORDERS);

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
  const [isArchModalOpen, setIsArchModalOpen] = useState<boolean>(false);

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

    if (truck.opStatus === 'Dispatched - En Route' || truck.route !== null || truck.opStatus.includes('En Route')) {
      alert(`Truck ${truck.name} is already dispatched and en route! Dispatched vehicles cannot be re-dispatched.`);
      return;
    }

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
    let orderToComplete: string | null = null;
    const isNight = isNightTime(simHours);

    setTrucks((prev) => {
      const targetTruck = prev.find((t) => t.id === truckId);
      if (!targetTruck || !targetTruck.route) return prev;

      if (targetTruck.route.orderId) {
        orderToComplete = targetTruck.route.orderId;
      }

      // Realistic return power calculation (e.g. 21% or 63% as requested)
      const calculatedReturnSoc = clamp(targetTruck.route.estimatedReturnSoc + (Math.random() * 4 - 2), 12, 85);

      if (isNight) {
        // Requirement 1: At night (17:00–07:00), solar Fast DC bays are offline.
        // Trucks returned must either slow charge or battery swap.
        const readyPack = packsRef.current.find((p) => p.soc >= 99);

        if (readyPack) {
          // Automatic 100% Battery Swap using available pack in rack (drawn from Super Battery first)
          const requiredEnergyKwh = 35;
          setSuperBattery((s) => {
            const newStored = Math.max(0, s.storedKwh - requiredEnergyKwh);
            return {
              ...s,
              storedKwh: newStored,
              soc: Number(((newStored / s.capacityKwh) * 100).toFixed(1))
            };
          });

          // Update pack in rack
          setPacks((prevP) =>
            prevP.map((p) =>
              p.id === readyPack.id
                ? {
                    ...p,
                    soc: Number(calculatedReturnSoc.toFixed(1)),
                    charging: true,
                    status: 'Charging (GS-03)' as const,
                    cycles: p.cycles + 1
                  }
                : p
            )
          );

          addLog(
            'battery',
            'success',
            `[Night Protocol] ${targetTruck.name} returned at ${calculatedReturnSoc.toFixed(0)}%! Night window active: Executed instant 100% Battery Swap with Pack #${readyPack.id} (energy drawn from Super Battery).`
          );

          return prev.map((t) => {
            if (t.id === truckId) {
              return {
                ...t,
                soc: 100,
                arrivalSoc: null,
                opStatus: 'Available at Depot' as const,
                connectedToCharger: false,
                chargerBay: null,
                chargeRateKw: 0,
                currentCargo: null,
                route: null,
                totalDeliveriesCompleted: t.totalDeliveriesCompleted + (targetTruck.route?.deliveryIds.length || 2),
                currentCoords: { ...DEPOT_COORDS }
              };
            }
            return t;
          });
        } else {
          // No 100% pack ready: Connect to Overnight Slow AC Charger (15 kW)
          addLog(
            'fleet',
            'info',
            `[Night Protocol] ${targetTruck.name} returned at ${calculatedReturnSoc.toFixed(0)}%! Solar Fast DC bays offline at night. Connected to Overnight Slow AC Charger (15 kW). Progress tracking active.`
          );

          return prev.map((t) => {
            if (t.id === truckId) {
              return {
                ...t,
                soc: calculatedReturnSoc,
                arrivalSoc: calculatedReturnSoc,
                opStatus: 'Charging (Slow AC)' as const,
                connectedToCharger: true,
                chargerBay: null,
                chargeRateKw: 15,
                currentCargo: null,
                route: null,
                totalDeliveriesCompleted: t.totalDeliveriesCompleted + (targetTruck.route?.deliveryIds.length || 2),
                currentCoords: { ...DEPOT_COORDS }
              };
            }
            return t;
          });
        }
      } else {
        // Day Protocol: Allocate Fast DC Charging Bay (Bays 1-5, 48 kW solar powered)
        const activeChargersCount = prev.filter((t) => t.opStatus === 'Charging (Fast DC)').length;
        let nextStatus: TruckOpStatus = 'Queued for Charger';
        let nextConnected = false;
        let nextBay: number | null = null;
        let nextRate = 0;

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
            `[Day Protocol] ${targetTruck.name} returned at ${calculatedReturnSoc.toFixed(0)}%! Solar generation active. Allocated Fast DC Bay #${freeBay} (48 kW). Charging to 100%.`
          );
        } else {
          addLog(
            'fleet',
            'warning',
            `[Day Protocol] ${targetTruck.name} returned at ${calculatedReturnSoc.toFixed(0)}%! All 5 Fast DC bays occupied. Truck placed in charging queue.`
          );
        }

        return prev.map((t) => {
          if (t.id === truckId) {
            return {
              ...t,
              soc: calculatedReturnSoc,
              arrivalSoc: calculatedReturnSoc,
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
      }
    });

    if (orderToComplete) {
      const finishedOrderId = orderToComplete;
      setOrders((prev) =>
        prev.map((o) => (o.id === finishedOrderId ? { ...o, status: 'delivered' } : o))
      );
    }
  }, [simHours, addLog]);

  // Order Management Handlers
  const handleAddOrder = useCallback((newOrder: MerchantOrder) => {
    setOrders((prev) => [newOrder, ...prev]);
    addLog(
      'dispatch',
      'success',
      `New order ${newOrder.id} logged for ${newOrder.merchantName}. Timed pickup scheduled at ${formatTime(newOrder.scheduledPickupTimeHours)}.`
    );
  }, [addLog]);

  const handleCancelOrder = useCallback((orderId: string) => {
    setOrders((prev) => prev.filter((o) => o.id !== orderId));
    addLog('dispatch', 'info', `Order ${orderId} cancelled by operator.`);
  }, [addLog]);

  // Dispatch merchant order (Leaves depot early to arrive at customer pickup location on time)
  const handleDispatchMerchantOrder = useCallback(
    (orderId: string) => {
      const order = ordersRef.current.find((o) => o.id === orderId);
      if (!order || order.status !== 'scheduled') return;

      const currentTrucks = trucksRef.current;
      const currentDPs = deliveryPointsRef.current;

      // Find designated truck or allocate best capability match
      let truck = currentTrucks.find((t) => t.id === order.assignedTruckId && !t.route);
      if (!truck) {
        truck =
          autoAssignTruckForOrder(currentTrucks, order.requiredService, order.weightKg) ||
          currentTrucks.find((t) => !t.route);
      }

      if (!truck) {
        addLog(
          'dispatch',
          'warning',
          `Order ${order.id}: All trucks busy en route. Vehicle will be allocated as soon as a truck returns to depot.`
        );
        return;
      }

      const originDP = currentDPs.find((dp) => dp.id === order.originPointId) || currentDPs[0];

      // Multi-stop deliveries input (up to 3 stops)
      const deliveriesInput: DeliveryStopInput[] = (order.deliveries && order.deliveries.length > 0)
        ? order.deliveries.map((d) => {
            const dp = currentDPs.find((p) => p.id === d.deliveryPointId) || currentDPs[1];
            return {
              deliveryPoint: dp,
              cargoWeightKg: d.cargoWeightKg,
              boxCount: d.boxCount
            };
          })
        : [{
            deliveryPoint: currentDPs.find((dp) => dp.id === order.destinationPointId) || currentDPs[1],
            cargoWeightKg: order.weightKg,
            boxCount: order.boxCount
          }];

      const totalWeightKg = order.totalWeightKg || deliveriesInput.reduce((sum, d) => sum + d.cargoWeightKg, 0);
      const totalBoxes = order.totalBoxes || deliveriesInput.reduce((sum, d) => sum + (d.boxCount || 0), 0);

      // Multi-route mission:
      // Stage 0: Depot Bay -> Customer Pickup Point (Departs early so truck arrives on time)
      // Stage 1..N: Sequential Delivery Dropoffs with step-by-step cargo unloading
      // Final Stage: Last Delivery Point -> Depot Bay (returns to recharge)
      const routePlan = generateMultiStopOrderRoute(
        DEPOT_COORDS,
        originDP,
        deliveriesInput
      );

      let totalMissionKwh = 0;
      routePlan.legs.forEach((leg) => {
        const { kwh } = calculateLegEnergyConsumption(leg.distanceKm, leg.cargoWeightKg);
        totalMissionKwh += kwh;
      });

      const totalSocDrop = (totalMissionKwh / truck.batteryCapacityKwh) * 100;
      const estReturn = Math.max(5, Number((truck.soc - totalSocDrop).toFixed(1)));

      const wasCharging = truck.opStatus === 'Charging (Fast DC)';
      const freedBay = truck.chargerBay;

      const stops = [
        {
          pointId: originDP.id,
          type: 'pickup' as const,
          label: `Customer Pickup: ${originDP.code}`,
          completed: false
        },
        ...deliveriesInput.map((d, i) => ({
          pointId: d.deliveryPoint.id,
          type: 'delivery' as const,
          label: `Delivery ${i + 1}: ${d.deliveryPoint.code} (${d.cargoWeightKg} kg)`,
          completed: false
        }))
      ];

      setTrucks((prev) => {
        let updated = prev.map((t) => {
          if (t.id === truck!.id) {
            return {
              ...t,
              opStatus: 'Dispatched - En Route' as const,
              connectedToCharger: false,
              chargerBay: null,
              chargeRateKw: 0,
              arrivalSoc: null,
              currentCargo: `En route to pickup at ${originDP.code} (${totalBoxes} boxes / ${totalWeightKg.toLocaleString()} kg)`,
              route: {
                orderId: order.id,
                pickupId: originDP.id,
                deliveryIds: deliveriesInput.map((d) => d.deliveryPoint.id),
                legs: routePlan.legs,
                currentLegIndex: 0,
                legProgressPct: 0,
                totalDistanceKm: routePlan.totalDistanceKm,
                distanceCompletedKm: 0,
                departureSoc: t.soc,
                estimatedReturnSoc: estReturn,
                cargoDetails: {
                  boxTypeId: 'merchant_order',
                  boxTypeName: `${order.requiredService} freight`,
                  unitWeightKg: Number((totalWeightKg / Math.max(1, totalBoxes)).toFixed(1)),
                  initialBoxes: totalBoxes,
                  totalWeightKg: totalWeightKg
                },
                stops,
                currentStopIndex: 0
              }
            };
          }
          return t;
        });

        // If dispatched truck freed a charger bay, promote first queued truck
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
                  arrivalSoc: t.soc
                };
              }
              return t;
            });
            addLog(
              'fleet',
              'success',
              `Bay #${freedBay} freed up by dispatch! ${queuedTruck.name} allocated bay to charge from ${queuedTruck.soc.toFixed(0)}% to 100%.`
            );
          }
        }

        return updated;
      });

      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? {
                ...o,
                status: 'dispatched_to_pickup',
                assignedTruckId: truck!.id
              }
            : o
        )
      );

      addLog(
        'dispatch',
        'info',
        `Automated Dispatch: ${truck.name} dispatched for Order ${order.id} (${order.merchantName}). Departing depot early at ${formatTime(order.calculatedDispatchTimeHours)} to arrive at ${originDP.code} by ${formatTime(order.scheduledPickupTimeHours)}.`
      );
    },
    [addLog]
  );

  // Battery Swap Action
  const handlePerformSwap = useCallback((truckId: number) => {
    const readyPack = packs.find((p) => p.soc >= 99);
    const truck = trucks.find((t) => t.id === truckId);

    if (!readyPack || !truck) {
      alert('Cannot perform swap: A ready 100% battery pack is required.');
      return;
    }

    const isTruckDispatched =
      truck.opStatus === 'Dispatched - En Route' ||
      truck.opStatus.includes('En Route') ||
      truck.route !== null;

    if (isTruckDispatched) {
      alert(`Cannot perform battery swap: ${truck.name} is currently dispatched and en route. At no cost can a dispatched truck undergo battery swap or charging from the bay until it returns to Central Depot.`);
      addLog('battery', 'warning', `Battery swap rejected: ${truck.name} is dispatched en route.`);
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
    const isNight = isNightTime(simHours);

    setTrucks((prev) => {
      const truck = prev.find((t) => t.id === truckId);
      const isTruckDispatched =
        !truck ||
        truck.opStatus === 'Charging (Fast DC)' ||
        truck.opStatus === 'Charging (Slow AC)' ||
        truck.opStatus === 'Dispatched - En Route' ||
        truck.opStatus.includes('En Route') ||
        truck.route !== null;

      if (isTruckDispatched) {
        return prev;
      }

      if (isNight) {
        // At night, Fast DC is offline: connect to Overnight Slow AC Charger (15 kW)
        addLog(
          'fleet',
          'success',
          `[Night Protocol] ${truck.name} connected to Overnight Slow AC Charger (15 kW)! Charging starts from ${truck.soc.toFixed(0)}% to 100%.`
        );
        return prev.map((t) =>
          t.id === truckId
            ? {
                ...t,
                opStatus: 'Charging (Slow AC)' as const,
                connectedToCharger: true,
                chargerBay: null,
                chargeRateKw: 15,
                arrivalSoc: t.arrivalSoc ?? t.soc
              }
            : t
        );
      }

      const currentlyCharging = prev.filter((t) => t.opStatus === 'Charging (Fast DC)');
      const occupiedBays = currentlyCharging.map((t) => t.chargerBay).filter(Boolean) as number[];
      const availableBays = [1, 2, 3, 4, 5].filter((b) => !occupiedBays.includes(b));

      if (availableBays.length > 0) {
        const bay = availableBays[0];
        addLog(
          'fleet',
          'success',
          `[Day Protocol] ${truck.name} plugged into Fast DC Charger Bay #${bay}! Charging started from ${truck.soc.toFixed(0)}% to 100%.`
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
          `All 5 Fast DC charging bays occupied. ${truck.name} placed in waiting queue. Will auto-connect once a bay frees up.`
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
  }, [simHours, addLog]);

  // Complete charge on a truck immediately (simulates 100% full, frees bay, promotes next queued truck)
  const handleCompleteChargeTruck = useCallback((truckId: number) => {
    setTrucks((prev) => {
      const truck = prev.find((t) => t.id === truckId);
      if (
        !truck ||
        truck.opStatus === 'Dispatched - En Route' ||
        truck.opStatus.includes('En Route') ||
        truck.route !== null
      ) {
        return prev;
      }
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

  const superBatteryRef = useRef(superBattery);
  superBatteryRef.current = superBattery;

  const stationsRef = useRef(stations);
  stationsRef.current = stations;

  const trucksRef = useRef(trucks);
  trucksRef.current = trucks;

  const farmsRef = useRef(farms);
  farmsRef.current = farms;

  const deliveryPointsRef = useRef(deliveryPoints);
  deliveryPointsRef.current = deliveryPoints;

  const weatherRef = useRef(weather);
  weatherRef.current = weather;

  const ordersRef = useRef(orders);
  ordersRef.current = orders;

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
      let computedFarms: SolarFarm[] = [];
      setFarms((prevFarms) => {
        computedFarms = prevFarms.map((farm) => {
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
        });
        return computedFarms;
      });

      // 3. Update Grid Stations solar inputs, active loads, and dynamic BESS buffer SOC
      setStations((prevStations) =>
        prevStations.map((station) => {
          if (!station.active) {
            return {
              ...station,
              currentSolarInputKw: 0,
              activeLoadKw: 0,
              status: 'Standby / Deactivated'
            };
          }

          // Total solar generation feeding into this station from its 3 connected farms
          const farmList = computedFarms.length > 0 ? computedFarms : farmsRef.current;
          const connectedFarms = farmList.filter((f) => station.connectedFarmIds.includes(f.id));
          const totalSolarKw = connectedFarms.reduce((sum, f) => sum + f.currentOutputKw, 0);

          // Calculate actual active electrical load drawing from this station:
          // GS-01 feeds Fast DC Charger Bays 1, 2, 3
          // GS-02 feeds Fast DC Charger Bays 4, 5
          // GS-03 feeds 15-pack modular battery rack
          let activeLoadKw = 0;
          if (station.id === 1) {
            activeLoadKw = trucksRef.current
              .filter((t) => t.opStatus === 'Charging (Fast DC)' && [1, 2, 3].includes(t.chargerBay || 0))
              .reduce((sum, t) => sum + t.chargeRateKw, 0);
          } else if (station.id === 2) {
            activeLoadKw = trucksRef.current
              .filter((t) => t.opStatus === 'Charging (Fast DC)' && [4, 5].includes(t.chargerBay || 0))
              .reduce((sum, t) => sum + t.chargeRateKw, 0);
          } else if (station.id === 3) {
            activeLoadKw = packsRef.current
              .filter((p) => p.charging && p.soc < 100)
              .reduce((sum, p) => sum + p.chargeRateKw, 0);
          }

          // Responsive BESS battery buffer dynamic modeling
          // In daytime or when solar infeed is active, solar generation steadily replenishes the station BESS buffer
          const netPowerKw = totalSolarKw - activeLoadKw;
          const chargeRateFactor = Math.max(0.2, (speedMultiplier / 5) * 0.35);
          let newStoredKwh = station.bessStoredKwh;

          if (netPowerKw > 0) {
            // Surplus solar generation directly charges the BESS buffer smoothly
            const addedKwh = Math.max(0.5, (netPowerKw * 0.08) * chargeRateFactor);
            newStoredKwh = Math.min(station.bessCapacityKwh, station.bessStoredKwh + addedKwh);
          } else if (totalSolarKw > 15) {
            // Station is under active solar illumination; solar infeed continues to recharge the buffer
            const solarReplenishKwh = Math.max(0.35, (totalSolarKw * 0.04) * chargeRateFactor);
            newStoredKwh = Math.min(station.bessCapacityKwh, station.bessStoredKwh + solarReplenishKwh);
          } else {
            // Night-time or heavy load discharge: buffer supports load gradually down to safe reserve (20%)
            const consumedKwh = Math.max(0.2, (Math.abs(netPowerKw) * 0.03) * chargeRateFactor);
            newStoredKwh = Math.max(station.bessCapacityKwh * 0.20, station.bessStoredKwh - consumedKwh);
          }

          const newSoc = Number(clamp((newStoredKwh / station.bessCapacityKwh) * 100, 5, 100).toFixed(1));

          return {
            ...station,
            currentSolarInputKw: Number(totalSolarKw.toFixed(1)),
            activeLoadKw: Number(activeLoadKw.toFixed(1)),
            bessStoredKwh: Number(newStoredKwh.toFixed(1)),
            bessSocPct: newSoc,
            voltageV: 400 + (Math.random() - 0.5) * 1.5,
            frequencyHz: 50.0 + (Math.random() - 0.5) * 0.03,
            status: 'Online & Supplying'
          };
        })
      );

      // Automated Order Dispatch Check:
      // Dispatches any scheduled orders when current simulation time reaches the calculated early departure time
      const currentOrders = ordersRef.current;
      currentOrders.forEach((order) => {
        if (order.status === 'scheduled') {
          // If simHours has arrived at or just passed calculated departure time
          if (simHours >= order.calculatedDispatchTimeHours && (simHours - order.calculatedDispatchTimeHours) < 3.0) {
            handleDispatchMerchantOrder(order.id);
          }
        }
      });

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

            // If this truck is on an order mission, sync order status
            if (route.orderId) {
              const activeOrderId = route.orderId;
              if (nextLegIndex === 1) {
                // Arrived at pickup point, picked up goods and departed towards destination
                setOrders((prevO) =>
                  prevO.map((o) => (o.id === activeOrderId ? { ...o, status: 'in_transit' } : o))
                );
              }
            }

            if (nextLegIndex >= route.legs.length) {
              // Mission Complete! Truck has finished the final return leg and arrived back at Central Depot.
              if (route.orderId) {
                const finishedOrderId = route.orderId;
                setOrders((prevO) =>
                  prevO.map((o) => (o.id === finishedOrderId ? { ...o, status: 'delivered' } : o))
                );
                addLog('dispatch', 'success', `Order ${finishedOrderId} successfully delivered and truck returned to Depot.`);
              }

              const isNightNow = isNightTime(simHours);

              if (isNightNow) {
                // User Requirement 1: Only during night time, they will have to either slow charge or battery swap
                const readyPack = packsRef.current.find((p) => p.soc >= 99);
                if (readyPack) {
                  const requiredEnergyKwh = 35;
                  setSuperBattery((s) => {
                    const newStored = Math.max(0, s.storedKwh - requiredEnergyKwh);
                    return {
                      ...s,
                      storedKwh: newStored,
                      soc: Number(((newStored / s.capacityKwh) * 100).toFixed(1))
                    };
                  });

                  setPacks((prevP) =>
                    prevP.map((p) =>
                      p.id === readyPack.id
                        ? {
                            ...p,
                            soc: Number(newSoc.toFixed(1)),
                            charging: true,
                            status: 'Charging (GS-03)' as const,
                            cycles: p.cycles + 1
                          }
                        : p
                    )
                  );

                  addLog(
                    'battery',
                    'success',
                    `[Night Protocol] ${truck.name} returned at ${newSoc.toFixed(0)}%! Instant 100% Battery Swap executed (drawn from Super Battery).`
                  );

                  return {
                    ...truck,
                    soc: 100,
                    arrivalSoc: null,
                    route: null,
                    currentCargo: null,
                    currentCoords: { ...DEPOT_COORDS },
                    opStatus: 'Available at Depot' as const,
                    connectedToCharger: false,
                    chargerBay: null,
                    chargeRateKw: 0,
                    totalDeliveriesCompleted: truck.totalDeliveriesCompleted + route.deliveryIds.length
                  };
                } else {
                  addLog(
                    'fleet',
                    'info',
                    `[Night Protocol] ${truck.name} returned at ${newSoc.toFixed(0)}%! Solar Fast DC bays offline at night. Connected to Overnight Slow AC Charger (15 kW).`
                  );

                  return {
                    ...truck,
                    soc: newSoc,
                    arrivalSoc: newSoc,
                    route: null,
                    currentCargo: null,
                    currentCoords: { ...DEPOT_COORDS },
                    opStatus: 'Charging (Slow AC)' as const,
                    connectedToCharger: true,
                    chargerBay: null,
                    chargeRateKw: 15,
                    totalDeliveriesCompleted: truck.totalDeliveriesCompleted + route.deliveryIds.length
                  };
                }
              } else {
                // Day Protocol: Allocate Fast DC Bay (1 to 5, 48 kW)
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
                  addLog('fleet', 'success', `[Day Protocol] ${truck.name} returned at ${newSoc.toFixed(0)}%! Allocated Fast DC Bay #${freeBay} (48 kW).`);
                } else {
                  addLog('fleet', 'warning', `[Day Protocol] ${truck.name} returned at ${newSoc.toFixed(0)}%! All 5 Fast DC bays occupied. Placed in queue.`);
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
              }
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

        // B. Charging Progress for trucks in active bays and overnight slow chargers
        const newlyFreedBays: number[] = [];
        const chargeSocInc = 1.8 * Math.max(1, speedMultiplier * 0.4);
        const slowChargeSocInc = 0.6 * Math.max(1, speedMultiplier * 0.4);

        updated = updated.map((truck) => {
          if (truck.opStatus === 'Charging (Fast DC)' && truck.connectedToCharger) {
            const nextSoc = clamp(truck.soc + chargeSocInc, 0, 100);

            if (nextSoc >= 99.5) {
              const freedBay = truck.chargerBay;
              if (freedBay) newlyFreedBays.push(freedBay);

              addLog(
                'fleet',
                'success',
                `${truck.name} reached 100% full charge (Fast DC)! Bay #${freedBay} freed up for queued trucks.`
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

          if (truck.opStatus === 'Charging (Slow AC)' && truck.connectedToCharger) {
            const nextSoc = clamp(truck.soc + slowChargeSocInc, 0, 100);

            if (nextSoc >= 99.5) {
              addLog(
                'fleet',
                'success',
                `${truck.name} reached 100% full charge on Overnight Slow AC! Ready at Depot.`
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

        // C. Allocate free bays to queued trucks (Strict 5 simultaneous limit during daytime only)
        const isNightNow = isNightTime(simHours);

        if (!isNightNow) {
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
                  !truck.route &&
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
    .filter((t) => t.opStatus === 'Charging (Fast DC)' || t.opStatus === 'Charging (Slow AC)')
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
        ordersCount={orders.length}
        activeChatCount={orders.filter((o) => o.status === 'scheduled' || o.status === 'dispatched_to_pickup' || o.status === 'in_transit').length}
        onOpenArchitecture={() => setIsArchModalOpen(true)}
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
            isNight={isNight}
            simHours={simHours}
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

        {currentTab === 'orders' && (
          <OrderDashboard
            orders={orders}
            trucks={trucks}
            deliveryPoints={deliveryPoints}
            onAddOrder={handleAddOrder}
            onCancelOrder={handleCancelOrder}
            onDispatchOrderNow={handleDispatchMerchantOrder}
            onOpenChat={() => setCurrentTab('chat')}
            simHours={simHours}
          />
        )}

        {currentTab === 'chat' && (
          <MerchantOrderChat
            deliveryPoints={deliveryPoints}
            trucks={trucks}
            orders={orders}
            onPlaceOrder={handleAddOrder}
            onViewOrders={() => setCurrentTab('orders')}
            simHours={simHours}
          />
        )}
      </main>

      {/* Telemetry Detail Modal for Clicked Tiles */}
      <TileDetailModal content={activeModal} onClose={() => setActiveModal(null)} />

      {/* Production Architecture & Outbox Inspection Modal */}
      <EventArchitectureModal isOpen={isArchModalOpen} onClose={() => setIsArchModalOpen(false)} />

      {/* Compact Status Footer */}
      <footer className="border-t border-slate-200/80 bg-white py-3 px-4 text-center text-xs text-slate-400">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            Meridian Microgrid Energy &amp; Electric Fleet Logistics Platform · 2+1 Grid Stations · 9 Solar Arrays · 10 Trucks · 15 DPs
          </span>
          <span className="font-mono text-[11px] text-slate-500">
            Current Sim Time: {formatTime(simHours)} ({isNight ? '🌙 Night Mode' : '☀️ Day Mode'})
          </span>
        </div>
      </footer>
    </div>
  );
}
