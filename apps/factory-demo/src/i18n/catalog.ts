import type { CatalogShape } from "@web3d/demo-support/i18n";

export const english = {
  meta: {
    title: "Factory Demo",
  },
  header: {
    name: "Factory Cell M0",
    subtitle: "Runtime contract demo",
    connection: "Connection",
    languageSwitch: "Interface language",
    switchToChinese: "Switch to Chinese",
    switchToEnglish: "Switch to English",
    restartSequence: "Restart sequence",
    restartSequenceTitle: "Restart telemetry sequence",
  },
  rails: {
    equipment: "Equipment",
    viewer: "Factory 3D view",
    operations: "Runtime operations",
  },
  equipment: {
    focusTitle: (label: string) => `Focus ${label}`,
    labels: {
      press01: "Press 01",
      conveyor01: "Conveyor 01",
    },
    areas: {
      forming: "Forming",
      transfer: "Transfer",
    },
  },
  viewer: {
    canvasLabel: "Factory 3D scene",
    loading: "Loading validated scene...",
    loadError: (message: string) => `Scene load failed: ${message}`,
    loadErrorReasons: {
      httpRequestFailed: (status: number) => `Request returned HTTP ${status}.`,
      sceneDocumentValidationFallback: "SceneDocument validation failed.",
    },
    noSelection: "NO SELECTION",
  },
  metrics: {
    targets: "Targets",
    bindings: "Bindings",
    alarms: "Alarms",
  },
  selected: {
    heading: "Selected target",
    empty: "Select a machine in the view or equipment list.",
    target: "Target",
    businessId: "Business ID",
    connection: "Connection",
  },
  alarms: {
    heading: "Active alarms",
    none: "No active alarms",
    focusTitle: (targetId: string) => `Focus ${targetId}`,
  },
  diagnostics: {
    heading: "Diagnostics",
    recent: (count: string) => `${count} recent`,
  },
  states: {
    connection: {
      connecting: "connecting",
      online: "online",
      stale: "stale",
      offline: "offline",
      error: "error",
    },
    equipment: {
      connecting: "connecting",
      running: "running",
      stale: "stale",
      offline: "offline",
      error: "error",
      info: "info",
      warning: "warning",
      critical: "critical",
    },
  },
  alarmsByRuleId: {
    "status-offline": "Telemetry offline",
    "status-fault": "Equipment fault",
    "equipment-status:fallback": "Unknown equipment state",
  },
  telemetry: {
    pointer: "/machines/*/status",
  },
} as const;

export type FactoryCatalog = CatalogShape<typeof english>;

export const zhCN = {
  meta: {
    title: "工厂演示",
  },
  header: {
    name: "工厂单元 M0",
    subtitle: "运行时合同演示",
    connection: "连接",
    languageSwitch: "界面语言",
    switchToChinese: "切换到中文",
    switchToEnglish: "切换到英文",
    restartSequence: "重启序列",
    restartSequenceTitle: "重新启动遥测序列",
  },
  rails: {
    equipment: "设备",
    viewer: "工厂 3D 视图",
    operations: "运行操作",
  },
  equipment: {
    focusTitle: (label: string) => `聚焦 ${label}`,
    labels: {
      press01: "冲压机 01",
      conveyor01: "传送带 01",
    },
    areas: {
      forming: "成型区",
      transfer: "转运区",
    },
  },
  viewer: {
    canvasLabel: "工厂 3D 场景",
    loading: "正在加载已校验场景...",
    loadError: (message: string) => `场景加载失败：${message}`,
    loadErrorReasons: {
      httpRequestFailed: (status: number) => `请求返回 HTTP ${status}。`,
      sceneDocumentValidationFallback: "SceneDocument 校验失败。",
    },
    noSelection: "未选择",
  },
  metrics: {
    targets: "目标",
    bindings: "绑定",
    alarms: "告警",
  },
  selected: {
    heading: "已选目标",
    empty: "在视图或设备列表中选择一台设备。",
    target: "目标",
    businessId: "业务 ID",
    connection: "连接",
  },
  alarms: {
    heading: "活动告警",
    none: "当前无活动告警",
    focusTitle: (targetId: string) => `聚焦 ${targetId}`,
  },
  diagnostics: {
    heading: "诊断",
    recent: (count: string) => `最近 ${count} 条`,
  },
  states: {
    connection: {
      connecting: "连接中",
      online: "在线",
      stale: "数据陈旧",
      offline: "离线",
      error: "错误",
    },
    equipment: {
      connecting: "连接中",
      running: "运行中",
      stale: "数据陈旧",
      offline: "离线",
      error: "错误",
      info: "信息",
      warning: "警告",
      critical: "严重",
    },
  },
  alarmsByRuleId: {
    "status-offline": "遥测离线",
    "status-fault": "设备故障",
    "equipment-status:fallback": "设备状态未知",
  },
  telemetry: {
    pointer: "/machines/*/status",
  },
} satisfies FactoryCatalog;
