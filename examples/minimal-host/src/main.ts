import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";

import { loadPublishedScene } from "@web3d/publish";
import { createSceneViewer, type SceneViewer, type ViewerEvent } from "@web3d/runtime";

import { createHostAdapters } from "./runtime-adapters";
import { resolveTrustedContent, type TrustedContentRecord } from "./trusted-content";
import "./styles.css";

const viewerContainer = requiredElement<HTMLElement>("viewer");
const sceneStatus = requiredElement<HTMLElement>("scene-status");
const connectionDot = requiredElement<HTMLElement>("connection-dot");
const connectionValue = requiredElement<HTMLElement>("connection-value");
const selectionValue = requiredElement<HTMLElement>("selection-value");
const selectionOrigin = requiredElement<HTMLElement>("selection-origin");
const targetSelect = requiredElement<HTMLSelectElement>("target-select");
const focusButton = requiredElement<HTMLButtonElement>("focus-target");
const contentPanel = requiredElement<HTMLElement>("host-content");
const contentEyebrow = requiredElement<HTMLElement>("content-eyebrow");
const contentTitle = requiredElement<HTMLElement>("content-title");
const contentFields = requiredElement<HTMLElement>("content-fields");
const closeContent = requiredElement<HTMLButtonElement>("close-content");
const abortController = new AbortController();
let viewer: SceneViewer | null = null;

focusButton.addEventListener("click", () => void focusSelectedTarget());
closeContent.addEventListener("click", () => {
  contentPanel.hidden = true;
  focusButton.focus();
});
window.addEventListener(
  "pagehide",
  () => {
    abortController.abort();
    void viewer?.dispose();
  },
  { once: true },
);

void start();

async function start(): Promise<void> {
  try {
    const published = await loadPublishedScene({
      baseUrl: new URL("./published/", document.baseURI),
      signal: abortController.signal,
    });
    const adapters = createHostAdapters(published.manifest.requirements.dataSources);
    viewer = createSceneViewer(viewerContainer, {
      assetResolver: published.assetResolver,
      adapters: { ...adapters },
      canvasLabel: "Published factory scene",
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      onEvent: handleViewerEvent,
    });
    await viewer.load(published.document);
    await viewer.setView("factory-overview");
    focusButton.disabled = false;
    sceneStatus.dataset["state"] = "ready";
    sceneStatus.textContent = `Ready / revision ${published.document.revision}`;
  } catch {
    if (abortController.signal.aborted) return;
    sceneStatus.dataset["state"] = "error";
    sceneStatus.textContent = "Bundle unavailable";
    focusButton.disabled = true;
  }
}

function handleViewerEvent(event: ViewerEvent): void {
  if (event.type === "connection-change") {
    const label = titleCase(event.status);
    connectionValue.textContent = label;
    connectionDot.dataset["state"] = event.status;
    return;
  }
  if (event.type === "selection-change") {
    selectionValue.textContent = event.targetId ?? "None";
    selectionOrigin.textContent = titleCase(event.origin);
    return;
  }
  if (event.type === "hotspot-host-content-request") {
    const content = resolveTrustedContent(event.key);
    if (content === null) {
      sceneStatus.dataset["state"] = "error";
      sceneStatus.textContent = "Host content unavailable";
      return;
    }
    showHostContent(content);
  }
}

async function focusSelectedTarget(): Promise<void> {
  if (viewer === null) return;
  focusButton.disabled = true;
  try {
    await viewer.focusTarget(targetSelect.value, {
      select: true,
      durationMs: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 360,
      padding: 2.4,
    });
  } finally {
    focusButton.disabled = false;
  }
}

function showHostContent(content: TrustedContentRecord): void {
  contentEyebrow.textContent = content.eyebrow;
  contentTitle.textContent = content.title;
  contentFields.replaceChildren(
    ...content.fields.flatMap((field) => {
      const term = document.createElement("dt");
      const value = document.createElement("dd");
      term.textContent = field.label;
      value.textContent = field.value;
      return [term, value];
    }),
  );
  contentPanel.hidden = false;
  closeContent.focus();
}

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`Required host element ${id} is missing.`);
  return element as T;
}

function titleCase(value: string): string {
  return value.length === 0 ? value : `${value[0]!.toUpperCase()}${value.slice(1)}`;
}
