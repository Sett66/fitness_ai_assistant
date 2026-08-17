/**
 * 位置模块中文文案
 *
 * 权限说明、拒绝提示、Toast 等面向用户的字符串。
 */

export const locationLabels = {
  /** Coach 首次触发定位前的 Alert 说明 */
  consentTitle: '位置信息说明',
  consentMessage:
    'FitnessTemp 会在您询问天气、出差找馆等场景获取当前位置，仅用于训练建议与周边健身房推荐。坐标不会分享给其他用户。',
  consentConfirm: '同意并继续',
  consentCancel: '暂不',

  /** 权限被拒绝后的 Toast */
  permissionDeniedToast: '未授权位置，可说明城市名或前往「我的」设置页开启',

  /** 获取位置失败（如超时、网络错误）的 Toast */
  locationFailedToast: '获取位置失败，将发送纯文本消息',

  /** 发帖附带城市：权限被拒绝 */
  postCityPermissionDenied: '未授权位置，可手动填写城市名',

  /** 发帖附带城市：GPS / 逆地理都拿不到城市 */
  postCityFailed: '未能自动定位，可手动填写城市',

  /** Profile / 设置页位置说明段落 */
  settingsTitle: '位置权限',
  settingsDescription:
    '开启后，Coach 可根据实时位置提供天气训练建议与周边健身房推荐。坐标仅用于对话内训练建议。发帖时如选择展示城市，仅城市名会对其他用户可见。',
  settingsGranted: '已授权',
  settingsDenied: '未授权',
  settingsGoSystem: '前往系统设置',
} as const;
