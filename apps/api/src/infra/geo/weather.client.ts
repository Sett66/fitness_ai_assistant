import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { BizException } from '../../common/exceptions/biz-exception';
import type { WeatherDailyForecast, WeatherForecast, WeatherForecastInput } from './geo.types';

const DEFAULT_OPEN_METEO_BASE = 'https://api.open-meteo.com';
const DEFAULT_TIMEZONE = 'Asia/Shanghai';
const DEFAULT_FORECAST_DAYS = 3;
const MAX_FORECAST_DAYS = 7;
const WEEKDAY_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

type OpenMeteoCurrent = {
  temperature_2m?: number;
  precipitation?: number;
  wind_speed_10m?: number;
};

type OpenMeteoDaily = {
  time?: string[];
  temperature_2m_max?: number[];
  temperature_2m_min?: number[];
  precipitation_sum?: number[];
  precipitation_probability_max?: number[];
  wind_speed_10m_max?: number[];
};

type OpenMeteoResponse = {
  current?: OpenMeteoCurrent;
  daily?: OpenMeteoDaily;
};

@Injectable()
export class WeatherClient {
  private readonly logger = new Logger(WeatherClient.name);

  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    const custom = config.get<string>('OPEN_METEO_BASE_URL');
    this.baseUrl =
      custom && custom.trim().length > 0
        ? custom.trim().replace(/\/$/, '')
        : DEFAULT_OPEN_METEO_BASE;
  }

  async getForecast(input: WeatherForecastInput): Promise<WeatherForecast> {
    const timezone = input.timezone ?? DEFAULT_TIMEZONE;
    const forecastDays = Math.min(
      Math.max(Math.trunc(input.days ?? DEFAULT_FORECAST_DAYS), 1),
      MAX_FORECAST_DAYS,
    );
    const params = new URLSearchParams({
      latitude: String(input.lat),
      longitude: String(input.lng),
      current: 'temperature_2m,precipitation,wind_speed_10m',
      daily:
        'temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max',
      forecast_days: String(forecastDays),
      wind_speed_unit: 'kmh',
      timezone,
    });

    const url = `${this.baseUrl}/v1/forecast?${params.toString()}`;
    let response: Response;
    try {
      response = await fetch(url);
    } catch (err) {
      this.logger.warn(
        `Open-Meteo HTTP 请求失败 coords=${this.formatCoords(input.lat, input.lng)}`,
      );
      throw new BizException('INTERNAL_ERROR', '天气服务暂时不可用，请稍后重试', 502, {
        cause: err instanceof Error ? err.message : String(err),
      });
    }

    if (!response.ok) {
      throw new BizException('INTERNAL_ERROR', `天气服务返回异常（HTTP ${response.status}）`, 502);
    }

    let body: OpenMeteoResponse;
    try {
      body = (await response.json()) as OpenMeteoResponse;
    } catch {
      throw new BizException('INTERNAL_ERROR', '天气服务响应解析失败', 502);
    }

    const current = body.current;
    if (!current || typeof current.temperature_2m !== 'number') {
      throw new BizException('INTERNAL_ERROR', '天气服务未返回有效数据', 502);
    }

    const temperatureC = current.temperature_2m;
    const precipitationMm =
      typeof current.precipitation === 'number' ? current.precipitation : undefined;
    const windSpeedKmh =
      typeof current.wind_speed_10m === 'number' ? current.wind_speed_10m : undefined;

    const adviceHints = this.buildAdviceHints(temperatureC, precipitationMm, windSpeedKmh);
    const summary = this.buildSummary(temperatureC, precipitationMm, windSpeedKmh);
    const daily = this.parseDaily(body.daily);

    this.logger.debug(
      `天气预报 coords=${this.formatCoords(input.lat, input.lng)} temp=${temperatureC}°C days=${daily?.length ?? 0}`,
    );

    return { summary, temperatureC, precipitationMm, windSpeedKmh, adviceHints, daily };
  }

  private parseDaily(daily?: OpenMeteoDaily): WeatherDailyForecast[] | undefined {
    const times = daily?.time;
    const maxTemps = daily?.temperature_2m_max;
    const minTemps = daily?.temperature_2m_min;
    if (!Array.isArray(times) || !Array.isArray(maxTemps) || !Array.isArray(minTemps)) {
      return undefined;
    }

    const result: WeatherDailyForecast[] = [];
    for (let i = 0; i < times.length; i += 1) {
      const date = times[i];
      const tempMaxC = maxTemps[i];
      const tempMinC = minTemps[i];
      if (
        typeof date !== 'string' ||
        typeof tempMaxC !== 'number' ||
        typeof tempMinC !== 'number'
      ) {
        continue;
      }
      const precipitationMm = daily?.precipitation_sum?.[i];
      const precipitationProbabilityPct = daily?.precipitation_probability_max?.[i];
      const windSpeedMaxKmh = daily?.wind_speed_10m_max?.[i];
      result.push({
        date,
        weekday: this.weekdayOf(date),
        tempMaxC,
        tempMinC,
        precipitationMm: typeof precipitationMm === 'number' ? precipitationMm : undefined,
        precipitationProbabilityPct:
          typeof precipitationProbabilityPct === 'number' ? precipitationProbabilityPct : undefined,
        windSpeedMaxKmh: typeof windSpeedMaxKmh === 'number' ? windSpeedMaxKmh : undefined,
      });
    }

    return result.length > 0 ? result : undefined;
  }

  private weekdayOf(date: string): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
    if (!match) {
      return '';
    }
    const [, y, m, d] = match;
    const dayIndex = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d))).getUTCDay();
    return WEEKDAY_ZH[dayIndex] ?? '';
  }

  private buildSummary(
    temperatureC: number,
    precipitationMm?: number,
    windSpeedKmh?: number,
  ): string {
    const parts: string[] = [`当前气温${Math.round(temperatureC)}°C`];
    if (precipitationMm !== undefined) {
      parts.push(precipitationMm > 0 ? `降水${precipitationMm}mm` : '无降水');
    }
    if (windSpeedKmh !== undefined) {
      if (windSpeedKmh < 12) {
        parts.push('微风');
      } else if (windSpeedKmh < 30) {
        parts.push(`风速${Math.round(windSpeedKmh)}km/h`);
      } else {
        parts.push(`大风${Math.round(windSpeedKmh)}km/h`);
      }
    }
    return parts.join('，');
  }

  private buildAdviceHints(
    temperatureC: number,
    precipitationMm?: number,
    windSpeedKmh?: number,
  ): string[] {
    const hints: string[] = [];
    if (precipitationMm !== undefined && precipitationMm > 0) {
      hints.push('有雨，建议室内训练');
    }
    if (temperatureC < 5) {
      hints.push('气温较低，注意保暖');
    } else if (temperatureC > 32) {
      hints.push('气温较高，注意补水与防暑');
    }
    if (windSpeedKmh !== undefined && windSpeedKmh >= 40) {
      hints.push('风力较大，户外训练需谨慎');
    }
    if (hints.length === 0) {
      hints.push('天气适宜户外运动');
    }
    return hints;
  }

  private formatCoords(lat: number, lng: number): string {
    const round = (n: number) => Math.round(n * 100) / 100;
    return `${round(lat)},${round(lng)}`;
  }
}
