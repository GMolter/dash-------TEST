import { Crosshair, Loader2, LocateFixed, MapPin, Minus, Plus, Search } from 'lucide-react';
import { KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Coordinates } from '../features/classdash/model';

const TILE_SIZE = 256;
const DEFAULT_CENTER = { lat: 39.1688, lng: -86.5186 };
const GEOCODER_URL = import.meta.env.VITE_CLASSDASH_GEOCODER_URL || 'https://nominatim.openstreetmap.org/search';
const SEARCH_CACHE_PREFIX = 'classdash-place-search:';
let lastGeocoderRequestAt = 0;

type PlaceResult = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
};

function longitudeToPixel(longitude: number, zoom: number) {
  return ((longitude + 180) / 360) * TILE_SIZE * 2 ** zoom;
}

function latitudeToPixel(latitude: number, zoom: number) {
  const sin = Math.sin((Math.max(-85.0511, Math.min(85.0511, latitude)) * Math.PI) / 180);
  return (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * TILE_SIZE * 2 ** zoom;
}

function pixelToLongitude(pixel: number, zoom: number) {
  return (pixel / (TILE_SIZE * 2 ** zoom)) * 360 - 180;
}

function pixelToLatitude(pixel: number, zoom: number) {
  const y = 0.5 - pixel / (TILE_SIZE * 2 ** zoom);
  return (90 - (360 * Math.atan(Math.exp(-y * 2 * Math.PI))) / Math.PI);
}

export function MapLocationPicker({
  value,
  onChange,
  onPlaceSelected,
  label,
}: {
  value: Coordinates | null;
  onChange: (coordinates: Coordinates) => void;
  onPlaceSelected?: (placeName: string) => void;
  label: string;
}) {
  const [center, setCenter] = useState<Coordinates>(value || DEFAULT_CENTER);
  const [zoom, setZoom] = useState(16);
  const [locationError, setLocationError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const mapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const height = 280;

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const updateWidth = () => setWidth(map.getBoundingClientRect().width || 720);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(map);
    return () => observer.disconnect();
  }, []);

  const tiles = useMemo(() => {
    const centerX = longitudeToPixel(center.lng, zoom);
    const centerY = latitudeToPixel(center.lat, zoom);
    const minTileX = Math.floor((centerX - width / 2) / TILE_SIZE);
    const maxTileX = Math.floor((centerX + width / 2) / TILE_SIZE);
    const minTileY = Math.floor((centerY - height / 2) / TILE_SIZE);
    const maxTileY = Math.floor((centerY + height / 2) / TILE_SIZE);
    const nextTiles = [];
    for (let x = minTileX; x <= maxTileX; x += 1) {
      for (let y = minTileY; y <= maxTileY; y += 1) {
        nextTiles.push({
          x,
          y,
          left: x * TILE_SIZE - (centerX - width / 2),
          top: y * TILE_SIZE - (centerY - height / 2),
        });
      }
    }
    return nextTiles;
  }, [center, width, zoom]);

  const markerPosition = value ? {
    left: longitudeToPixel(value.lng, zoom) - (longitudeToPixel(center.lng, zoom) - width / 2),
    top: latitudeToPixel(value.lat, zoom) - (latitudeToPixel(center.lat, zoom) - height / 2),
  } : null;

  const choosePoint = (clientX: number, clientY: number, bounds: DOMRect) => {
    const worldX = longitudeToPixel(center.lng, zoom) - bounds.width / 2 + (clientX - bounds.left);
    const worldY = latitudeToPixel(center.lat, zoom) - bounds.height / 2 + (clientY - bounds.top);
    const coordinates = {
      lat: pixelToLatitude(worldY, zoom),
      lng: pixelToLongitude(worldX, zoom),
    };
    setCenter(coordinates);
    onChange(coordinates);
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Location access is not supported by this browser.');
      return;
    }
    setLocationError('');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const coordinates = { lat: coords.latitude, lng: coords.longitude };
        setCenter(coordinates);
        onChange(coordinates);
      },
      () => setLocationError('Your location could not be read. You can still click the map.'),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const searchPlaces = async () => {
    const query = searchQuery.trim();
    if (query.length < 2) {
      setSearchError('Enter at least two characters.');
      return;
    }

    setSearching(true);
    setSearchError('');
    try {
      const cacheKey = `${SEARCH_CACHE_PREFIX}${query.toLocaleLowerCase()}`;
      let cached: string | null = null;
      try {
        cached = window.sessionStorage.getItem(cacheKey);
      } catch {
        // Search still works when browser storage is unavailable.
      }
      if (cached) {
        setSearchResults(JSON.parse(cached) as PlaceResult[]);
        return;
      }

      const throttleDelay = Math.max(0, 1_000 - (Date.now() - lastGeocoderRequestAt));
      if (throttleDelay > 0) await new Promise((resolve) => window.setTimeout(resolve, throttleDelay));
      const requestUrl = new URL(GEOCODER_URL);
      requestUrl.searchParams.set('q', query);
      requestUrl.searchParams.set('format', 'jsonv2');
      requestUrl.searchParams.set('limit', '5');
      requestUrl.searchParams.set('addressdetails', '0');
      requestUrl.searchParams.set('accept-language', navigator.language || 'en');
      lastGeocoderRequestAt = Date.now();
      const response = await fetch(requestUrl, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`Search returned ${response.status}`);
      const results = (await response.json()) as PlaceResult[];
      try {
        window.sessionStorage.setItem(cacheKey, JSON.stringify(results));
      } catch {
        // Caching is best-effort in hardened/private browsing modes.
      }
      setSearchResults(results);
      if (results.length === 0) setSearchError('No matching places found. Try adding a city or state.');
    } catch {
      setSearchError('Place search is temporarily unavailable. You can still click the map to place the pin.');
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const selectPlace = (place: PlaceResult) => {
    const coordinates = { lat: Number(place.lat), lng: Number(place.lon) };
    setCenter(coordinates);
    onChange(coordinates);
    onPlaceSelected?.(place.display_name);
    setSearchQuery(place.display_name);
    setSearchResults([]);
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-200"><MapPin className="h-4 w-4 text-indigo-300" />{label}</div>
        <button type="button" onClick={useCurrentLocation} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs text-slate-200 hover:bg-white/[0.09]">
          <LocateFixed className="h-3.5 w-3.5" /> Use my location
        </button>
      </div>
      <div className="relative mb-3">
        <div className="flex gap-2">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search OpenStreetMap places</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                event.stopPropagation();
                void searchPlaces();
              }}
              placeholder="Search a building, dorm, or address"
              className="w-full rounded-xl border border-white/10 bg-slate-950/60 py-3 pl-10 pr-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-300/40"
            />
          </label>
          <button type="button" onClick={() => void searchPlaces()} disabled={searching} className="inline-flex min-w-24 items-center justify-center gap-2 rounded-xl border border-violet-300/25 bg-violet-400/10 px-4 text-sm font-semibold text-violet-100 hover:bg-violet-400/20 disabled:opacity-60">
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Search
          </button>
        </div>
        {searchResults.length > 0 && (
          <div className="absolute z-30 mt-2 max-h-64 w-full overflow-y-auto rounded-2xl border border-white/15 bg-slate-950/95 p-2 shadow-2xl backdrop-blur-xl">
            {searchResults.map((place) => (
              <button key={place.place_id} type="button" onClick={() => selectPlace(place)} className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left hover:bg-white/[0.07]">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
                <span><span className="block text-sm text-slate-100">{place.display_name}</span>{place.type && <span className="mt-1 block text-[11px] uppercase tracking-wider text-slate-500">{place.type.replace(/_/g, ' ')}</span>}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {searchError && <p className="mb-3 text-xs text-amber-200">{searchError}</p>}
      <div
        ref={mapRef}
        className="relative h-[280px] w-full cursor-crosshair overflow-hidden rounded-2xl border border-white/10 bg-slate-800"
        onClick={(event) => choosePoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect())}
        role="application"
        aria-label={`${label}. Click the map to place the pin.`}
      >
        {tiles.map((tile) => (
          <img
            key={`${zoom}-${tile.x}-${tile.y}`}
            src={`https://tile.openstreetmap.org/${zoom}/${tile.x}/${tile.y}.png`}
            alt=""
            draggable={false}
            className="pointer-events-none absolute h-64 w-64 select-none"
            style={{ left: tile.left, top: tile.top }}
          />
        ))}
        <div className="pointer-events-none absolute inset-0 bg-slate-950/5" />
        {markerPosition && markerPosition.left >= 0 && markerPosition.left <= width && markerPosition.top >= 0 && markerPosition.top <= height && (
          <MapPin
            className="pointer-events-none absolute h-9 w-9 -translate-x-1/2 -translate-y-full fill-indigo-500 text-white drop-shadow-xl"
            style={{ left: markerPosition.left, top: markerPosition.top }}
          />
        )}
        {!value && <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><span className="rounded-full bg-slate-950/80 px-4 py-2 text-sm text-white shadow-xl">Click to place a pin</span></div>}
        <div className="absolute bottom-3 right-3 flex flex-col overflow-hidden rounded-xl border border-slate-400/30 bg-slate-950/90 shadow-xl">
          <button type="button" className="p-2 text-white hover:bg-white/10" onClick={(event) => { event.stopPropagation(); setZoom((current) => Math.min(19, current + 1)); }} aria-label="Zoom in"><Plus className="h-4 w-4" /></button>
          <button type="button" className="border-t border-white/10 p-2 text-white hover:bg-white/10" onClick={(event) => { event.stopPropagation(); setZoom((current) => Math.max(12, current - 1)); }} aria-label="Zoom out"><Minus className="h-4 w-4" /></button>
        </div>
        <Crosshair className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-white drop-shadow" />
        <a className="absolute bottom-1 left-2 rounded bg-white/80 px-1 text-[10px] text-slate-900" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>© OpenStreetMap</a>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <span>{value ? `${value.lat.toFixed(6)}, ${value.lng.toFixed(6)}` : 'No pin selected'}</span>
        <span>Click anywhere to move the pin · Search queries are sent to OpenStreetMap; don’t enter private information.</span>
      </div>
      {locationError && <p className="mt-2 text-xs text-amber-200">{locationError}</p>}
    </div>
  );
}
