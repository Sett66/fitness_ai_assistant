import { REPORT_PDF_MAX_PAGES } from '../constants/limits';
import type { ErrorCode } from '../errors/codes';

/**
 * 业务字符串集中表（ARCH §3 packages/shared 目录树规划）。
 *
 * - errorMessagesZhCN：错误码 → 中文文案，覆盖全部 ErrorCode
 * - termsZhCN：业务术语字典，TODO 随各模块落地后再补
 *
 * 后端在 BizException 默认 message、前端在 toast 上都从这里取。
 */

export const errorMessagesZhCN: Readonly<Record<ErrorCode, string>> = {
  INTERNAL_ERROR: '服务器内部错误，请稍后再试',
  VALIDATION_FAILED: '提交内容不符合要求',
  NOT_FOUND: '资源不存在',
  FORBIDDEN: '没有访问该资源的权限',
  UNAUTHORIZED: '未登录或登录已过期',
  RATE_LIMITED: '操作过于频繁，请稍后再试',

  AUTH_INVALID_CREDENTIALS: '手机号或密码错误',
  AUTH_TOKEN_EXPIRED: '登录已过期，请重新登录',
  AUTH_TOKEN_INVALID: '凭证无效',
  AUTH_REFRESH_REVOKED: '会话已被撤销',
  AUTH_REGISTER_PHONE_TAKEN: '该手机号已被注册',
  AUTH_CAPTCHA_INVALID: '滑块验证失败，请重试',
  AUTH_CAPTCHA_EXPIRED: '验证已过期，请重新滑动验证',
  AUTH_SMS_CODE_INVALID: '验证码错误或已失效',
  AUTH_SMS_TOO_FREQUENT: '验证码发送过于频繁，请稍后再试',
  AUTH_RESET_PHONE_NOT_FOUND: '该手机号未注册',

  USER_NOT_FOUND: '用户不存在',
  PROFILE_INCOMPLETE: '请先完善个人档案',

  MEDIA_NOT_FOUND: '媒体资源不存在',
  MEDIA_UPLOAD_FAILED: '上传失败',
  MEDIA_TOO_LARGE: '文件过大',
  MEDIA_MIME_REJECTED: '文件格式不支持',

  AI_TASK_NOT_FOUND: '任务不存在',
  AI_TASK_LIMIT_EXCEEDED: '今日 AI 任务次数已达上限',
  AI_TASK_PARSE_FAILED: 'AI 输出解析失败',

  HEALTH_REPORT_NOT_FOUND: '体检报告不存在',
  HEALTH_REPORT_NOT_READY: '报告尚未分析完成，无法修正指标',
  HEALTH_REPORT_INVALID_METRIC: '指标不合法：key 必须在目录内，且不能重复',

  CONVERSATION_NOT_FOUND: '对话不存在',

  PLAN_NOT_FOUND: '计划不存在',
  PLAN_IN_PROGRESS: '正在生成中，请稍候',
  WORKOUT_NOT_FOUND: '打卡记录不存在',

  SOCIAL_POST_NOT_FOUND: '动态不存在或已删除',
  SOCIAL_COMMENT_NOT_FOUND: '评论不存在或已删除',
  SOCIAL_MEDIA_INVALID: '图片无效，请重新选择',
  SOCIAL_VISIBILITY_UNSUPPORTED: '暂不支持该可见性设置',
};

/**
 * 业务术语字典。
 * TODO（M2/M3 各模块落地后再补）：
 * - 训练动作中文别名（如 BENCH_PRESS → '卧推'）
 * - 餐次中文（BREAKFAST → '早餐'）
 * - 训练目标中文（MUSCLE_GAIN → '增肌'）
 * 等等。
 */
export const termsZhCN: Readonly<Record<string, string>> = {
  GENDER_MALE: '男',
  GENDER_FEMALE: '女',
  GENDER_OTHER: '其他',
  GOAL_MUSCLE_GAIN: '增肌',
  GOAL_FAT_LOSS: '减脂',
  GOAL_MAINTAIN: '维持',
  STRENGTH_ONE_RM: '极限重量 (kg)',
  STRENGTH_WORKING_WEIGHT: '做组重量 (kg)',
  STRENGTH_MAX_REPS: '最大次数',
  STRENGTH_ASSIST_WEIGHT: '辅助重量 (kg)',
  STRENGTH_ADDED_WEIGHT: '额外负重 (kg)',
  STRENGTH_BODYWEIGHT_HINT: '纯自重可只填次数；进阶可填负重，新手可填辅助重量',
  ONBOARDING_STEP_BASIC: '基础体征',
  ONBOARDING_STEP_IDENTITY: '账号与目标',
  ONBOARDING_STEP_OPTIONAL: '训练背景',
  HEALTH_REPORT_DISCLAIMER:
    '本分析仅从健身和生活方式角度提供参考，不构成医疗诊断、治疗建议或用药指导。如指标明显异常或身体不适，请及时咨询医生。',
  HEALTH_REPORT_SEE_DOCTOR: '建议尽快就医',
  HEALTH_REPORT_SEE_DOCTOR_HINT:
    '评估中存在危急或需医疗关注的指标，请尽快咨询医生。以下内容仅供健身参考，不构成诊断。',
  HEALTH_REPORT_PDF_PAGE_TRUNCATED: `PDF 页数超过上限，仅分析并预览前 ${REPORT_PDF_MAX_PAGES} 页。`,
  HEALTH_REPORT_EDITED_BADGE: '已人工校正',
};
