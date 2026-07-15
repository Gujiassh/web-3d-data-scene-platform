import type { MockDataSource } from "@web3d/document";

import { useStudioI18n } from "../i18n/I18nProvider";
import { mockScenario } from "./mock-scenarios";
import { enumerateSampleFields } from "./sample-fields";

interface DataPathPickerProps {
  readonly source: MockDataSource | null;
  readonly value: string;
  readonly onChange: (pointer: string) => void;
}

export function DataPathPicker({ source, value, onChange }: DataPathPickerProps) {
  const { t } = useStudioI18n();
  const scenario = source === null ? null : mockScenario(source.options.scenario);
  const fields = scenario === null ? [] : enumerateSampleFields(scenario.sample);
  const selected = fields.find((field) => field.pointer === value);

  return (
    <div className="data-path-picker">
      <label className="data-field data-field-full">
        <span>{t.dataBinding.path.path}</span>
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">{t.dataBinding.path.none}</option>
          {fields.map((field) => (
            <option key={field.pointer} value={field.pointer}>
              {field.pointer}
            </option>
          ))}
        </select>
      </label>
      {selected !== undefined && (
        <dl className="data-properties data-path-details">
          <div>
            <dt>{t.dataBinding.path.sample}</dt>
            <dd className="mono">{formatSample(selected.value)}</dd>
          </div>
          <div>
            <dt>{t.dataBinding.path.type}</dt>
            <dd>{selected.valueType}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}

function formatSample(value: string | number | boolean | null): string {
  return value === null ? "null" : typeof value === "string" ? value : String(value);
}
