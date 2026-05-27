'use client'

import { useEffect, useRef, useState } from 'react'
import { MapPin, AlertTriangle, Crosshair, ExternalLink } from 'lucide-react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

interface BLMapProps {
  destLat: number | null
  destLng: number | null
  driver?: {
    lat: number
    lng: number
    accuracy_m?: number
  } | null
  heightClass?: string
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''
const DEFAULT_STYLE = 'mapbox://styles/mapbox/streets-v12'

export default function BLMap({ destLat, destLng, driver, heightClass = 'h-96' }: BLMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const destMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const driverMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const [mapError, setMapError] = useState<string | null>(null)

  const hasToken = !!MAPBOX_TOKEN
  const hasDestCoords = destLat != null && destLng != null

  useEffect(() => {
    if (!hasToken || !hasDestCoords || !containerRef.current) return
    if (mapRef.current) return // Already initialized

    try {
      mapboxgl.accessToken = MAPBOX_TOKEN

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: DEFAULT_STYLE,
        center: [destLng!, destLat!],
        zoom: 14,
        attributionControl: false,
      })

      map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left')
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')

      // Destination Marker (Yellow + Pin)
      const destEl = document.createElement('div')
      destEl.className = 'flex items-center justify-center w-9 h-9 rounded-full bg-yellow-300 ring-4 ring-yellow-100 shadow-md'
      destEl.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0f172a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
          <circle cx="12" cy="10" r="3"/>
        </svg>
      `

      destMarkerRef.current = new mapboxgl.Marker({ element: destEl, anchor: 'bottom' })
        .setLngLat([destLng!, destLat!])
        .addTo(map)

      mapRef.current = map

      // If we already have a driver, add it
      if (driver) {
        updateDriverMarker(map, driver)
      }
    } catch (err: any) {
      console.error('Error initializing map:', err)
      setMapError(err.message || 'Erreur lors du chargement de la carte')
    }

    return () => {
      destMarkerRef.current?.remove()
      driverMarkerRef.current?.remove()
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [hasToken, hasDestCoords, destLat, destLng])

  // Update or create the driver marker
  const updateDriverMarker = (map: mapboxgl.Map, drv: { lat: number; lng: number }) => {
    if (!map) return

    if (!driverMarkerRef.current) {
      const driverEl = document.createElement('div')
      driverEl.className = 'flex items-center justify-center w-7 h-7 rounded-full bg-blue-600 ring-4 ring-blue-100 shadow-md border-2 border-white animate-pulse'
      driverEl.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
        </svg>
      `
      driverMarkerRef.current = new mapboxgl.Marker({ element: driverEl, anchor: 'center' })
        .setLngLat([drv.lng, drv.lat])
        .addTo(map)

      // Auto-fit bounds on first appearance
      if (hasDestCoords) {
        const bounds = new mapboxgl.LngLatBounds()
          .extend([destLng!, destLat!])
          .extend([drv.lng, drv.lat])
        map.fitBounds(bounds, { padding: 50, maxZoom: 15, duration: 800 })
      }
    } else {
      // Smoothly update coordinate
      driverMarkerRef.current.setLngLat([drv.lng, drv.lat])
    }
  }

  // Monitor driver changes
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (!driver) {
      if (driverMarkerRef.current) {
        driverMarkerRef.current.remove()
        driverMarkerRef.current = null
      }
      return
    }

    updateDriverMarker(map, driver)
  }, [driver])

  // Resize handler on load
  useEffect(() => {
    if (!mapRef.current) return
    const timer = setTimeout(() => {
      mapRef.current?.resize()
    }, 200)
    return () => clearTimeout(timer)
  }, [])

  // Degradation fallback to Google Maps if no token
  if (!hasToken || mapError) {
    const gmapsHref = hasDestCoords
      ? `https://www.google.com/maps/search/?api=1&query=${destLat},${destLng}`
      : null

    return (
      <div className={`${heightClass} w-full rounded-2xl bg-cream-100 border border-line flex flex-col items-center justify-center text-center p-6 gap-3`}>
        <AlertTriangle className="w-10 h-10 text-amber-500" />
        <h4 className="text-sm font-bold text-navy mb-0">Visualisation cartographique indisponible</h4>
        <p className="text-xs text-muted max-w-sm">
          Le token Mapbox est manquant ou invalide. Vous pouvez néanmoins ouvrir l'itinéraire sur Google Maps.
        </p>
        {gmapsHref && (
          <a
            href={gmapsHref}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-navy hover:bg-navy-700 text-white text-xs font-bold transition-all shadow-sm"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Ouvrir dans Google Maps
          </a>
        )}
      </div>
    )
  }

  // Fallback: No Client coordinates
  if (!hasDestCoords) {
    return (
      <div className={`${heightClass} w-full rounded-2xl bg-cream-100 border border-line flex flex-col items-center justify-center text-center p-6`}>
        <MapPin className="w-10 h-10 text-muted opacity-40 mb-2" />
        <h4 className="text-sm font-bold text-navy mb-1">Aucune coordonnée de livraison</h4>
        <p className="text-xs text-muted max-w-xs">
          L'adresse fournie n'a pas pu être géolocalisée (coordonnées manquantes).
        </p>
      </div>
    )
  }

  return (
    <div className="relative w-full">
      <div
        ref={containerRef}
        className={`${heightClass} w-full rounded-2xl overflow-hidden border border-line shadow-inner`}
        role="region"
        aria-label="Carte de livraison"
      />
      {driver && (
        <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/95 backdrop-blur shadow-sm border border-line text-xs font-semibold text-navy">
          <Crosshair className="w-3.5 h-3.5 text-blue-600 animate-spin-slow" />
          <span>Livreur en mouvement {driver.accuracy_m ? `(Précision: ${driver.accuracy_m}m)` : ''}</span>
        </div>
      )}
    </div>
  )
}
