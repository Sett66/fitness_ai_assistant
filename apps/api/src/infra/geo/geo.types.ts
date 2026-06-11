/** 地理编码结果（内部 DTO，不替代 packages/shared 契约） */
export type GeocodeResult = {
  lat: number;
  lng: number;
  city: string;
  formattedAddress?: string;
};

/** 周边健身房 POI */
export type NearbyGymPoi = {
  name: string;
  address: string;
  distanceM: number;
};

export type SearchNearbyGymsInput = {
  lat: number;
  lng: number;
  radiusM?: number;
  limit?: number;
};

/** Open-Meteo 天气预报结果 */
export type WeatherForecast = {
  summary: string;
  temperatureC: number;
  precipitationMm?: number;
  windSpeedKmh?: number;
  adviceHints: string[];
};

export type WeatherForecastInput = {
  lat: number;
  lng: number;
  timezone?: string;
};
