'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix Leaflet default icon paths broken by webpack/Next.js bundling
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

interface NearbyUser {
  id: string
  name: string
  latitude: number
  longitude: number
}

interface MapViewProps {
  center: [number, number] | null
  nearbyUsers: NearbyUser[]
  geoError: string | null
}

export default function MapView({ center, nearbyUsers, geoError }: MapViewProps) {
  const mapRef = useRef<L.Map | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const markersRef = useRef<L.LayerGroup | null>(null)
  const circleRef = useRef<L.Circle | null>(null)
  const selfMarkerRef = useRef<L.Marker | null>(null)

  // Initialize map once when center becomes available
  useEffect(() => {
    if (!center || !containerRef.current) return

    // If map already exists, just update the view
    if (mapRef.current) {
      mapRef.current.setView(center, mapRef.current.getZoom())
      return
    }

    // Create the map
    const map = L.map(containerRef.current, {
      center,
      zoom: 16,
      zoomControl: false,
    })

    L.tileLayer('https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png', {
      attribution:
        '&copy; <a href="https://www.stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map)

    // 300m earning radius circle
    circleRef.current = L.circle(center, {
      radius: 300,
      color: '#4ade80',
      fillColor: '#4ade80',
      fillOpacity: 0.05,
      weight: 1,
      dashArray: '6 4',
    }).addTo(map)

    // Self marker
    selfMarkerRef.current = L.marker(center)
      .addTo(map)
      .bindPopup('You are here')

    // Layer group for nearby user markers
    markersRef.current = L.layerGroup().addTo(map)

    mapRef.current = map

    // Cleanup on unmount
    return () => {
      map.remove()
      mapRef.current = null
      markersRef.current = null
      circleRef.current = null
      selfMarkerRef.current = null
    }
  }, [center ? 'initialized' : 'waiting']) // eslint-disable-line react-hooks/exhaustive-deps

  // Update position when center changes (after init)
  useEffect(() => {
    if (!center || !mapRef.current) return
    mapRef.current.setView(center, mapRef.current.getZoom())
    circleRef.current?.setLatLng(center)
    selfMarkerRef.current?.setLatLng(center)
  }, [center])

  // Update nearby user markers
  useEffect(() => {
    if (!markersRef.current) return

    markersRef.current.clearLayers()

    nearbyUsers.forEach((u) => {
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:12px;height:12px;background:#4ade80;border:2px solid #fff;border-radius:50%;box-shadow:0 0 6px rgba(74,222,128,0.6)"></div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      })

      L.marker([u.latitude, u.longitude], { icon })
        .addTo(markersRef.current!)
        .bindPopup(u.name)
    })
  }, [nearbyUsers])

  if (geoError) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-surface-900">
        <div className="text-center p-6 max-w-sm">
          <p className="text-red-400 text-lg mb-2">Location access needed</p>
          <p className="text-gray-400 text-sm">{geoError}</p>
          <p className="text-gray-500 text-xs mt-2">
            Allow location access in your browser settings and refresh the page.
          </p>
        </div>
      </div>
    )
  }

  if (!center) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-surface-900">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-brand-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Getting your location...</p>
        </div>
      </div>
    )
  }

  return <div ref={containerRef} className="h-full w-full" />
}
