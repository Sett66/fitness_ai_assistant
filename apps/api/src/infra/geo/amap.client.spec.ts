import { ConfigService } from '@nestjs/config';

import { BizException } from '../../common/exceptions/biz-exception';
import { AmapClient } from './amap.client';

function createConfig(overrides: Record<string, string | undefined> = {}): ConfigService {
  const values: Record<string, string | undefined> = {
    AMAP_WEB_KEY: 'test-amap-key',
    AMAP_WEB_SECRET: undefined,
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

describe('AmapClient', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn() as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('geocode', () => {
    it('happy path：解析上海市坐标', async () => {
      mockFetchJson({
        status: '1',
        geocodes: [
          {
            formatted_address: '上海市',
            city: '上海市',
            location: '121.473701,31.230416',
          },
        ],
      });

      const client = new AmapClient(createConfig());
      const result = await client.geocode('上海市');

      expect(result).toEqual({
        lat: 31.230416,
        lng: 121.473701,
        city: '上海市',
        formattedAddress: '上海市',
      });
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('restapi.amap.com/v3/geocode/geo'),
      );
    });

    it('高德 status !== 1 时抛 BizException', async () => {
      mockFetchJson({ status: '0', info: 'INVALID_USER_KEY' });

      const client = new AmapClient(createConfig());
      await expect(client.geocode('上海市')).rejects.toMatchObject({
        name: 'BizException',
        message: expect.stringContaining('高德地图服务错误'),
      });
    });

    it('无 Key 时抛可读 BizException', async () => {
      const client = new AmapClient(createConfig({ AMAP_WEB_KEY: '' }));
      await expect(client.geocode('上海市')).rejects.toMatchObject({
        message: expect.stringContaining('AMAP_WEB_KEY'),
      });
    });
  });

  describe('searchNearbyGyms', () => {
    it('happy path：返回健身房列表', async () => {
      mockFetchJson({
        status: '1',
        pois: [
          { name: '超级健身房', address: '南京东路 1 号', distance: '320' },
          { name: '社区健身', address: '人民路 8 号', distance: '890' },
        ],
      });

      const client = new AmapClient(createConfig());
      const results = await client.searchNearbyGyms({ lat: 31.23, lng: 121.47 });

      expect(results).toEqual([
        { name: '超级健身房', address: '南京东路 1 号', distanceM: 320 },
        { name: '社区健身', address: '人民路 8 号', distanceM: 890 },
      ]);
      const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
      expect(url).toContain('types=080113');
      expect(url).toContain('keywords');
    });

    it('空 POI 列表返回空数组', async () => {
      mockFetchJson({ status: '1', pois: [] });

      const client = new AmapClient(createConfig());
      const results = await client.searchNearbyGyms({ lat: 31.23, lng: 121.47 });
      expect(results).toEqual([]);
    });

    it('HTTP 非 2xx 时抛 BizException', async () => {
      mockFetchJson({}, 500);

      const client = new AmapClient(createConfig());
      await expect(client.searchNearbyGyms({ lat: 31.23, lng: 121.47 })).rejects.toThrow(
        BizException,
      );
    });
  });
});
