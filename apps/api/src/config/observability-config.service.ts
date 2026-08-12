import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ObservabilityConfigService {
  constructor(private readonly config: ConfigService) {}

  isLangfuseEnabled(): boolean {
    return this.config.get<string>('LANGFUSE_ENABLED', 'false') === 'true';
  }

  getPublicKey(): string {
    return this.config.get<string>('LANGFUSE_PUBLIC_KEY', '') ?? '';
  }

  getSecretKey(): string {
    return this.config.get<string>('LANGFUSE_SECRET_KEY', '') ?? '';
  }

  getBaseUrl(): string {
    return this.config.get<string>('LANGFUSE_BASE_URL', 'https://cloud.langfuse.com') ?? '';
  }

  getSampleRate(): number {
    const raw = this.config.get<string | number>('LANGFUSE_SAMPLE_RATE', '1');
    const rate = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(rate)) {
      return 1;
    }
    return Math.min(1, Math.max(0, rate));
  }

  shouldSample(): boolean {
    const rate = this.getSampleRate();
    if (rate >= 1) {
      return true;
    }
    if (rate <= 0) {
      return false;
    }
    return Math.random() < rate;
  }

  getEnvironment(): string {
    return this.config.get<string>('NODE_ENV', 'development') ?? 'development';
  }
}
