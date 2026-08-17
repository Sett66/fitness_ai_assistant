import type { Job } from 'bullmq';
import { runSocialModerate } from '@fitness/ai-core';

import type { ConversationSideEffectService } from '../domain/conversation-side-effect.service';
import type { PrismaService } from '../infra/prisma/prisma.service';
import { AiTaskProcessor } from './ai-task.processor';

jest.mock('@fitness/ai-core', () => {
  const actual = jest.requireActual('@fitness/ai-core') as Record<string, unknown>;
  return {
    ...actual,
    runSocialModerate: jest.fn(),
  };
});

const mockedRun = runSocialModerate as jest.MockedFunction<typeof runSocialModerate>;

function job(aiRunId: string): Job {
  return { name: 'default', data: { aiRunId } } as Job;
}

function createProcessor() {
  const prisma = {
    client: {
      aiRun: { update: jest.fn().mockResolvedValue(undefined) },
      post: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue(undefined),
      },
    },
  };
  const indexQueue = { add: jest.fn().mockResolvedValue(undefined) };
  const conversationSideEffects = {
    finalizeAssistantMessage: jest.fn().mockResolvedValue(undefined),
  };

  const processor = new AiTaskProcessor(
    prisma as unknown as PrismaService,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    conversationSideEffects as unknown as ConversationSideEffectService,
    indexQueue as never,
  );

  return { processor, prisma, indexQueue, conversationSideEffects };
}

describe('AiTaskProcessor SOCIAL_MODERATE', () => {
  beforeEach(() => {
    mockedRun.mockReset();
  });

  it('帖子不存在时跳过且不报错', async () => {
    const { processor, prisma, indexQueue } = createProcessor();
    prisma.client.aiRun.update.mockResolvedValueOnce({
      id: 'run-1',
      taskType: 'SOCIAL_MODERATE',
      model: 'deepseek-v4-flash',
      userId: 'u1',
      inputJson: { postId: 'missing' },
    });
    prisma.client.post.findUnique.mockResolvedValue(null);

    await processor.process(job('run-1'));

    expect(mockedRun).not.toHaveBeenCalled();
    expect(prisma.client.post.update).not.toHaveBeenCalled();
    expect(indexQueue.add).not.toHaveBeenCalled();
    expect(prisma.client.aiRun.update).toHaveBeenLastCalledWith({
      where: { id: 'run-1' },
      data: expect.objectContaining({
        status: 'DONE',
        outputJson: { skipped: true },
      }),
    });
  });

  it('APPROVED 回写状态且 reason 置 null', async () => {
    const { processor, prisma, indexQueue } = createProcessor();
    prisma.client.aiRun.update.mockResolvedValueOnce({
      id: 'run-1',
      taskType: 'SOCIAL_MODERATE',
      model: 'deepseek-v4-flash',
      userId: 'u1',
      inputJson: { postId: 'p1' },
    });
    prisma.client.post.findUnique.mockResolvedValue({
      id: 'p1',
      body: '今天深蹲 100kg',
      deletedAt: null,
    });
    mockedRun.mockResolvedValue({
      result: { decision: 'APPROVED', reason: '' },
      usage: { tokenIn: 10, tokenOut: 5, costCny: 0.01 },
      rawText: '',
    });

    await processor.process(job('run-1'));

    expect(mockedRun).toHaveBeenCalledWith(
      { body: '今天深蹲 100kg' },
      { model: 'deepseek-v4-flash' },
    );
    expect(prisma.client.post.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { moderation: 'APPROVED', moderationReason: null },
    });
    expect(indexQueue.add).not.toHaveBeenCalled();
  });

  it('REJECTED 回写原因并入队 DELETE_POST', async () => {
    const { processor, prisma, indexQueue } = createProcessor();
    prisma.client.aiRun.update.mockResolvedValueOnce({
      id: 'run-1',
      taskType: 'SOCIAL_MODERATE',
      model: 'deepseek-v4-flash',
      userId: 'u1',
      inputJson: { postId: 'p1' },
    });
    prisma.client.post.findUnique.mockResolvedValue({
      id: 'p1',
      body: 'spam',
      deletedAt: null,
    });
    mockedRun.mockResolvedValue({
      result: { decision: 'REJECTED', reason: '广告引流' },
      usage: { tokenIn: 10, tokenOut: 8, costCny: 0.01 },
      rawText: '',
    });

    await processor.process(job('run-1'));

    expect(prisma.client.post.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { moderation: 'REJECTED', moderationReason: '广告引流' },
    });
    expect(indexQueue.add).toHaveBeenCalledWith(
      'default',
      { op: 'DELETE_POST', id: 'p1' },
      expect.objectContaining({ attempts: 8 }),
    );
  });

  it('LLM 失败时帖子保持 PENDING，不回写 moderation', async () => {
    const { processor, prisma } = createProcessor();
    prisma.client.aiRun.update.mockResolvedValueOnce({
      id: 'run-1',
      taskType: 'SOCIAL_MODERATE',
      model: 'deepseek-v4-flash',
      userId: 'u1',
      inputJson: { postId: 'p1' },
    });
    prisma.client.post.findUnique.mockResolvedValue({
      id: 'p1',
      body: '今天深蹲',
      deletedAt: null,
    });
    mockedRun.mockRejectedValue(new Error('no key'));

    await expect(processor.process(job('run-1'))).rejects.toThrow('no key');
    expect(prisma.client.post.update).not.toHaveBeenCalled();
    expect(prisma.client.aiRun.update).toHaveBeenLastCalledWith({
      where: { id: 'run-1' },
      data: expect.objectContaining({ status: 'FAILED' }),
    });
  });
});
