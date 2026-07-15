import { Braces, Download, FileArchive, FilePlus2, FolderOpen, Trash2, X } from "lucide-react";

import { useStudioI18n } from "../i18n/I18nProvider";

export interface RecentProjectItem {
  readonly id: string;
  readonly name: string;
  readonly revision: number;
  readonly updatedAt: string;
}

interface ProjectMenuProps {
  readonly currentProjectId: string;
  readonly recent: readonly RecentProjectItem[];
  readonly onClose: () => void;
  readonly onNew: () => void;
  readonly onOpen: (projectId: string) => void;
  readonly onDelete: (projectId: string) => void;
  readonly onImportArchive: () => void;
  readonly onImportJson: () => void;
  readonly onExportJson: () => void;
}

export function ProjectMenu(props: ProjectMenuProps) {
  const { formatters, t } = useStudioI18n();

  return (
    <section aria-label={t.projectMenu.ariaLabel} className="project-menu">
      <header>
        <strong>{t.projectMenu.title}</strong>
        <button
          aria-label={t.projectMenu.close}
          className="icon-button"
          type="button"
          onClick={props.onClose}
        >
          <X size={15} />
        </button>
      </header>
      <div className="project-menu-commands">
        <button type="button" onClick={props.onNew}>
          <FilePlus2 size={15} /> {t.projectMenu.new}
        </button>
        <button type="button" onClick={props.onImportArchive}>
          <FileArchive size={15} /> {t.projectMenu.importArchive}
        </button>
        <button type="button" onClick={props.onImportJson}>
          <Braces size={15} /> {t.projectMenu.importJson}
        </button>
        <button type="button" onClick={props.onExportJson}>
          <Download size={15} /> {t.projectMenu.exportJson}
        </button>
      </div>
      <div className="recent-projects">
        <span className="menu-label">{t.projectMenu.recent}</span>
        {props.recent.map((project) => (
          <div
            className={`recent-project ${project.id === props.currentProjectId ? "is-current" : ""}`}
            key={project.id}
          >
            <button
              className="recent-project-open"
              type="button"
              onClick={() => props.onOpen(project.id)}
            >
              <FolderOpen size={14} />
              <span>
                <strong>{project.name}</strong>
                <small>
                  {t.projectMenu.revision(project.revision)} ·{" "}
                  {formatters.formatDateTime(project.updatedAt)}
                </small>
              </span>
            </button>
            <button
              aria-label={t.projectMenu.delete(project.name)}
              className="tree-action"
              disabled={project.id === props.currentProjectId}
              title={t.projectMenu.deleteTitle}
              type="button"
              onClick={() => props.onDelete(project.id)}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
