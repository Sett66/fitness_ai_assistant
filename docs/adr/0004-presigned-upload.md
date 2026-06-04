# 0004 — 客户端直传：预签名（Presigned）上传

## Context

移动端需要上传**餐食照片等二进制**，若经 API 中转会占带宽、拖慢 TTL，且不利于水平扩展。[`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) §6 定义了「签 URL → 客户端 PUT → complete」流程；本地开发使用 **MinIO**（S3 兼容）。

## Decision

1. **接口**（M2 实装于 `apps/api`）
   - `POST /v1/uploads/sign`：校验 mime/大小/配额后返回 **`uploadUrl`** + **`objectKey`**。
   - 客户端 **PUT** 至对象存储。
   - `POST /v1/uploads/complete`：服务端 **HEAD** 校验对象存在后写入 **`Media`** 表。

2. **抽象**  
   定义 **`StorageProvider`**（`presignPut` / `presignGet` / `head` / `delete`）。**MVP** 实现为 **MinIO**（`@aws-sdk/client-s3` + presigner）；换云厂商只换实现。

3. **本地基础设施**  
   M1 在 **`docker/docker-compose.yml`** 中启动 MinIO，并用 **`mc` init 容器**创建 **`media` bucket**（镜像不会自动建桶，见 HANDOFF §4 坑 #4）。

4. **安全**  
   上传 URL **短时有效**；读写密钥仅存服务端 env；**不**在 MVP 将 bucket 对公网匿名可读（除非后续产品明确要求 CDN 读路径并另述）。

## Consequences

- **正面**：API 轻量、易扩缩；与 PRD「multipart 走预签名」一致。
- **负面**：客户端需处理 PUT 失败重试、complete 与业务状态一致性（M2 需幂等与错误码约定）。
- **真机调试**：若手机与电脑不同网段，**`presign` 中的 host** 可能需配置为宿主机局域网 IP（`.env.example` 已留注释位）。

## Status

Accepted · 2026-05-18
