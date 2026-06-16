import {
  UpsertUserLocationSchema,
  UserLocationNullableResponseSchema,
  UserLocationResponseSchema,
} from '@fitness/shared';

describe('User location schemas', () => {
  const valid = {
    lat: 31.2,
    lng: 121.5,
    city: '上海',
    source: 'MANUAL' as const,
  };

  it('UpsertUserLocationSchema 合法输入通过', () => {
    expect(UpsertUserLocationSchema.parse(valid)).toMatchObject(valid);
  });

  it('UpsertUserLocationSchema 拒绝非法纬度', () => {
    expect(() => UpsertUserLocationSchema.parse({ ...valid, lat: 100 })).toThrow();
  });

  it('UserLocationResponse 含 updatedAt', () => {
    const parsed = UserLocationResponseSchema.parse({
      ...valid,
      updatedAt: '2026-06-15T12:00:00.000Z',
    });
    expect(parsed.updatedAt).toEqual(new Date('2026-06-15T12:00:00.000Z'));
  });

  it('GET 无快照时 null 通过', () => {
    expect(UserLocationNullableResponseSchema.parse(null)).toBeNull();
  });
});
