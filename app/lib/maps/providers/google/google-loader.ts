export type GoogleListener = { remove(): void };
export type GoogleLatLng = { lat(): number; lng(): number };
export type GoogleMapMouseEvent = { latLng?: GoogleLatLng | null };

export type GoogleMapInstance = {
  addListener(event: string, listener: (event: GoogleMapMouseEvent) => void): GoogleListener;
  panTo(position: { lat: number; lng: number }): void;
  setZoom(zoom: number): void;
  setTilt(tilt: number): void;
  setHeading(heading: number): void;
  fitBounds(bounds: GoogleLatLngBounds, padding?: number): void;
};

export type GoogleMarkerInstance = {
  addListener(event: string, listener: () => void): GoogleListener;
  getPosition(): GoogleLatLng | null | undefined;
  setPosition(position: { lat: number; lng: number }): void;
  setMap(map: GoogleMapInstance | null): void;
};

export type GooglePolylineInstance = { setMap(map: GoogleMapInstance | null): void };
export type GoogleLatLngBounds = { extend(position: { lat: number; lng: number }): void };

export type GoogleMapsNamespace = {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMapInstance;
  Marker: new (options: Record<string, unknown>) => GoogleMarkerInstance;
  Polyline: new (options: Record<string, unknown>) => GooglePolylineInstance;
  LatLngBounds: new () => GoogleLatLngBounds;
};

declare global {
  interface Window {
    google?: { maps: GoogleMapsNamespace };
    __ratrooGoogleMapsLoader?: Promise<GoogleMapsNamespace>;
  }
}

export function loadGoogleMaps() {
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (window.__ratrooGoogleMapsLoader) return window.__ratrooGoogleMapsLoader;
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
  if (!key) return Promise.reject(new Error("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY is required."));

  window.__ratrooGoogleMapsLoader = new Promise((resolve, reject) => {
    const callback = `__ratrooGoogleMapsReady_${Date.now()}`;
    const target = window as unknown as Record<string, unknown>;
    target[callback] = () => {
      delete target[callback];
      if (window.google?.maps) resolve(window.google.maps);
      else reject(new Error("Google Maps loaded without the maps API."));
    };
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=${callback}&loading=async&v=weekly`;
    script.async = true;
    script.onerror = () => {
      delete target[callback];
      reject(new Error("Google Maps could not be loaded."));
    };
    document.head.appendChild(script);
  });
  return window.__ratrooGoogleMapsLoader;
}
