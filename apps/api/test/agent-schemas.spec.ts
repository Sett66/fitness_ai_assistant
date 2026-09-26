import {
  CoachToolNameSchema,
  CreateCoachMessageSchema,
  LocationContextSchema,
  MemoryKeySchema,
  normalizeMemorySlug,
} from '@fitness/shared';
import { formatAgentMemoryBlocks } from '@fitness/ai-core';

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
    expect(CoachToolNameSchema.parse('get_current_datetime')).toBe('get_current_datetime');
    expect(CoachToolNameSchema.parse('save_memory')).toBe('save_memory');
    expect(CoachToolNameSchema.parse('recall_memory')).toBe('recall_memory');
  });

  it('长期记忆 key 使用受控类别与规范 slug', () => {
    expect(normalizeMemorySlug(' Left Shoulder Injury!! ')).toBe('left_shoulder_injury');
    expect(MemoryKeySchema.parse('injury:left_shoulder')).toBe('injury:left_shoulder');
    expect(() => MemoryKeySchema.parse('freeform:left_shoulder')).toThrow();
    expect(() => MemoryKeySchema.parse('injury:UpperCase')).toThrow();
  });

  it('Agent prompt 仅直接暴露安全类记忆 value', () => {
    const block = formatAgentMemoryBlocks([
      { key: 'injury:left_shoulder', category: 'injury', value: '避免推举' },
      { key: 'location:travel_shanghai', category: 'location', value: '常出差上海' },
    ]);
    expect(block).toContain('injury:left_shoulder');
    expect(block).toContain('location:travel_shanghai');
    expect(block).toContain('避免推举');
    expect(block).not.toContain('常出差上海');
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
