import {
  finalizeAgentReply,
  formatGymsFromToolMessages,
  replyLooksLikeDsmlLeak,
  stripDsmlMarkup,
} from '../../../packages/ai-core/src/graphs/coach-agent/sanitize-agent-reply';

describe('sanitize-agent-reply', () => {
  const dsmlReply = `看来你想多看几家，我这次把搜索范围扩大到 5 公里再帮你扫一遍：

<｜｜DSML｜｜tool_calls>
<｜｜DSML｜｜invoke name="search_nearby_gyms">
<｜｜DSML｜｜parameter name="lat" string="false">29.57</｜｜DSML｜｜parameter>
<｜｜DSML｜｜parameter name="lng" string="false">106.55</｜｜DSML｜｜parameter>
<｜｜DSML｜｜parameter name="radiusM" string="false">5000</｜｜DSML｜｜parameter>
</｜｜DSML｜｜invoke>
</｜｜DSML｜｜tool_calls>`;

  it('strips DSML markup from reply', () => {
    expect(stripDsmlMarkup(dsmlReply)).toBe(
      '看来你想多看几家，我这次把搜索范围扩大到 5 公里再帮你扫一遍：',
    );
    expect(replyLooksLikeDsmlLeak(dsmlReply)).toBe(true);
  });

  it('falls back to gym list when reply is DSML leak', () => {
    const messages = [
      {
        role: 'tool' as const,
        tool_call_id: '1',
        content: JSON.stringify({
          gyms: [
            { name: '天天普拉提', address: '测试路 12 号', distanceM: 247 },
            { name: '社区健身', address: '人民路 8 号', distanceM: 890 },
          ],
        }),
      },
    ];

    const reply = finalizeAgentReply(dsmlReply, messages);
    expect(reply).toContain('天天普拉提');
    expect(reply).toContain('社区健身');
    expect(reply).not.toContain('DSML');
  });

  it('formats gyms from tool messages', () => {
    const formatted = formatGymsFromToolMessages([
      {
        role: 'tool',
        tool_call_id: '1',
        content: JSON.stringify({
          gyms: [{ name: '超级健身房', address: '南京东路 1 号', distanceM: 320 }],
        }),
      },
    ]);

    expect(formatted).toContain('超级健身房');
    expect(formatted).toContain('320m');
  });
});
