import { shouldAttachLocation } from './shouldAttachLocation';

describe('shouldAttachLocation', () => {
  it('returns false for empty text', () => {
    expect(shouldAttachLocation('')).toBe(false);
    expect(shouldAttachLocation('   ')).toBe(false);
  });

  it('returns false when user has opted in but text is not location-related', () => {
    expect(shouldAttachLocation('随便聊聊')).toBe(false);
    expect(shouldAttachLocation('我今日还能吃多少碳水')).toBe(false);
  });

  it.each([
    '今天天气适合出门跑步吗',
    '户外运动要注意什么',
    '附近有好的健身房吗',
    '出差北京怎么保持训练',
    '下午去游泳',
    '爬山对膝盖有影响吗',
    '晚上散步多远合适',
    '附近有没有拳馆或瑜伽馆',
  ])('returns true for location-related text: %s', (text) => {
    expect(shouldAttachLocation(text)).toBe(true);
  });

  it('returns false for non-location text without opt-in', () => {
    expect(shouldAttachLocation('今天练胸还是练背')).toBe(false);
    expect(shouldAttachLocation('减脂期怎么吃')).toBe(false);
  });
});
