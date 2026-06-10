import {
  CoachToolNameSchema,
  CreateCoachMessageSchema,
  LocationContextSchema,
} from '@fitness/shared';

describe('Agent shared schemas', () => {
  const validLocation = {
    lat: 31.23,
    lng: 121.47,
    accuracyM: 12,
    city: '上海市',
    capturedAt: '2026-06-10T08:00:00.000Z',
  };

  it('合法 LocationContext 通过 parse', () => {
    expect(LocationContextSchema.parse(validLocation)).toMatchObject({
      lat: 31.23,
      lng: 121.47,
      city: '上海市',
    });
  });

  it('非法 LocationContext（纬度越界）被拒绝', () => {
    expect(() => LocationContextSchema.parse({ ...validLocation, lat: 95 })).toThrow();
  });

  it('CoachToolName 拒绝未知工具名', () => {
    expect(() => CoachToolNameSchema.parse('invoke_skynet')).toThrow();
    expect(CoachToolNameSchema.parse('get_weather')).toBe('get_weather');
  });

  it('CreateCoachMessageSchema 带 locationContext 通过', () => {
    const parsed = CreateCoachMessageSchema.parse({
      action: 'CHAT',
      content: '今天适合户外跑吗？',
      locationContext: validLocation,
    });
    expect(parsed.locationContext?.city).toBe('上海市');
  });
});
