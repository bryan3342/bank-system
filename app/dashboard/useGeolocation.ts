'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

interface GeolocationState {
  latitude: number | null
  longitude: number | null
  error: string | null
}

const PING_INTERVAL_MS = 30_000 // 30 seconds

export function useGeolocation(): GeolocationState {
  const [state, setState] = useState<GeolocationState>({
    latitude: null,
    longitude: null,
    error: null,
  })
  const watchIdRef = useRef<number | null>(null)
  const latestCoordsRef = useRef<{ lat: number; lon: number } | null>(null)

  const reportLocation = useCallback(async (lat: number, lon: number) => {
    try {
      await fetch('/api/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latitude: lat, longitude: lon }),
      })
    } catch {
      // Silently fail — map still works without server ping
    }
  }, [])

  useEffect(() => {
    if (!navigator.geolocation) {
      setState((prev) => ({
        ...prev,
        error: 'Geolocation is not supported by your browser',
      }))
      return
    }

    // Watch position for real-time map centering
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        latestCoordsRef.current = { lat: latitude, lon: longitude }
        setState((prev) => ({
          ...prev,
          latitude,
          longitude,
          error: null,
        }))
      },
      (err) => {
        setState((prev) => ({ ...prev, error: err.message }))
      },
      { enableHighAccuracy: true, maximumAge: 10000 }
    )

    // Ping server immediately on first position
    navigator.geolocation.getCurrentPosition(
      (position) => {
        reportLocation(position.coords.latitude, position.coords.longitude)
      },
      () => {} // Ignore error for initial ping
    )

    // Ping server every 30 seconds
    const intervalId = setInterval(() => {
      if (latestCoordsRef.current) {
        reportLocation(latestCoordsRef.current.lat, latestCoordsRef.current.lon)
      }
    }, PING_INTERVAL_MS)

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
      clearInterval(intervalId)
    }
  }, [reportLocation])

  return state
}
