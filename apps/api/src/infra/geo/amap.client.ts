import { createHash } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { BizException } from '../../common/exceptions/biz-exception';
import type { GeocodeResult, NearbyGymPoi, SearchNearbyGymsInput } from './geo.types';

const AMAP_BASE_URL = 'https://restapi.amap.com';

/**
 * 高德周边搜索 POI 类型（ADR 0008 §5）：
 * `080113` — 体育休闲服务 · 运动场馆（含健身房）。
 * 结果稀疏时辅以 `keywords=健身房`。
 */
const GYM_POI_TYPES = '080113';

const DEFAULT_RADIUS_M = 3000;
const MAX_RADIUS_M = 5000;
const DEFAULT_LIMIT = 5;

type AmapJson = Record<string, unknown>;

@Injectable()
export class AmapClient {
  private readonly logger = new Logger(AmapClient.name);

  private readonly webKey?: string;

  private readonly webSecret?: string;

  constructor(config: ConfigService) {
    const key = config.get<string>('AMAP_WEB_KEY');
    this.webKey = key && key.trim().length > 0 ? key.trim() : undefined;
    const secret = config.get<string>('AMAP_WEB_SECRET');
    this.webSecret = secret && secret.trim().length > 0 ? secret.trim() : undefined;
  }

  async geocode(query: string): Promise<GeocodeResult> {
    this.requireKey('地理编码');
    const trimmed = query.trim();
    if (!trimmed) {
      throw BizException.validation({ field: 'query', reason: '地址不能为空' });
    }

    const data = await this.request<AmapJson>('/v3/geocode/geo', { address: trimmed });
    const geocodes = data.geocodes;
    if (!Array.isArray(geocodes) || geocodes.length === 0) {
      throw new BizException('NOT_FOUND', `未找到「${trimmed}」的坐标`, 404);
    }

    const first = geocodes[0] as AmapJson;
    const location = String(first.location ?? '');
    const [lngStr, latStr] = location.split(',');
    const lng = Number(lngStr);
    const lat = Number(latStr);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new BizException('INTERNAL_ERROR', '高德返回的坐标格式无效', 502);
    }

    const city = this.resolveCity(first);
    const formattedAddress =
      typeof first.formatted_address === 'string' ? first.formatted_address : undefined;

    this.logger.debug(
      `地理编码成功 query=${trimmed} city=${city} coords=${this.formatCoords(lat, lng)}`,
    );

    return { lat, lng, city, formattedAddress };
  }

  async searchNearbyGyms(input: SearchNearbyGymsInput): Promise<NearbyGymPoi[]> {
    this.requireKey('周边健身房搜索');
    const radiusM = Math.min(input.radiusM ?? DEFAULT_RADIUS_M, MAX_RADIUS_M);
    const limit = input.limit ?? DEFAULT_LIMIT;

    const data = await this.request<AmapJson>('/v3/place/around', {
      location: `${input.lng},${input.lat}`,
      keywords: '健身房',
      types: GYM_POI_TYPES,
      radius: String(radiusM),
      offset: String(limit),
      page: '1',
    });

    const pois = data.pois;
    if (!Array.isArray(pois) || pois.length === 0) {
      this.logger.debug(
        `周边健身房为空 coords=${this.formatCoords(input.lat, input.lng)} radiusM=${radiusM}`,
      );
      return [];
    }

    const results: NearbyGymPoi[] = [];
    for (const raw of pois) {
      const poi = raw as AmapJson;
      const name = typeof poi.name === 'string' ? poi.name : '';
      const address = typeof poi.address === 'string' ? poi.address : '';
      const distanceM = Number(poi.distance);
      if (!name) continue;
      results.push({
        name,
        address,
        distanceM: Number.isFinite(distanceM) ? distanceM : 0,
      });
    }

    this.logger.debug(
      `周边健身房 ${results.length} 条 coords=${this.formatCoords(input.lat, input.lng)}`,
    );
    return results;
  }

  private requireKey(operation: string): void {
    if (this.webKey) return;
    throw new BizException(
      'INTERNAL_ERROR',
      `高德地图服务未配置，无法执行${operation}（请设置 AMAP_WEB_KEY）`,
      503,
    );
  }

  private resolveCity(geocode: AmapJson): string {
    const city = this.normalizeAmapField(geocode.city);
    if (city) return city;
    const province = this.normalizeAmapField(geocode.province);
    if (province) return province;
    const district = this.normalizeAmapField(geocode.district);
    if (district) return district;
    const formatted =
      typeof geocode.formatted_address === 'string' ? geocode.formatted_address : '';
    return formatted || '未知城市';
  }

  /** 高德对直辖市有时返回 `[]` 字符串而非空值 */
  private normalizeAmapField(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    if (!trimmed || trimmed === '[]') return undefined;
    return trimmed;
  }

  private formatCoords(lat: number, lng: number): string {
    const round = (n: number) => Math.round(n * 100) / 100;
    return `${round(lat)},${round(lng)}`;
  }

  private async request<T extends AmapJson>(
    path: string,
    params: Record<string, string>,
  ): Promise<T> {
    const queryParams: Record<string, string> = { ...params, key: this.webKey! };
    const queryString = this.webSecret
      ? this.buildSignedQuery(queryParams, this.webSecret)
      : new URLSearchParams(queryParams).toString();

    const url = `${AMAP_BASE_URL}${path}?${queryString}`;
    let response: Response;
    try {
      response = await fetch(url);
    } catch (err) {
      this.logger.warn(`高德 HTTP 请求失败 path=${path}`);
      throw new BizException('INTERNAL_ERROR', '高德地图服务暂时不可用，请稍后重试', 502, {
        cause: err instanceof Error ? err.message : String(err),
      });
    }

    if (!response.ok) {
      throw new BizException(
        'INTERNAL_ERROR',
        `高德地图服务返回异常（HTTP ${response.status}）`,
        502,
      );
    }

    let body: AmapJson;
    try {
      body = (await response.json()) as AmapJson;
    } catch {
      throw new BizException('INTERNAL_ERROR', '高德地图服务响应解析失败', 502);
    }

    const status = String(body.status ?? '');
    if (status !== '1') {
      const info = typeof body.info === 'string' ? body.info : '未知错误';
      throw new BizException('INTERNAL_ERROR', `高德地图服务错误：${info}`, 502);
    }

    return body as T;
  }

  /** 高德 Web 服务数字签名（控制台 Key 类型需要时配置 AMAP_WEB_SECRET） */
  private buildSignedQuery(params: Record<string, string>, secret: string): string {
    const sorted = Object.keys(params).sort();
    const raw = sorted.map((k) => `${k}=${params[k]}`).join('&');
    const sig = createHash('md5')
      .update(raw + secret)
      .digest('hex');
    return new URLSearchParams({ ...params, sig }).toString();
  }
}
