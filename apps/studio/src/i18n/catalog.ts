import type { CatalogShape } from "@web3d/demo-support/i18n";

import type { StudioAppErrorDetailsByCode } from "../errors";

export const english = {
  app: {
    documentTitle: "Web3D Studio",
    sizeGate: "Studio requires a 1280px desktop viewport.",
    openingProject: "Opening project",
    openingLocalProject: "Opening local project",
    navigationLabel: "Scene navigation",
    sourceSummary: {
      sceneTab: "Scene",
      assetsTab: "Assets",
      runMode: "Run mode",
      localProject: "Local project",
      revision: (revision: number) => `revision ${revision}`,
    },
    viewport: {
      label: "Studio 3D viewport",
      canvasLabel: "Interactive 3D scene",
      noSelection: "NO SELECTION",
      modeStatus: {
        edit: "EDIT",
        run: "RUN",
      },
      toolStatus: {
        select: "SELECT",
        translate: "TRANSLATE",
        rotate: "ROTATE",
        scale: "SCALE",
      },
    },
    diagnostics: {
      label: "Diagnostics",
      ready: "document=valid storage=indexeddb authoring=ready",
    },
    languageSwitch: {
      ariaLabel: "Studio language",
      chineseLabel: "Chinese",
      englishLabel: "English",
    },
  },
  toolbar: {
    openProjectMenu: "Open project menu",
    projectMenu: "Project",
    historyGroup: "History",
    authoringToolsGroup: "Authoring tools",
    modeGroup: "Studio mode",
    undo: "Undo",
    redo: "Redo",
    save: "Save local project",
    duplicate: "Duplicate selection",
    delete: "Delete selection",
    import: "Import",
    export: "Export",
    exportOutdated: "Export outdated",
    editMode: "Edit",
    runMode: "Run",
    tools: {
      select: "Select",
      translate: "Move",
      rotate: "Rotate",
      scale: "Scale",
    },
    saveState: {
      saving: "Saving",
      failed: "Save failed",
      saved: "Saved locally",
    },
  },
  projectMenu: {
    ariaLabel: "Project menu",
    close: "Close project menu",
    title: "Project",
    new: "New",
    importArchive: "Import archive",
    importJson: "Import JSON",
    exportJson: "Export JSON",
    recent: "Recent",
    delete: (name: string) => `Delete ${name}`,
    deleteTitle: "Delete local project",
    revision: (revision: number) => `r${revision}`,
  },
  sceneTree: {
    ariaLabel: "Scene tree",
    hide: "Hide",
    show: "Show",
    lock: "Lock",
    unlock: "Unlock",
    visibilityAction: (visible: boolean, name: string) => `${visible ? "Hide" : "Show"} ${name}`,
    lockAction: (locked: boolean, name: string) => `${locked ? "Unlock" : "Lock"} ${name}`,
  },
  assetList: {
    importModel: "Import model",
    empty: "No assets",
  },
  importDialog: {
    title: "Import model",
    close: "Close import",
    inspecting: "Inspecting model",
    failed: "Import failed",
    metrics: {
      nodes: "Nodes",
      meshes: "Meshes",
      materials: "Materials",
      triangles: "Triangles",
    },
    details: {
      format: "Format",
      size: "Size",
      sha256: "SHA-256",
    },
    cancel: "Cancel",
    confirm: "Add to scene",
  },
  inspector: {
    ariaLabel: "Inspector",
    title: "Inspector",
    empty: "No selection",
    entity: "Entity",
    name: "Name",
    type: "Type",
    parent: "Parent",
    sceneRoot: "scene root",
    transform: "Transform",
    position: "Position",
    scale: "Scale",
    rotation: "Rotation",
    locked: "Locked",
    axis: {
      x: "X",
      y: "Y",
      z: "Z",
    },
    vectorAxis: (label: string, axis: string) => `${label} ${axis}`,
  },
  errors: {
    localSaveFailed: "Local save failed.",
    importCommitting: "Import is being committed.",
    projectRepositoryNotReady: "Project repository is not ready.",
    autosaveNotReady: "Autosave is not ready.",
    projectNameRequired: "Project name is required.",
    newProjectInvalid: "New project is invalid.",
    projectTimestampInvalid: "Project timestamp is invalid.",
    documentCommandsDisabledInRunMode: "Document commands are disabled in Run mode.",
    documentRevisionNotMonotonic: ({
      current,
      next,
    }: StudioAppErrorDetailsByCode["DOCUMENT_REVISION_NOT_MONOTONIC"]) =>
      `Document revision must increase from ${current}; received ${next}.`,
    assetHashAmbiguous: ({ sha256 }: StudioAppErrorDetailsByCode["ASSET_HASH_AMBIGUOUS"]) =>
      `Asset hash ${sha256} maps to multiple SceneAsset records.`,
    assetHashConflict: ({ sha256 }: StudioAppErrorDetailsByCode["ASSET_HASH_CONFLICT"]) =>
      `Asset hash ${sha256} conflicts with the existing SceneAsset.`,
    entityNotFound: ({ entityId }: StudioAppErrorDetailsByCode["ENTITY_NOT_FOUND"]) =>
      `Entity ${entityId} does not exist.`,
    sceneDocumentValidationFailed: ({
      diagnostic,
    }: StudioAppErrorDetailsByCode["SCENE_DOCUMENT_VALIDATION_FAILED"]) =>
      diagnostic === undefined
        ? "SceneDocument validation failed."
        : `SceneDocument validation failed: ${diagnostic.code} at ${diagnostic.path || "/"}: ${diagnostic.message}`,
    assetUriMismatch: ({ assetId, sha256 }: StudioAppErrorDetailsByCode["ASSET_URI_MISMATCH"]) =>
      `Asset ${assetId} must use asset://${sha256}.`,
    indexedDbUnavailable: "IndexedDB is not available in this environment.",
    assetNotReferenced: ({ sha256 }: StudioAppErrorDetailsByCode["ASSET_NOT_REFERENCED"]) =>
      `Asset ${sha256} is not referenced by the SceneDocument.`,
    assetBytesMissing: ({ sha256 }: StudioAppErrorDetailsByCode["ASSET_BYTES_MISSING"]) =>
      `Asset bytes for ${sha256} are missing from the repository.`,
    projectNotFound: ({ projectId }: StudioAppErrorDetailsByCode["PROJECT_NOT_FOUND"]) =>
      `Project ${projectId} does not exist.`,
    assetNotFound: ({ sha256 }: StudioAppErrorDetailsByCode["ASSET_NOT_FOUND"]) =>
      `Asset ${sha256} does not exist.`,
    projectRepositoryClosed: "Project repository is closed.",
    assetSha256Mismatch: ({
      expectedSha256,
      receivedSha256,
    }: StudioAppErrorDetailsByCode["ASSET_SHA256_MISMATCH"]) =>
      `Asset SHA-256 mismatch for ${expectedSha256}; received ${receivedSha256}.`,
    insufficientStorageCapacity: ({
      remainingBytes,
      requiredBytes,
    }: StudioAppErrorDetailsByCode["INSUFFICIENT_STORAGE_CAPACITY"]) =>
      `Insufficient storage capacity: ${remainingBytes} bytes remain, ${requiredBytes} bytes required.`,
    storedProjectInvalid: ({ projectId }: StudioAppErrorDetailsByCode["STORED_PROJECT_INVALID"]) =>
      `Project ${projectId} contains an invalid SceneDocument.`,
    unsupportedAssetUri: ({ uri }: StudioAppErrorDetailsByCode["UNSUPPORTED_ASSET_URI"]) =>
      `Unsupported asset URI ${uri}.`,
    indexedDbOpenFailed: "Failed to open IndexedDB.",
    indexedDbRequestFailed: "IndexedDB request failed.",
    indexedDbTransactionAborted: "IndexedDB transaction aborted.",
    indexedDbTransactionFailed: "IndexedDB transaction failed.",
  },
  defaults: {
    untitledScene: "Untitled Scene",
    importedModel: "Imported model",
    fileNameScene: "scene",
  },
} as const;

export const chinese: CatalogShape<typeof english> = {
  app: {
    documentTitle: "Web3D Studio 编辑器",
    sizeGate: "Studio 需要至少 1280px 的桌面视口。",
    openingProject: "正在打开项目",
    openingLocalProject: "正在打开本地项目",
    navigationLabel: "场景导航",
    sourceSummary: {
      sceneTab: "场景",
      assetsTab: "资源",
      runMode: "运行模式",
      localProject: "本地项目",
      revision: (revision) => `修订 ${revision}`,
    },
    viewport: {
      label: "Studio 3D 视口",
      canvasLabel: "交互式 3D 场景",
      noSelection: "未选择",
      modeStatus: {
        edit: "编辑",
        run: "运行",
      },
      toolStatus: {
        select: "选择",
        translate: "平移",
        rotate: "旋转",
        scale: "缩放",
      },
    },
    diagnostics: {
      label: "诊断",
      ready: "document=valid storage=indexeddb authoring=ready",
    },
    languageSwitch: {
      ariaLabel: "Studio 语言",
      chineseLabel: "中文",
      englishLabel: "英文",
    },
  },
  toolbar: {
    openProjectMenu: "打开项目菜单",
    projectMenu: "项目",
    historyGroup: "历史记录",
    authoringToolsGroup: "编辑工具",
    modeGroup: "Studio 模式",
    undo: "撤销",
    redo: "重做",
    save: "保存本地项目",
    duplicate: "复制所选内容",
    delete: "删除所选内容",
    import: "导入",
    export: "导出",
    exportOutdated: "导出已过期",
    editMode: "编辑",
    runMode: "运行",
    tools: {
      select: "选择",
      translate: "移动",
      rotate: "旋转",
      scale: "缩放",
    },
    saveState: {
      saving: "正在保存",
      failed: "保存失败",
      saved: "已保存到本地",
    },
  },
  projectMenu: {
    ariaLabel: "项目菜单",
    close: "关闭项目菜单",
    title: "项目",
    new: "新建",
    importArchive: "导入归档",
    importJson: "导入 JSON",
    exportJson: "导出 JSON",
    recent: "最近项目",
    delete: (name) => `删除 ${name}`,
    deleteTitle: "删除本地项目",
    revision: (revision) => `r${revision}`,
  },
  sceneTree: {
    ariaLabel: "场景树",
    hide: "隐藏",
    show: "显示",
    lock: "锁定",
    unlock: "解锁",
    visibilityAction: (visible, name) => `${visible ? "隐藏" : "显示"} ${name}`,
    lockAction: (locked, name) => `${locked ? "解锁" : "锁定"} ${name}`,
  },
  assetList: {
    importModel: "导入模型",
    empty: "暂无资源",
  },
  importDialog: {
    title: "导入模型",
    close: "关闭导入",
    inspecting: "正在检查模型",
    failed: "导入失败",
    metrics: {
      nodes: "节点",
      meshes: "网格",
      materials: "材质",
      triangles: "三角形",
    },
    details: {
      format: "格式",
      size: "大小",
      sha256: "SHA-256",
    },
    cancel: "取消",
    confirm: "添加到场景",
  },
  inspector: {
    ariaLabel: "检查器",
    title: "检查器",
    empty: "未选择任何对象",
    entity: "实体",
    name: "名称",
    type: "类型",
    parent: "父级",
    sceneRoot: "场景根节点",
    transform: "变换",
    position: "位置",
    scale: "缩放",
    rotation: "旋转",
    locked: "已锁定",
    axis: {
      x: "X",
      y: "Y",
      z: "Z",
    },
    vectorAxis: (label, axis) => `${label} ${axis}`,
  },
  errors: {
    localSaveFailed: "本地保存失败。",
    importCommitting: "模型正在导入中。",
    projectRepositoryNotReady: "项目仓库尚未就绪。",
    autosaveNotReady: "自动保存尚未就绪。",
    projectNameRequired: "项目名称不能为空。",
    newProjectInvalid: "新项目无效。",
    projectTimestampInvalid: "项目时间戳无效。",
    documentCommandsDisabledInRunMode: "运行模式下无法执行文档命令。",
    documentRevisionNotMonotonic: ({ current, next }) =>
      `文档修订版本必须从 ${current} 增加；收到 ${next}。`,
    assetHashAmbiguous: ({ sha256 }) => `资源哈希 ${sha256} 对应多条 SceneAsset 记录。`,
    assetHashConflict: ({ sha256 }) => `资源哈希 ${sha256} 与现有 SceneAsset 冲突。`,
    entityNotFound: ({ entityId }) => `实体 ${entityId} 不存在。`,
    sceneDocumentValidationFailed: ({ diagnostic }) =>
      diagnostic === undefined
        ? "SceneDocument 验证失败。"
        : `SceneDocument 验证失败：${diagnostic.code}，位置 ${diagnostic.path || "/"}：${diagnostic.message}`,
    assetUriMismatch: ({ assetId, sha256 }) => `资源 ${assetId} 必须使用 asset://${sha256}。`,
    indexedDbUnavailable: "当前环境不支持 IndexedDB。",
    assetNotReferenced: ({ sha256 }) => `资源 ${sha256} 未被 SceneDocument 引用。`,
    assetBytesMissing: ({ sha256 }) => `仓库中缺少资源 ${sha256} 的二进制数据。`,
    projectNotFound: ({ projectId }) => `项目 ${projectId} 不存在。`,
    assetNotFound: ({ sha256 }) => `资源 ${sha256} 不存在。`,
    projectRepositoryClosed: "项目仓库已关闭。",
    assetSha256Mismatch: ({ expectedSha256, receivedSha256 }) =>
      `资源 SHA-256 不匹配：预期 ${expectedSha256}；实际 ${receivedSha256}。`,
    insufficientStorageCapacity: ({ remainingBytes, requiredBytes }) =>
      `存储空间不足：剩余 ${remainingBytes} 字节，需要 ${requiredBytes} 字节。`,
    storedProjectInvalid: ({ projectId }) => `项目 ${projectId} 包含无效的 SceneDocument。`,
    unsupportedAssetUri: ({ uri }) => `不支持的资源 URI ${uri}。`,
    indexedDbOpenFailed: "无法打开 IndexedDB。",
    indexedDbRequestFailed: "IndexedDB 请求失败。",
    indexedDbTransactionAborted: "IndexedDB 事务已中止。",
    indexedDbTransactionFailed: "IndexedDB 事务失败。",
  },
  defaults: {
    untitledScene: "未命名场景",
    importedModel: "导入的模型",
    fileNameScene: "场景",
  },
};

export const studioCatalogs = {
  en: english,
  "zh-CN": chinese,
} as const;

export type StudioCatalog = CatalogShape<typeof english>;
