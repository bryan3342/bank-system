'use client'

import { useState, useEffect } from 'react'

interface NearbyUser {
  id: string
  name: string
  latitude: number
  longitude: number
  lastSeen: string
}

const POLL_INTERVAL_MS = 10_000 // 10 seconds

export function useNearbyUsers() {
  const [nearbyUsers, setNearbyUsers] = useState<NearbyUser[]>([])

  useEffect(() => {
    let mounted = true

    async function fetchNearby() {
      try {
        const res = await fetch('/api/nearby')
        if (res.ok && mounted) {
          const data = await res.json()
          setNearbyUsers(data.users)
        }
      } catch {
        // Silent fail
      }
    }

    fetchNearby()
    const intervalId = setInterval(fetchNearby, POLL_INTERVAL_MS)

    return () => {
      mounted = false
      clearInterval(intervalId)
    }
  }, [])

  return { nearbyUsers }
}
