import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Compass,
  ExternalLink,
  Layers,
  Loader2,
  LocateFixed,
  MapPin,
  Navigation,
  Search,
  X,
} from 'lucide-react';
import {
  BENGALURU_LOCALITIES,
  BENGALURU_LOCALITY_COORDS,
  BENGALURU_WARD_COORDS,
} from '../data/mockCivicData';
import {
  buildOpenStreetMapExternalUrl,
  reverseGeocodeSpot,
  searchBengaluruSpots,
  type PlaceSearchResult,
  type ReverseGeocodeResult,
} from '../services/mapsClient';
import { CivicIncident, IncidentPriority, IncidentStatus } from '../types/civic';
import { CategoryIcon, PriorityText, StatusBadge } from './StatusBadge';

type OsmLayerStyle = 'osm_standard' | 'osm_humanitarian';

const OSM_TILE_LAYERS: Record<
  OsmLayerStyle,
  { url: string; attribution: string; label: string }
> = {
  osm_standard: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    label: 'OSM Street',
  },
  osm_humanitarian: {
    url: 'https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, HOT',
    label: 'OSM Detail',
  },
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createPinIcon(color: string, label?: string, isSelected = false): L.DivIcon {
  const size = isSelected ? 34 : 28;
  const height = isSelected ? 42 : 36;
  const ring = isSelected ? 'box-shadow:0 0 0 4px rgba(16,42,67,0.28);border-radius:9999px;' : '';
  const innerText = label
    ? `<text x="14" y="15.5" text-anchor="middle" fill="#FFFFFF" font-size="9" font-weight="700" font-family="JetBrains Mono, monospace">${escapeHtml(label)}</text>`
    : `<circle cx="14" cy="13" r="4.5" fill="#FFFFFF"/>`;

  return L.divIcon({
    className: 'nagrik-leaflet-pin',
    iconSize: [size, height],
    iconAnchor: [size / 2, height - 2],
    popupAnchor: [0, -height + 6],
    html: `<div style="display:flex;align-items:center;justify-content:center;${ring}">
      <svg width="${size}" height="${height}" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 1C7.37258 1 2 6.37258 2 13C2 21.25 14 34.5 14 34.5C14 34.5 26 21.25 26 13C26 6.37258 20.6274 1 14 1Z" fill="${color}" stroke="#FFFFFF" stroke-width="2"/>
        ${innerText}
      </svg>
    </div>`,
  });
}

function pinColorsForIncident(inc: CivicIncident): { bg: string; label: string } {
  if (inc.status === IncidentStatus.Verified || inc.status === IncidentStatus.Resolved) {
    return { bg: '#168B55', label: 'OK' };
  }
  if (inc.priority === IncidentPriority.Critical) {
    return { bg: '#BA1A1A', label: String(Math.min(99, Math.round(inc.priorityScore))) };
  }
  if (inc.priority === IncidentPriority.High) {
    return { bg: '#D97706', label: String(Math.min(99, Math.round(inc.priorityScore))) };
  }
  return { bg: '#102A43', label: String(Math.min(99, Math.round(inc.priorityScore))) };
}

// -----------------------------------------------------------------------------
// 1. Interactive Spot Picker Map (Leaflet + OpenStreetMap + Nominatim Search)
// -----------------------------------------------------------------------------
interface CivicSpotPickerMapProps {
  latitude: number;
  longitude: number;
  onSelectLocation?: (coords: { lat: number; lng: number }, resolved?: ReverseGeocodeResult) => void;
  readOnly?: boolean;
  heightClass?: string;
  pinLabel?: string;
  secondaryPin?: {
    lat: number;
    lng: number;
    label: string;
  };
  externalResolved?: ReverseGeocodeResult | null;
  showSearch?: boolean;
  showResolvedPanel?: boolean;
}

export const CivicSpotPickerMap: React.FC<CivicSpotPickerMapProps> = ({
  latitude,
  longitude,
  onSelectLocation,
  readOnly = false,
  heightClass = 'h-[300px]',
  pinLabel = 'Incident Spot',
  secondaryPin,
  externalResolved,
  showSearch = true,
  showResolvedPanel = true,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const primaryMarkerRef = useRef<L.Marker | null>(null);
  const secondaryMarkerRef = useRef<L.Marker | null>(null);
  const lineRef = useRef<L.Polyline | null>(null);

  const [layerStyle, setLayerStyle] = useState<OsmLayerStyle>('osm_standard');
  const [searchText, setSearchText] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSearchResult[]>([]);
  const [searchingPlaces, setSearchingPlaces] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsNotice, setGpsNotice] = useState<string | null>(null);
  const [resolvedInfo, setResolvedInfo] = useState<ReverseGeocodeResult | null>(
    externalResolved ?? null
  );

  const onSelectLocationRef = useRef(onSelectLocation);
  onSelectLocationRef.current = onSelectLocation;

  useEffect(() => {
    if (externalResolved) {
      setResolvedInfo(externalResolved);
    }
  }, [externalResolved]);

  const lastGeocodedRef = useRef<string>('');
  const resolveCoordinates = useCallback(
    async (lat: number, lng: number, notifyParent: boolean) => {
      const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
      if (lastGeocodedRef.current === key && !notifyParent) return;
      lastGeocodedRef.current = key;
      setResolving(true);
      try {
        const res = await reverseGeocodeSpot(lat, lng);
        setResolvedInfo(res);
        if (notifyParent && onSelectLocationRef.current) {
          onSelectLocationRef.current({ lat, lng }, res);
        }
      } catch {
        if (notifyParent && onSelectLocationRef.current) {
          onSelectLocationRef.current({ lat, lng });
        }
      } finally {
        setResolving(false);
      }
    },
    []
  );

  // Debounced OSM Nominatim Spot Search
  useEffect(() => {
    const trimmed = searchText.trim();
    if (!showSearch || readOnly || trimmed.length < 2) {
      setSuggestions([]);
      setSearchingPlaces(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearchingPlaces(true);
      try {
        const results = await searchBengaluruSpots(trimmed);
        if (!cancelled) setSuggestions(results);
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setSearchingPlaces(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchText, showSearch, readOnly]);

  // Initialize Leaflet Map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [latitude, longitude],
      zoom: 16,
      zoomControl: true,
    });

    const layerConf = OSM_TILE_LAYERS[layerStyle];
    const tileLayer = L.tileLayer(layerConf.url, {
      attribution: layerConf.attribution,
      maxZoom: 19,
    }).addTo(map);

    const primaryMarker = L.marker([latitude, longitude], {
      draggable: !readOnly,
      icon: createPinIcon('#BA1A1A', undefined, true),
      title: pinLabel,
    }).addTo(map);

    primaryMarker.bindPopup(
      `<div style="font-size:12px;font-weight:600;color:#0A1D2B;">${escapeHtml(pinLabel)}</div>`
    );

    if (!readOnly) {
      primaryMarker.on('dragend', () => {
        const pos = primaryMarker.getLatLng();
        const lat = Number(pos.lat.toFixed(6));
        const lng = Number(pos.lng.toFixed(6));
        void resolveCoordinates(lat, lng, true);
      });

      map.on('click', (ev: L.LeafletMouseEvent) => {
        const lat = Number(ev.latlng.lat.toFixed(6));
        const lng = Number(ev.latlng.lng.toFixed(6));
        primaryMarker.setLatLng([lat, lng]);
        void resolveCoordinates(lat, lng, true);
      });
    }

    mapRef.current = map;
    tileLayerRef.current = tileLayer;
    primaryMarkerRef.current = primaryMarker;

    const ro = new ResizeObserver(() => {
      map.invalidateSize();
    });
    ro.observe(containerRef.current);
    const t = window.setTimeout(() => map.invalidateSize(), 150);

    return () => {
      window.clearTimeout(t);
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      tileLayerRef.current = null;
      primaryMarkerRef.current = null;
      secondaryMarkerRef.current = null;
      lineRef.current = null;
    };
  }, [readOnly]);

  // Swap OSM tile layer when toggled
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }
    const conf = OSM_TILE_LAYERS[layerStyle];
    tileLayerRef.current = L.tileLayer(conf.url, {
      attribution: conf.attribution,
      maxZoom: 19,
    }).addTo(map);
  }, [layerStyle]);

  // Sync marker position, secondary comparison pin, and camera
  useEffect(() => {
    const map = mapRef.current;
    const primary = primaryMarkerRef.current;
    if (!map || !primary) return;

    primary.setLatLng([latitude, longitude]);
    primary.setPopupContent(
      `<div style="font-size:12px;font-weight:600;color:#0A1D2B;">${escapeHtml(pinLabel)}</div>`
    );

    if (secondaryMarkerRef.current) {
      map.removeLayer(secondaryMarkerRef.current);
      secondaryMarkerRef.current = null;
    }
    if (lineRef.current) {
      map.removeLayer(lineRef.current);
      lineRef.current = null;
    }

    if (secondaryPin) {
      const sec = L.marker([secondaryPin.lat, secondaryPin.lng], {
        icon: createPinIcon('#168B55', 'OG'),
        title: secondaryPin.label,
      }).addTo(map);
      sec.bindPopup(
        `<div style="font-size:12px;font-weight:600;color:#168B55;">${escapeHtml(secondaryPin.label)}</div>`
      );
      secondaryMarkerRef.current = sec;

      lineRef.current = L.polyline(
        [
          [latitude, longitude],
          [secondaryPin.lat, secondaryPin.lng],
        ],
        {
          color: '#102A43',
          weight: 2,
          dashArray: '5, 5',
          opacity: 0.75,
        }
      ).addTo(map);

      const bounds = L.latLngBounds([
        [latitude, longitude],
        [secondaryPin.lat, secondaryPin.lng],
      ]);
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 17 });
    } else {
      map.panTo([latitude, longitude], { animate: true });
    }

    void resolveCoordinates(latitude, longitude, false);
  }, [latitude, longitude, pinLabel, secondaryPin, resolveCoordinates]);

  const handlePickPlaceSuggestion = async (item: PlaceSearchResult) => {
    setSuggestions([]);
    setSearchText('');
    setGpsNotice(null);
    mapRef.current?.setView([item.lat, item.lng], 17, { animate: true });
    primaryMarkerRef.current?.setLatLng([item.lat, item.lng]);
    setResolving(true);
    try {
      const geo = await reverseGeocodeSpot(item.lat, item.lng);
      const merged: ReverseGeocodeResult = {
        ...geo,
        specificSpot: item.mainText || geo.specificSpot,
        area: item.area || geo.area,
        formattedAddress: item.displayName || geo.formattedAddress,
      };
      setResolvedInfo(merged);
      if (onSelectLocationRef.current) {
        onSelectLocationRef.current({ lat: item.lat, lng: item.lng }, merged);
      }
    } catch {
      if (onSelectLocationRef.current) {
        onSelectLocationRef.current({ lat: item.lat, lng: item.lng });
      }
    } finally {
      setResolving(false);
    }
  };

  const handleMapGpsCapture = () => {
    if (readOnly) return;
    setGpsNotice(null);
    if (!navigator.geolocation) {
      setGpsNotice('Geolocation unavailable in this browser — click map or search Bengaluru spots.');
      return;
    }
    setGpsBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsBusy(false);
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        mapRef.current?.setView([lat, lng], 17, { animate: true });
        primaryMarkerRef.current?.setLatLng([lat, lng]);
        setGpsNotice(`GPS locked (±${Math.round(pos.coords.accuracy)}m)`);
        void resolveCoordinates(lat, lng, true);
      },
      (err) => {
        setGpsBusy(false);
        const msg = (err.message || '').toLowerCase();
        setGpsNotice(
          msg.includes('permissions policy') || msg.includes('disabled in this document')
            ? 'Preview frame blocks live GPS — click map, search spot, or drag red pin.'
            : 'GPS signal unavailable — click map, search spot, or drag red pin.'
        );
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  return (
    <div className="flex flex-col gap-2.5">
      {/* OpenStreetMap Nominatim Spot Search */}
      {showSearch && !readOnly && (
        <div className="relative">
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-3 h-4 w-4 text-[#52606D]" />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search Bengaluru spot, road, metro station, landmark, or area..."
              className="civic-input h-11 w-full rounded border border-[#CBD5E1] bg-white pl-9 pr-20 text-xs font-medium text-[#0A1D2B] placeholder:text-[#74777E]"
            />
            {searchingPlaces && (
              <Loader2 className="absolute right-3 h-4 w-4 animate-spin text-[#102A43]" />
            )}
          </div>

          {suggestions.length > 0 && (
            <ul className="absolute left-0 right-0 top-12 z-[400] max-h-60 divide-y divide-[#E2E8F0] overflow-y-auto rounded border border-[#CBD5E1] bg-white civic-shadow-2">
              {suggestions.map((sug, idx) => (
                <li key={`${sug.lat}-${sug.lng}-${idx}`}>
                  <button
                    type="button"
                    onClick={() => handlePickPlaceSuggestion(sug)}
                    className="flex w-full cursor-pointer items-start gap-2.5 px-3 py-2.5 text-left text-xs hover:bg-[#ECF4FF]"
                  >
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#102A43]" />
                    <div className="min-w-0">
                      <div className="font-semibold text-[#0A1D2B]">{sug.mainText}</div>
                      {sug.secondaryText && (
                        <div className="truncate text-[11px] text-[#52606D]">
                          {sug.secondaryText}
                        </div>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Interactive Leaflet + OpenStreetMap Canvas */}
      <div
        className={`relative w-full overflow-hidden rounded-lg border border-[#CBD5E1] bg-[#E8EEF5] ${heightClass}`}
      >
        <div ref={containerRef} className="h-full w-full" />

        {/* Map Toolbar Overlay */}
        <div className="pointer-events-none absolute left-12 right-2.5 top-2.5 z-[350] flex flex-wrap items-center justify-between gap-2">
          <div className="pointer-events-auto rounded border border-[#102A43]/20 bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-[#102A43] civic-shadow-1">
            {readOnly
              ? `Pinned Spot (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`
              : 'Click OpenStreetMap or drag red pin'}
          </div>
          <div className="pointer-events-auto flex items-center gap-1.5">
            {!readOnly && (
              <button
                type="button"
                onClick={handleMapGpsCapture}
                disabled={gpsBusy}
                className="inline-flex h-7 cursor-pointer items-center gap-1 rounded border border-[#102A43]/25 bg-white/95 px-2.5 text-[11px] font-semibold text-[#102A43] hover:bg-[#ECF4FF] civic-shadow-1"
              >
                <Compass className="h-3 w-3 text-[#168B55]" />
                {gpsBusy ? 'Locating...' : 'My GPS'}
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                setLayerStyle((prev) =>
                  prev === 'osm_standard' ? 'osm_humanitarian' : 'osm_standard'
                )
              }
              className="inline-flex h-7 cursor-pointer items-center gap-1 rounded border border-[#102A43]/25 bg-white/95 px-2.5 text-[11px] font-semibold text-[#102A43] hover:bg-[#ECF4FF] civic-shadow-1"
            >
              <Layers className="h-3 w-3" />
              {layerStyle === 'osm_standard' ? 'Detail Tiles' : 'Street Tiles'}
            </button>
          </div>
        </div>
      </div>

      {gpsNotice && (
        <div className="rounded border border-[#102A43]/15 bg-[#ECF4FF] px-3 py-1.5 text-[11px] font-medium text-[#102A43]">
          {gpsNotice}
        </div>
      )}

      {/* Complete Location Details Card */}
      {showResolvedPanel && (
        <div className="rounded border border-[#102A43]/15 bg-white p-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] pb-2">
            <span className="inline-flex items-center gap-1.5 font-bold uppercase tracking-[0.04em] text-[#102A43]">
              <LocateFixed className="h-3.5 w-3.5 text-[#168B55]" />
              Complete Resolved Location (OpenStreetMap)
            </span>
            <div className="flex items-center gap-2">
              {resolving && (
                <span className="inline-flex items-center gap-1 text-[11px] text-[#52606D]">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Resolving spot...
                </span>
              )}
              <a
                href={buildOpenStreetMapExternalUrl(latitude, longitude)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#102A43] hover:underline"
              >
                OpenStreetMap
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>

          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-[0.04em] text-[#52606D]">
                Specific Spot / Landmark
              </span>
              <div className="font-semibold text-[#0A1D2B]">
                {resolvedInfo?.specificSpot || 'Resolving specific spot...'}
              </div>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-[0.04em] text-[#52606D]">
                Area / Neighborhood
              </span>
              <div className="font-semibold text-[#0A1D2B]">
                {resolvedInfo?.area || resolvedInfo?.matchedLocality || 'Bengaluru'}
                {resolvedInfo?.postalCode ? ` · PIN ${resolvedInfo.postalCode}` : ''}
              </div>
            </div>
          </div>

          <div className="mt-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.04em] text-[#52606D]">
              Full Street Address
            </span>
            <div className="text-[#253746]">
              {resolvedInfo?.formattedAddress ||
                `${latitude.toFixed(5)}, ${longitude.toFixed(5)} (Bengaluru)`}
            </div>
          </div>

          <div className="mt-1.5 font-mono-tabular text-[11px] text-[#52606D]">
            Lat/Lng: {latitude.toFixed(5)}, {longitude.toFixed(5)}
          </div>

          {!readOnly && resolvedInfo && resolvedInfo.nearbyLandmarks.length > 0 && (
            <div className="mt-2.5 border-t border-[#E2E8F0] pt-2">
              <div className="text-[10px] font-bold uppercase tracking-[0.04em] text-[#52606D]">
                Nearby OSM Spots (Click to Snap Pin)
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {resolvedInfo.nearbyLandmarks.map((lm, idx) => (
                  <button
                    key={`${lm.name}-${idx}`}
                    type="button"
                    onClick={() => {
                      if (lm.lat !== undefined && lm.lng !== undefined) {
                        const lat = Number(lm.lat.toFixed(6));
                        const lng = Number(lm.lng.toFixed(6));
                        mapRef.current?.setView([lat, lng], 17, { animate: true });
                        primaryMarkerRef.current?.setLatLng([lat, lng]);
                        void resolveCoordinates(lat, lng, true);
                      }
                    }}
                    className="inline-flex cursor-pointer items-center gap-1 rounded border border-[#CBD5E1] bg-[#F5F7FA] px-2 py-1 text-[11px] font-medium text-[#102A43] hover:border-[#102A43] hover:bg-[#ECF4FF]"
                  >
                    <Navigation className="h-3 w-3 text-[#168B55]" />
                    <span>{lm.name}</span>
                    {lm.distanceMeters > 0 && (
                      <span className="font-mono-tabular text-[10px] text-[#52606D]">
                        ({lm.distanceMeters}m)
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// -----------------------------------------------------------------------------
// 2. Interactive Multi-Marker Bengaluru Civic Map (Locality Filter + Details)
// -----------------------------------------------------------------------------
interface CivicIncidentsLiveMapProps {
  incidents: CivicIncident[];
  selectedWard: number | null;
  onSelectIncident?: (incident: CivicIncident) => void;
  actionLabel?: string;
  heightClass?: string;
}

export const CivicIncidentsLiveMap: React.FC<CivicIncidentsLiveMapProps> = ({
  incidents,
  selectedWard,
  onSelectIncident,
  actionLabel = 'Inspect Ticket',
  heightClass = 'h-[360px]',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  const [layerStyle, setLayerStyle] = useState<OsmLayerStyle>('osm_standard');
  const [selectedLocality, setSelectedLocality] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'RESOLVED'>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fitTrigger, setFitTrigger] = useState(0);

  // Combine standard Bengaluru localities with any additional localities in live tickets
  const localityOptions = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const inc of incidents) {
      if (inc.isMergedDuplicate) continue;
      if (selectedWard !== null && inc.wardNumber !== selectedWard) continue;
      const loc = (inc.locality || '').trim();
      if (!loc) continue;
      counts[loc] = (counts[loc] || 0) + 1;
    }
    const merged = Array.from(
      new Set([...BENGALURU_LOCALITIES, ...Object.keys(counts)])
    );
    return merged.map((name) => ({
      name,
      count: counts[name] || 0,
    }));
  }, [incidents, selectedWard]);

  const visibleIncidents = useMemo(() => {
    return incidents.filter((i) => {
      if (i.isMergedDuplicate) return false;
      if (selectedWard !== null && i.wardNumber !== selectedWard) return false;
      if (
        selectedLocality !== 'ALL' &&
        !i.locality.toLowerCase().includes(selectedLocality.toLowerCase()) &&
        !i.address.toLowerCase().includes(selectedLocality.toLowerCase())
      ) {
        return false;
      }
      const isClosed =
        i.status === IncidentStatus.Resolved || i.status === IncidentStatus.Verified;
      if (statusFilter === 'ACTIVE' && isClosed) return false;
      if (statusFilter === 'RESOLVED' && !isClosed) return false;
      return Number.isFinite(i.latitude) && Number.isFinite(i.longitude) && i.latitude !== 0;
    });
  }, [incidents, selectedWard, selectedLocality, statusFilter]);

  const activeIncident = useMemo(
    () => visibleIncidents.find((i) => i.id === selectedId) ?? null,
    [visibleIncidents, selectedId]
  );

  // Initialize Leaflet Map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [12.9716, 77.5946],
      zoom: 12,
      zoomControl: true,
    });

    const conf = OSM_TILE_LAYERS[layerStyle];
    const tileLayer = L.tileLayer(conf.url, {
      attribution: conf.attribution,
      maxZoom: 19,
    }).addTo(map);

    const markersLayer = L.layerGroup().addTo(map);
    map.on('click', () => setSelectedId(null));

    mapRef.current = map;
    tileLayerRef.current = tileLayer;
    markersLayerRef.current = markersLayer;

    const ro = new ResizeObserver(() => {
      map.invalidateSize();
    });
    ro.observe(containerRef.current);
    const t = window.setTimeout(() => map.invalidateSize(), 150);

    return () => {
      window.clearTimeout(t);
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      tileLayerRef.current = null;
      markersLayerRef.current = null;
    };
  }, []);

  // Swap tile layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }
    const conf = OSM_TILE_LAYERS[layerStyle];
    tileLayerRef.current = L.tileLayer(conf.url, {
      attribution: conf.attribution,
      maxZoom: 19,
    }).addTo(map);
  }, [layerStyle]);

  // Render complaint markers whenever filtered list or selection changes
  useEffect(() => {
    const layer = markersLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    for (const inc of visibleIncidents) {
      const { bg, label } = pinColorsForIncident(inc);
      const isSel = inc.id === selectedId;
      const marker = L.marker([inc.latitude, inc.longitude], {
        icon: createPinIcon(bg, label, isSel),
        title: `${inc.id} — ${inc.title}`,
        zIndexOffset: isSel ? 500 : Math.round(inc.priorityScore),
      });

      marker.bindTooltip(
        `<div style="font-size:11px;font-weight:600;">${escapeHtml(inc.id)} · ${escapeHtml(inc.title)}</div>`,
        { direction: 'top', offset: [0, -28] }
      );

      marker.on('click', (ev) => {
        L.DomEvent.stopPropagation(ev);
        setSelectedId(inc.id);
      });

      marker.addTo(layer);
    }
  }, [visibleIncidents, selectedId]);

  // Fit bounds or pan to ward/locality when filters or fit button change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (visibleIncidents.length === 1) {
      map.setView([visibleIncidents[0].latitude, visibleIncidents[0].longitude], 15, {
        animate: true,
      });
      return;
    }

    if (visibleIncidents.length > 1) {
      const bounds = L.latLngBounds(
        visibleIncidents.map((i) => [i.latitude, i.longitude] as [number, number])
      );
      map.fitBounds(bounds, { padding: [44, 44], maxZoom: 15 });
      return;
    }

    if (selectedLocality !== 'ALL' && BENGALURU_LOCALITY_COORDS[selectedLocality]) {
      const c = BENGALURU_LOCALITY_COORDS[selectedLocality];
      map.setView([c.lat, c.lng], 14, { animate: true });
      return;
    }

    if (selectedWard !== null && BENGALURU_WARD_COORDS[selectedWard]) {
      const c = BENGALURU_WARD_COORDS[selectedWard];
      map.setView([c.lat, c.lng], 13, { animate: true });
      return;
    }

    map.setView([12.9716, 77.5946], 12, { animate: true });
  }, [visibleIncidents.length, selectedLocality, selectedWard, fitTrigger]);

  return (
    <div className="flex flex-col gap-3">
      {/* Locality & Status Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-[#E2E8F0] bg-[#F5F7FA] p-2">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#52606D]">
            Locality:
          </label>
          <select
            value={selectedLocality}
            onChange={(e) => {
              setSelectedLocality(e.target.value);
              setSelectedId(null);
            }}
            aria-label="Filter Bengaluru map by locality"
            className="civic-input h-8 rounded border border-[#CBD5E1] bg-white px-2.5 text-xs font-semibold text-[#0A1D2B]"
          >
            <option value="ALL">All Bengaluru Localities ({incidents.filter((i) => !i.isMergedDuplicate).length})</option>
            {localityOptions.map((loc) => (
              <option key={loc.name} value={loc.name}>
                {loc.name} {loc.count > 0 ? `(${loc.count})` : ''}
              </option>
            ))}
          </select>

          <div className="inline-flex rounded border border-[#CBD5E1] bg-white p-0.5">
            {(
              [
                { id: 'ALL', label: 'All' },
                { id: 'ACTIVE', label: 'Active' },
                { id: 'RESOLVED', label: 'Resolved' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`h-7 cursor-pointer rounded-sm px-2.5 text-[11px] font-semibold ${
                  statusFilter === tab.id
                    ? 'bg-[#102A43] text-white'
                    : 'text-[#43474D] hover:text-[#0A1D2B]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {selectedLocality !== 'ALL' && (
            <button
              type="button"
              onClick={() => setSelectedLocality('ALL')}
              className="inline-flex h-8 cursor-pointer items-center gap-1 rounded border border-[#102A43]/25 bg-white px-2.5 text-[11px] font-semibold text-[#102A43] hover:bg-[#ECF4FF]"
            >
              Reset Locality
            </button>
          )}
          <span className="font-mono-tabular text-[11px] font-semibold text-[#102A43]">
            {visibleIncidents.length} marker{visibleIncidents.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      {/* Interactive Leaflet Map Canvas */}
      <div
        className={`relative w-full overflow-hidden rounded-lg border border-[#CBD5E1] bg-[#E8EEF5] ${heightClass}`}
      >
        <div ref={containerRef} className="h-full w-full" />

        {/* Map Controls Overlay */}
        <div className="pointer-events-none absolute left-12 top-2.5 z-[350] flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFitTrigger((c) => c + 1)}
            className="pointer-events-auto inline-flex h-7 cursor-pointer items-center gap-1 rounded border border-[#102A43]/20 bg-white/95 px-2.5 text-[11px] font-semibold text-[#102A43] hover:bg-[#ECF4FF] civic-shadow-1"
          >
            <LocateFixed className="h-3 w-3" />
            Fit {visibleIncidents.length} Pin{visibleIncidents.length === 1 ? '' : 's'}
          </button>
          <button
            type="button"
            onClick={() =>
              setLayerStyle((prev) =>
                prev === 'osm_standard' ? 'osm_humanitarian' : 'osm_standard'
              )
            }
            className="pointer-events-auto inline-flex h-7 cursor-pointer items-center gap-1 rounded border border-[#102A43]/20 bg-white/95 px-2.5 text-[11px] font-semibold text-[#102A43] hover:bg-[#ECF4FF] civic-shadow-1"
          >
            <Layers className="h-3 w-3" />
            {layerStyle === 'osm_standard' ? 'Detail Tiles' : 'Street Tiles'}
          </button>
        </div>
      </div>

      {/* Selected Complaint Details Panel (Populated on Marker Click) */}
      {activeIncident && (
        <div className="rounded-lg border border-[#102A43]/20 bg-white p-4 civic-shadow-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              {activeIncident.photoDataUrl && (
                <img
                  src={activeIncident.photoDataUrl}
                  alt={activeIncident.title}
                  className="h-20 w-24 shrink-0 rounded border border-[#E2E8F0] object-cover"
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-mono-tabular font-bold text-[#102A43]">
                    {activeIncident.id}
                  </span>
                  <StatusBadge status={activeIncident.status} />
                  <PriorityText priority={activeIncident.priority} />
                  <span className="font-mono-tabular text-[11px] font-bold text-[#102A43]">
                    Score {activeIncident.priorityScore}/100
                  </span>
                </div>
                <h3 className="mt-1 font-display text-sm font-bold text-[#0A1D2B]">
                  {activeIncident.title}
                </h3>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-[#253746]">
                  <CategoryIcon category={activeIncident.confirmedCategory} className="h-3.5 w-3.5 text-[#102A43]" />
                  <span className="font-semibold">{activeIncident.confirmedCategory}</span>
                  <span>·</span>
                  <span>{activeIncident.supportCount} supports</span>
                </div>
                <div className="mt-1 text-xs text-[#253746]">
                  <strong>Spot / Address:</strong> {activeIncident.address}
                </div>
                <div className="text-[11px] text-[#52606D]">
                  <strong>Area:</strong> {activeIncident.locality} · Ward 0
                  {activeIncident.wardNumber} ({activeIncident.wardName}) ·{' '}
                  <span className="font-mono-tabular">
                    {activeIncident.latitude.toFixed(5)}, {activeIncident.longitude.toFixed(5)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <a
                href={buildOpenStreetMapExternalUrl(
                  activeIncident.latitude,
                  activeIncident.longitude
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center gap-1 rounded border border-[#CBD5E1] bg-white px-3 text-xs font-semibold text-[#102A43] hover:bg-[#ECF4FF]"
              >
                OSM Link
                <ExternalLink className="h-3 w-3" />
              </a>
              {onSelectIncident && (
                <button
                  type="button"
                  onClick={() => onSelectIncident(activeIncident)}
                  className="h-9 cursor-pointer rounded bg-[#102A43] px-3.5 text-xs font-semibold text-white hover:bg-[#0B1D2F]"
                >
                  {actionLabel}
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                aria-label="Close complaint map preview"
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded border border-[#CBD5E1] text-[#52606D] hover:bg-[#F5F7FA]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live Map Legend */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#52606D]">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#BA1A1A]" />
            Critical
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#D97706]" />
            High Priority
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#102A43]" />
            Standard Active
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#168B55]" />
            Resolved / Verified
          </span>
        </div>
        <span className="font-mono-tabular">
          Powered by Leaflet &amp; OpenStreetMap · Click any marker for full details
        </span>
      </div>
    </div>
  );
};
