import { Box, FileBox, Upload } from "lucide-react";

import type { SceneAsset } from "@web3d/document";

import { useStudioI18n } from "../i18n/I18nProvider";

interface AssetListProps {
  readonly assets: readonly SceneAsset[];
  readonly editable: boolean;
  readonly onImport: () => void;
}

export function AssetList({ assets, editable, onImport }: AssetListProps) {
  const { formatters, t } = useStudioI18n();

  return (
    <div className="asset-panel">
      <button
        className="asset-import-command"
        disabled={!editable}
        type="button"
        onClick={onImport}
      >
        <Upload size={14} /> {t.assetList.importModel}
      </button>
      <div className="asset-list">
        {assets.map((asset) => (
          <div className="asset-row" key={asset.id}>
            <span className="asset-icon">
              <FileBox size={14} />
            </span>
            <span>
              <strong>{asset.name}</strong>
              <small>
                {asset.mediaType === "model/gltf-binary" ? "GLB" : "glTF"} ·{" "}
                {formatters.formatBytes(asset.byteLength)}
              </small>
            </span>
            <span className="mono">{asset.sha256.slice(0, 8)}</span>
          </div>
        ))}
        {assets.length === 0 && (
          <div className="asset-empty">
            <Box size={16} />
            <span>{t.assetList.empty}</span>
          </div>
        )}
      </div>
    </div>
  );
}
