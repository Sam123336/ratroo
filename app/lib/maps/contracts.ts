import type { ComponentType } from "react";

export type Coordinates = { latitude: number; longitude: number };
export type StopSelection = Coordinates & { stopName?: string };

export type StopMapPickerProps = {
  stopName: string;
  latitude?: number;
  longitude?: number;
  onClose: () => void;
  onConfirm: (selection: StopSelection) => void;
};

export type NearbyStop = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  provider: string;
  category: string;
  distanceMeters: number;
  routes: Array<{ id: string; name: string }>;
};

export type MappedRoute = {
  id: string;
  name: string;
  provider: string;
  stops: Array<{ name: string; latitude: number; longitude: number; sequence: number }>;
};

/** A bus the operator is reporting right now. */
export type LiveVehicle = {
  vehicleNumber: string | null;
  serviceType: string | null;
  routeName: string | null;
  latitude: number;
  longitude: number;
  /** Compass degrees, used to point the icon the way it is travelling. */
  heading: number | null;
  /** Seconds since the operator last heard from it. */
  fixAgeSeconds: number | null;
};

export type TransitMapProps = {
  latitude: number;
  longitude: number;
  address: string;
  nearby: NearbyStop[];
  route: MappedRoute | null;
  /** Buses moving right now. Empty when nothing is running, which is common at night. */
  liveVehicles?: LiveVehicle[];
};

/** Application pages consume only this contract; vendor code lives in adapters. */
export type MapProvider = {
  id: string;
  publicLabel: string;
  StopMapPicker: ComponentType<StopMapPickerProps>;
  TransitMap: ComponentType<TransitMapProps>;
};
