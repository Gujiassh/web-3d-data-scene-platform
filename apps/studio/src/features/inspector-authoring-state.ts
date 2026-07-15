export function inspectorAuthoringStateKey(projectId: string, documentId: string): string {
  return JSON.stringify([projectId, documentId]);
}
