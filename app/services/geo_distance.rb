class GeoDistance
  EARTH_RADIUS_M = 6_371_000.0

  def self.limit_meters
    ENV.fetch("LIMIT_METERS", 50).to_i
  end

  def self.meters_between(lat1, lon1, lat2, lon2)
    return Float::INFINITY if [ lat1, lon1, lat2, lon2 ].any?(&:nil?)

    phi1 = to_rad(lat1.to_f)
    phi2 = to_rad(lat2.to_f)
    dphi = to_rad(lat2.to_f - lat1.to_f)
    dlambda = to_rad(lon2.to_f - lon1.to_f)

    a = Math.sin(dphi / 2)**2 +
        Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlambda / 2)**2
    c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    EARTH_RADIUS_M * c
  end

  def self.within_limit?(lat1, lon1, lat2, lon2)
    meters_between(lat1, lon1, lat2, lon2) <= limit_meters
  end

  def self.to_rad(deg)
    deg * Math::PI / 180.0
  end
end
