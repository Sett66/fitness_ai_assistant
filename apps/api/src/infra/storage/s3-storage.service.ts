import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import { type ConfigService } from '@nestjs/config';

export type PresignPutInput = {
  objectKey: string;
  mime: string;
  expiresSec: number;
  /** 覆盖 env S3_PUBLIC_ENDPOINT，用于开发期按客户端网络签发 */
  publicEndpoint?: string;
};

@Injectable()
export class S3StorageService {
  private readonly client: S3Client;

  private readonly presignClient: S3Client;

  private readonly bucket: string;

  private readonly publicEndpoint?: string;

  private readonly endpoint: string;

  private readonly region: string;

  private readonly forcePathStyle: boolean;

  private readonly credentials: { accessKeyId: string; secretAccessKey: string };

  constructor(config: ConfigService) {
    this.bucket = config.getOrThrow<string>('S3_BUCKET');
    this.publicEndpoint = config.get<string>('S3_PUBLIC_ENDPOINT');
    this.endpoint = config.getOrThrow<string>('S3_ENDPOINT');
    this.region = config.getOrThrow<string>('S3_REGION');
    this.forcePathStyle = config.get<boolean>('S3_FORCE_PATH_STYLE') ?? true;
    this.credentials = {
      accessKeyId: config.getOrThrow<string>('S3_ACCESS_KEY'),
      secretAccessKey: config.getOrThrow<string>('S3_SECRET_KEY'),
    };

    this.client = this.createClient(this.endpoint);
    this.presignClient = this.createClient(this.publicEndpoint ?? this.endpoint);
  }

  async presignGet(objectKey: string, expiresSec: number): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
    });
    return getSignedUrl(this.presignClient, command, { expiresIn: expiresSec });
  }

  async presignPut(input: PresignPutInput): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: input.objectKey,
      ContentType: input.mime,
    });
    const client = input.publicEndpoint
      ? this.createClient(input.publicEndpoint)
      : this.presignClient;
    return getSignedUrl(client, command, { expiresIn: input.expiresSec });
  }

  async head(
    objectKey: string,
  ): Promise<{ exists: boolean; sizeBytes?: number; contentType?: string }> {
    try {
      const res = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      );
      const sizeBytes = typeof res.ContentLength === 'number' ? res.ContentLength : undefined;
      const contentType = typeof res.ContentType === 'string' ? res.ContentType : undefined;
      return { exists: true, sizeBytes, contentType };
    } catch {
      return { exists: false };
    }
  }

  /** path-style 公开 URL（头像展示；依赖 S3_PUBLIC_ENDPOINT �?S3_ENDPOINT�?*/
  getPublicUrl(objectKey: string): string {
    const base = (this.publicEndpoint ?? this.endpoint).replace(/\/$/, '');
    return `${base}/${this.bucket}/${objectKey}`;
  }

  /**
   * Worker 内直�?MinIO 读图并转�?data URL�?   * 本地开�?MinIO 无公网地址时，Qwen-VL 无法拉取 presignGet URL，需内联传图�?   */
  async getObjectAsDataUrl(objectKey: string, maxBytes = 10 * 1024 * 1024): Promise<string> {
    const meta = await this.head(objectKey);
    if (!meta.exists) {
      throw new Error(`S3 object not found: ${objectKey}`);
    }
    if (meta.sizeBytes != null && meta.sizeBytes > maxBytes) {
      throw new Error(`Image exceeds inline vision limit (${maxBytes} bytes)`);
    }

    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
    );
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes?.length) {
      throw new Error(`S3 object empty: ${objectKey}`);
    }

    const contentType = meta.contentType ?? res.ContentType ?? 'image/jpeg';
    const base64 = Buffer.from(bytes).toString('base64');
    return `data:${contentType};base64,${base64}`;
  }

  private createClient(endpoint: string): S3Client {
    return new S3Client({
      region: this.region,
      endpoint,
      forcePathStyle: this.forcePathStyle,
      credentials: this.credentials,
    });
  }
}
