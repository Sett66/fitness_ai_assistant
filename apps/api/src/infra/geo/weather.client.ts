import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { BizException } from '../../common/exceptions/biz-exception';
import type { WeatherForecast, WeatherForecastInput } from './geo.types';

const DEFAULT_OPEN_METEO_BASE = 'https://api.open-meteo.com';
const DEFAULT_TIMEZONE = 'Asia/Shanghai';

type OpenMeteoCurrent = {
  temperature_2m?: number;
  precipitation?: number;
  wind_speed_10m?: number;
};

type OpenMeteoResponse = {
  current?: OpenMeteoCurrent;
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
    const params = new URLSearchParams({
      latitude: String(input.lat),
      longitude: String(input.lng),
      current: 'temperature_2m,precipitation,wind_speed_10m',
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

    this.logger.debug(
      `天气预报 coords=${this.formatCoords(input.lat, input.lng)} temp=${temperatureC}°C`,
    );

    return { summary, temperatureC, precipitationMm, windSpeedKmh, adviceHints };
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
