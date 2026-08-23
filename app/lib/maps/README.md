# Map provider boundary

Ratroo pages do not import MapLibre, OpenStreetMap, OpenFreeMap, or Google Maps.
They render the components exposed by `MapProvider` in `contracts.ts`.

The `open` adapter owns all MapLibre/OpenStreetMap implementation code. The
`google` adapter is also registered and ready. To switch renderers, set
`NEXT_PUBLIC_MAP_PROVIDER=google` and `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`.

No Rider form, route submission, journey-planning, backend DTO, or database code
changes when the renderer changes. Coordinates remain vendor-neutral WGS84
latitude/longitude values.

Reverse geocoding is a separate server-side dependency. It already supports
`MAP_GEOCODING_PROVIDER=open` and `MAP_GEOCODING_PROVIDER=google`; the latter
uses the server-only `GOOGLE_MAPS_API_KEY`.
