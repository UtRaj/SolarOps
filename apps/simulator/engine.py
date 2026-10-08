"""
SolarOps Independent Simulation Engine (Phase 6)
Decoupled physics, kinematic, energy, and battery models capable of headless execution.
Generates structured telemetry events for ingestion into TimescaleDB and NATS JetStream.
"""
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import List, Dict, Optional
import math
import uuid

@dataclass
class SimulationClock:
    current_time_hours: float = 9.5  # 09:30 AM
    speed_multiplier: float = 1.0     # 1x, 5x, 15x, 60x
    is_paused: bool = False
    tick_interval_sec: float = 1.0

    def tick(self) -> float:
        if not self.is_paused:
            # Advance time: 1 real second = (speed_multiplier / 3600) simulation hours
            delta_hours = (self.tick_interval_sec * self.speed_multiplier) / 3600.0
            self.current_time_hours = (self.current_time_hours + delta_hours) % 24.0
        return self.current_time_hours

    @property
    def is_daylight(self) -> bool:
        return 7.0 <= self.current_time_hours <= 17.0

    @property
    def formatted_time(self) -> str:
        h = int(self.current_time_hours)
        m = int((self.current_time_hours - h) * 60)
        s = int((((self.current_time_hours - h) * 60) - m) * 60)
        return f"{h:02d}:{m:02d}:{s:02d}"

@dataclass
class SolarTelemetry:
    grid_station_id: str
    timestamp: str
    total_generation_kw: float
    base_load_kw: float
    grid_export_kw: float
    bess_infeed_kw: float
    irradiance_w_m2: float

class EnergySimulator:
    """Calculates diurnal solar irradiance, panel scaling, BESS dispatch, and microgrid balance."""
    def __init__(self):
        self.bess_capacity_kwh = 6000.0
        self.bess_stored_kwh = 4500.0
        self.bess_state = "charging"  # charging, discharging, standby
        self.bess_temp_c = 28.4

    def compute_solar_output(self, sim_hours: float, base_capacity_kw: float, scale_mult: float, weather_factor: float = 1.0) -> float:
        """Solar bell curve centered around 12:00 (solar noon). Returns 0 outside 07:00 - 17:00."""
        if sim_hours < 7.0 or sim_hours > 17.0:
            return 0.0
        # Peak generation at 12.0
        hour_offset = abs(sim_hours - 12.0)
        sun_elevation = math.cos((hour_offset / 5.0) * (math.pi / 2.0))
        effective_capacity = base_capacity_kw * scale_mult
        irradiance_factor = max(0.0, sun_elevation) * weather_factor
        return round(effective_capacity * irradiance_factor, 1)

    def step_bess(self, surplus_kw: float, deficit_kw: float, delta_hours: float) -> Dict[str, float]:
        """Manages 6,000 kWh BESS Super Battery state transitions."""
        if surplus_kw > 50.0 and self.bess_stored_kwh < self.bess_capacity_kwh:
            # Charge from surplus solar
            charge_power = min(surplus_kw, 500.0)  # Max 500 kW inverter rating
            energy_added = charge_power * delta_hours
            self.bess_stored_kwh = min(self.bess_capacity_kwh, self.bess_stored_kwh + energy_added)
            self.bess_state = "charging"
            return {"power_kw": charge_power, "state": "charging", "soc": (self.bess_stored_kwh / self.bess_capacity_kwh) * 100}
        elif deficit_kw > 50.0 and self.bess_stored_kwh > (self.bess_capacity_kwh * 0.15):
            # Discharge to support microgrid
            discharge_power = min(deficit_kw, 500.0)
            energy_removed = discharge_power * delta_hours
            self.bess_stored_kwh = max(0.0, self.bess_stored_kwh - energy_removed)
            self.bess_state = "discharging"
            return {"power_kw": -discharge_power, "state": "discharging", "soc": (self.bess_stored_kwh / self.bess_capacity_kwh) * 100}
        else:
            self.bess_state = "standby"
            return {"power_kw": 0.0, "state": "standby", "soc": (self.bess_stored_kwh / self.bess_capacity_kwh) * 100}

@dataclass
class FleetSimulator:
    """Simulates 10 heavy EV trucks, multi-stop kinematics, payload drag, and bay queues."""
    active_bays_limit: int = 5
    fast_dc_rate_kw: float = 48.0
    slow_ac_rate_kw: float = 15.0

    def compute_energy_consumption_kwh(self, distance_km: float, payload_kg: float) -> float:
        """Baseline consumption is 0.85 kWh/km tare + 0.15 kWh per 1,000 kg cargo."""
        base_rate = 0.85
        payload_penalty = (payload_kg / 1000.0) * 0.15
        return distance_km * (base_rate + payload_penalty)
