import { Braces, Download, FileArchive, FilePlus2, FolderOpen, Trash2, X } from "lucide-react";

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
  return (
    <section aria-label="Project menu" className="project-menu">
      <header>
        <strong>Project</strong>
        <button
          aria-label="Close project menu"
          className="icon-button"
          type="button"
          onClick={props.onClose}
        >
          <X size={15} />
        </button>
      </header>
      <div className="project-menu-commands">
        <button type="button" onClick={props.onNew}>
          <FilePlus2 size={15} /> New
        </button>
        <button type="button" onClick={props.onImportArchive}>
          <FileArchive size={15} /> Import archive
        </button>
        <button type="button" onClick={props.onImportJson}>
          <Braces size={15} /> Import JSON
        </button>
        <button type="button" onClick={props.onExportJson}>
          <Download size={15} /> Export JSON
        </button>
      </div>
      <div className="recent-projects">
        <span className="menu-label">Recent</span>
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
                  r{project.revision} · {formatDate(project.updatedAt)}
                </small>
              </span>
            </button>
            <button
              aria-label={`Delete ${project.name}`}
              className="tree-action"
              disabled={project.id === props.currentProjectId}
              title="Delete local project"
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

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
}
