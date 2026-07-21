"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { Map as LMap, Marker as LMarker } from "leaflet";

// Brand-tinted teardrop pin as an inline SVG divIcon — avoids Leaflet's default
// marker PNGs, whose asset paths break under the bundler.
const PIN_HTML =
  '<svg width="28" height="28" viewBox="0 0 24 24" fill="var(--color-brand)" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 1px 1px rgba(0,0,0,.35))"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5" fill="#fff"/></svg>';

/**
 * Small OpenStreetMap/Leaflet map. Interactive mode lets the operator click or
 * drag the pin to set coordinates; read-only mode renders a static location.
 * Leaflet is imported inside the effect so it never runs during SSR.
 */
export function LeafletMap({
  lat,
  lng,
  zoom = 15,
  interactive = false,
  onChange,
  className,
}: {
  lat: number;
  lng: number;
  zoom?: number;
  interactive?: boolean;
  onChange?: (lat: number, lng: number) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LMap | null>(null);
  const markerRef = useRef<LMarker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current, {
        scrollWheelZoom: interactive,
        zoomControl: interactive,
        attributionControl: true,
      }).setView([lat, lng], zoom);
      mapRef.current = map;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);
      const icon = L.divIcon({
        html: PIN_HTML,
        className: "",
        iconSize: [28, 28],
        iconAnchor: [14, 28],
      });
      const marker = L.marker([lat, lng], { draggable: interactive, icon }).addTo(map);
      markerRef.current = marker;
      if (interactive) {
        marker.on("dragend", () => {
          const p = marker.getLatLng();
          onChangeRef.current?.(p.lat, p.lng);
        });
        map.on("click", (e) => {
          marker.setLatLng(e.latlng);
          onChangeRef.current?.(e.latlng.lat, e.latlng.lng);
        });
      }
      // The container often mounts at width 0; recalc once laid out.
      setTimeout(() => map.invalidateSize(), 60);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Map is created once; external coordinate changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mapRef.current && markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
      mapRef.current.setView([lat, lng], mapRef.current.getZoom());
    }
  }, [lat, lng]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ minHeight: 240 }}
      role="img"
      aria-label="Mapa da localização do evento"
    />
  );
}
