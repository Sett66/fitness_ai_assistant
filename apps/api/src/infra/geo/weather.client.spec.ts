import { ConfigService } from '@nestjs/config';

import { BizException } from '../../common/exceptions/biz-exception';
import { WeatherClient } from './weather.client';

function createConfig(overrides: Record<string, string | undefined> = {}): ConfigService {
  const values: Record<string, string | undefined> = {
    OPEN_METEO_BASE_URL: undefined,
    ...overrides,
  };
  return {
    get: (key: string) => values[key],
    getOrThrow: (key: string) => {
      const v = values[key];
      if (v === undefined) throw new Error(`missing ${key}`);
      return v;
    },
  } as ConfigService;
}

function mockFetchJson(body: unknown, status = 200): void {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

describe('WeatherClient', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn() as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('happy path：返回中文摘要与非空 adviceHints', async () => {
    mockFetchJson({
      current: {
        temperature_2m: 22.4,
        precipitation: 0,
        wind_speed_10m: 8,
      },
    });

    const client = new WeatherClient(createConfig());
    const result = await client.getForecast({ lat: 31.23, lng: 121.47 });

    expect(result.summary).toMatch(/22/);
    expect(result.temperatureC).toBe(22.4);
    expect(result.precipitationMm).toBe(0);
    expect(result.windSpeedKmh).toBe(8);
    expect(result.adviceHints.length).toBeGreaterThan(0);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('api.open-meteo.com/v1/forecast'),
    );
    const requestedUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(requestedUrl).toContain('daily=');
    expect(requestedUrl).toContain('forecast_days=');
  });

  it('解析 daily 块为逐日预报（含日期与中文星期）', async () => {
    mockFetchJson({
      current: {
        temperature_2m: 20,
        precipitation: 0,
        wind_speed_10m: 6,
      },
      daily: {
        time: ['2026-07-12', '2026-07-13'],
        temperature_2m_max: [31, 33],
        temperature_2m_min: [24, 25],
        precipitation_sum: [0, 4],
        precipitation_probability_max: [10, 60],
        wind_speed_10m_max: [12, 18],
      },
    });

    const client = new WeatherClient(createConfig());
    const result = await client.getForecast({ lat: 31.23, lng: 121.47, days: 2 });

    expect(result.daily).toHaveLength(2);
    expect(result.daily?.[0]).toMatchObject({
      date: '2026-07-12',
      weekday: '周日',
      tempMaxC: 31,
      tempMinC: 24,
      precipitationProbabilityPct: 10,
    });
    expect(result.daily?.[1]).toMatchObject({
      date: '2026-07-13',
      weekday: '周一',
      precipitationProbabilityPct: 60,
    });
  });

  it('有降水时给出室内训练建议', async () => {
    mockFetchJson({
      current: {
        temperature_2m: 18,
        precipitation: 2.5,
        wind_speed_10m: 5,
      },
    });

    const client = new WeatherClient(createConfig());
    const result = await client.getForecast({ lat: 31.23, lng: 121.47 });

    expect(result.adviceHints).toContain('有雨，建议室内训练');
    expect(result.summary).toContain('降水');
  });

  it('HTTP 非 2xx 时抛 BizException', async () => {
    mockFetchJson({}, 503);

    const client = new WeatherClient(createConfig());
    await expect(client.getForecast({ lat: 31.23, lng: 121.47 })).rejects.toThrow(BizException);
  });

  it('缺少 current 数据时抛 BizException', async () => {
    mockFetchJson({ current: {} });

    const client = new WeatherClient(createConfig());
    await expect(client.getForecast({ lat: 31.23, lng: 121.47 })).rejects.toMatchObject({
      message: expect.stringContaining('未返回有效数据'),
    });
  });
});
