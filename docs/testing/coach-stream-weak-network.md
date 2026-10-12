# Coach 流式回复：弱网手测清单

自动化部分见 `apps/mobile/src/api/endpoints/coach-stream.test.ts`（补播去重、退避重连、取消、终态校正），本清单补齐真实网络与真机 UI。

## 准备

1. 在 `apps/api/.env` 设置 `COACH_STREAM_FAULT=<开关>`（多个用逗号组合，如 `dropBeforeTerminal,wipeOnTerminal`），重启 API（`NODE_ENV=production` 时无效）。启动日志出现 `Coach SSE 故障注入已开启` 即生效；每次注入在日志里打 `[fault]`。
2. 真机 / 模拟器连开发机 API；打开 API 终端观察 `[fault]` 日志。
3. 每个场景发送一条会产生较长回复的消息（如「给我讲讲深蹲的五个技术要点」）。

| 开关                 | 作用                                                    |
| -------------------- | ------------------------------------------------------- |
| `dropAfter:N`        | 每条订阅连接写出 N 个事件后主动断开                     |
| `skipDelta:K`        | 不下发序号为 K 倍数的 delta（模拟丢包）                 |
| `deltaDelay:MS`      | 每个模型 delta 额外延迟，放慢生成                       |
| `dropBeforeTerminal` | 每个流首次要下发终态时改为断开                          |
| `wipeOnTerminal`     | 配合上一项：断开时删除 Redis 事件，迫使走数据库合成终态 |

## 场景

| #                            | 开关 / 操作                                                                           | 期望                                                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 序号补播                   | `dropAfter:3`                                                                         | 回复分段出现但**无重复、无缺字**；无报错；完成后与刷新会话后的内容一致                                                                     |
| 2 丢包校正                   | `skipDelta:3`                                                                         | 生成中可能缺字，**完成瞬间**正文被校正为完整内容                                                                                           |
| 3 终态在断线期间产生         | `dropBeforeTerminal`                                                                  | 正文完整后短暂停顿（约 0.5 秒）即结束，出现建议按钮；不显示失败                                                                            |
| 4 Redis 丢失，数据库合成终态 | `dropBeforeTerminal,wipeOnTerminal`                                                   | 同 3，停顿约 1–2 秒；内容与数据库一致                                                                                                      |
| 5 断网退避 → 手动重连        | `deltaDelay:300`；生成中 `adb shell svc wifi disable`（或开飞行模式）约 90 秒后再恢复 | 退避累计约 32 秒（连接若卡住不报错，每次最多再多 15 秒无响应超时）后显示「连接中断，可点击重新连接」；恢复网络点击重连，从断点继续，无重复 |
| 6 短暂断网自动恢复           | `deltaDelay:300`；断网 5 秒后恢复                                                     | 无需操作自动续上，无重复                                                                                                                   |
| 7 生成中取消                 | `deltaDelay:300`；点停止                                                              | 保留已生成部分并标「已停止生成」；刷新会话后一致                                                                                           |
| 8 取消后立刻断网             | `deltaDelay:300`；点停止后马上断网，10 秒后恢复                                       | 恢复后显示取消终态，正文以服务端为准，不残留「思考中」                                                                                     |
| 9 切后台                     | `deltaDelay:300`；生成中切到后台 10 秒再回来                                          | 回到前台自动续上，内容完整                                                                                                                 |
| 10 超出 Redis 保留期         | `deltaDelay:300`；生成中杀掉 App，等待回复结束后再打开                                | 会话里直接显示数据库中的最终回复                                                                                                           |

### 辅助命令

```powershell
# 真机断网 / 恢复
adb shell svc wifi disable
adb shell svc wifi enable

# 模拟器限速（emulator console）
adb emu network speed gsm
adb emu network delay gprs

# 查看某个流在 Redis 中的事件
docker exec fitness-redis redis-cli --scan --pattern "coach:message-stream:*"
docker exec fitness-redis redis-cli XRANGE coach:message-stream:<streamId>:events - +
```

## 判定通过

- 每个场景结束后，下拉刷新会话（或切换会话再切回），界面内容与刷新前一致。
- `[fault]` 日志确认故障确实被触发；没有触发的场景不算通过。
