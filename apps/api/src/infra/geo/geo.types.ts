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

/** 单日天气预报（Open-Meteo daily 块解析结果） */
export type WeatherDailyForecast = {
  /** 本地日期，格式 YYYY-MM-DD */
  date: string;
  /** 中文星期，如「周一」 */
  weekday: string;
  tempMaxC: number;
  tempMinC: number;
  precipitationMm?: number;
  precipitationProbabilityPct?: number;
  windSpeedMaxKmh?: number;
};

/** Open-Meteo 天气预报结果（当前 + 可选未来多日） */
export type WeatherForecast = {
  summary: string;
  temperatureC: number;
  precipitationMm?: number;
  windSpeedKmh?: number;
  adviceHints: string[];
  /** 未来逐日预报（含今日），按日期升序 */
  daily?: WeatherDailyForecast[];
};

export type WeatherForecastInput = {
  lat: number;
  lng: number;
  timezone?: string;
  /** 需要的预报天数（含今日），默认 3，范围 1-7 */
  days?: number;
};
