import L from 'leaflet';
import React, { useEffect, useRef } from 'react';
import { BENGALURU_BOUNDS, KARNATAKA_BOUNDS } from '@shared/constants';
import type { Complaint, ConstituencyBoundary } from '@shared/types';

function markerColorForStatus(status: Complaint['status']): string {
  switch (status) {
    case 'CONFIRMED RESOLVED':
      return '#15803D'; // Green ONLY when confirmed resolved by citizens
    case 'Acknowledged':
      return '#1D4ED8';
    case 'In progress':
    case 'Fixed, awaiting confirmation':
      return '#D97706';
    case 'Reopened':
      return '#DC2626';
    case 'Unattended':
      return '#7F1D1D';
    case 'Reported':
    case 'Rejected':
    default:
      return '#475569';
  }
}

interface BengaluruMapProps {
  mode: 'picker' | 'feed';
  pinLat?: number;
  pinLng?: number;
  onPinChange?: (lat: number, lng: number) => void;
  complaints?: Complaint[];
  constituencies?: ConstituencyBoundary[];
  onSelectComplaint?: (complaint: Complaint) => void;
  showHeatmap?: boolean;
  heightClass?: string;
}

export const BengaluruMap: React.FC<BengaluruMapProps> = ({
  mode,
  pinLat = KARNATAKA_BOUNDS.centerLat,
  pinLng = KARNATAKA_BOUNDS.centerLng,
  onPinChange,
  complaints = [],
  constituencies = [],
  onSelectComplaint,
  showHeatmap = false,
  heightClass = 'h-72',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const pinMarkerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [pinLat, pinLng],
      zoom: mode === 'picker' ? 14 : 11,
      minZoom: 6,
      maxZoom: 19,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    // Karnataka statewide service area boundary
    L.rectangle(
      [
        [KARNATAKA_BOUNDS.south, KARNATAKA_BOUNDS.west],
        [KARNATAKA_BOUNDS.north, KARNATAKA_BOUNDS.east],
      ],
      {
        color: '#0F2942',
        weight: 2,
        dashArray: '8 5',
        fillOpacity: 0.015,
        interactive: false,
      }
    ).addTo(map);

    // Subtle Bengaluru metro reference rectangle inside Karnataka
    L.rectangle(
      [
        [BENGALURU_BOUNDS.south, BENGALURU_BOUNDS.west],
        [BENGALURU_BOUNDS.north, BENGALURU_BOUNDS.east],
      ],
      {
        color: '#64748B',
        weight: 1,
        dashArray: '4 4',
        fillOpacity: 0.01,
        interactive: false,
      }
    ).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    markerLayerRef.current = layerGroup;

    if (mode === 'picker') {
      const pinIcon = L.divIcon({
        className: 'nagrik-pin-icon',
        html: `<div style="width:28px;height:28px;border-radius:9999px;background:#E67E22;border:3px solid #0F2942;box-shadow:0 2px 8px rgba(15,41,66,0.4);"></div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      const marker = L.marker([pinLat, pinLng], {
        draggable: true,
        icon: pinIcon,
      }).addTo(map);

      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        onPinChange?.(Number(pos.lat.toFixed(6)), Number(pos.lng.toFixed(6)));
      });

      map.on('click', (ev: L.LeafletMouseEvent) => {
        marker.setLatLng(ev.latlng);
        onPinChange?.(
          Number(ev.latlng.lat.toFixed(6)),
          Number(ev.latlng.lng.toFixed(6))
        );
      });

      pinMarkerRef.current = marker;
    }

    mapRef.current = map;
    const resizeTimer = setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      clearTimeout(resizeTimer);
      map.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
      pinMarkerRef.current = null;
    };
  }, [mode]);

  useEffect(() => {
    if (mode === 'picker' && pinMarkerRef.current && mapRef.current) {
      const prev = pinMarkerRef.current.getLatLng();
      const movedFar =
        Math.abs(prev.lat - pinLat) > 0.002 || Math.abs(prev.lng - pinLng) > 0.002;
      pinMarkerRef.current.setLatLng([pinLat, pinLng]);
      if (movedFar) {
        mapRef.current.setView([pinLat, pinLng], Math.max(mapRef.current.getZoom(), 15), {
          animate: true,
        });
      } else {
        mapRef.current.panTo([pinLat, pinLng], { animate: true });
      }
      mapRef.current.invalidateSize();
    }
  }, [mode, pinLat, pinLng]);

  useEffect(() => {
    const layerGroup = markerLayerRef.current;
    if (!layerGroup) return;
    layerGroup.clearLayers();

    // Render subtle constituency boundaries if loaded
    for (const c of constituencies) {
      if (c.polygon && c.polygon.length >= 3) {
        const latLngs = c.polygon.map(([lng, lat]) => [lat, lng] as [number, number]);
        L.polygon(latLngs, {
          color: '#64748B',
          weight: 1,
          fillOpacity: 0.03,
          interactive: false,
        }).addTo(layerGroup);
      } else {
        L.rectangle(
          [
            [c.bounds.south, c.bounds.west],
            [c.bounds.north, c.bounds.east],
          ],
          {
            color: '#64748B',
            weight: 1,
            dashArray: '4 4',
            fillOpacity: 0.02,
            interactive: false,
          }
        ).addTo(layerGroup);
      }
    }

    if (mode === 'feed') {
      if (showHeatmap) {
        for (const item of complaints) {
          L.circle([item.latitude, item.longitude], {
            radius: 320,
            stroke: false,
            fillColor: item.severity === 'Critical' ? '#DC2626' : '#E67E22',
            fillOpacity: 0.28,
            interactive: false,
          }).addTo(layerGroup);
        }
      }

      for (const item of complaints) {
        const color = markerColorForStatus(item.status);
        const circle = L.circleMarker([item.latitude, item.longitude], {
          radius: item.upvoteCount >= 5 ? 11 : item.upvoteCount >= 3 ? 9.5 : 8,
          color: '#FFFFFF',
          weight: 2,
          fillColor: color,
          fillOpacity: 0.92,
        }).addTo(layerGroup);

        circle.bindTooltip(
          `${item.title} (${item.status}) · ${item.upvoteCount} upvotes`,
          { direction: 'top' }
        );
        circle.on('click', () => {
          onSelectComplaint?.(item);
        });
      }
    }
  }, [mode, complaints, constituencies, showHeatmap, onSelectComplaint]);

  return (
    <div
      ref={containerRef}
      className={`w-full ${heightClass} rounded-lg border border-slate-300 bg-slate-100 overflow-hidden`}
      aria-label={mode === 'picker' ? 'Karnataka map location picker' : 'Karnataka civic issues map'}
    />
  );
};
