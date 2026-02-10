// Calculate distance between two points on Earth using the Haversine formula
// Returns distance in meters

export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6_371_000 // Earth's radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180

  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Check if a user's location is within an event's radius
export function isWithinRadius(
  userLat: number,
  userLon: number,
  eventLat: number,
  eventLon: number,
  radiusMeters: number
): boolean {
  const distance = haversineMeters(userLat, userLon, eventLat, eventLon)
  return distance <= radiusMeters
}
