export interface DocumentIdNamespace {
  readonly id: string;
  readonly assets: readonly { readonly id: string }[];
  readonly entities: readonly { readonly id: string }[];
  readonly targets: readonly { readonly id: string }[];
  readonly dataSources: readonly { readonly id: string }[];
  readonly bindings: readonly { readonly id: string }[];
  readonly ruleSets: readonly {
    readonly id: string;
    readonly rules: readonly { readonly id: string }[];
  }[];
  readonly annotations: readonly { readonly id: string }[];
  readonly views: readonly { readonly id: string }[];
}

export function nextAnnotationId(document: DocumentIdNamespace): string {
  const used = collectDocumentIds(document);
  for (let sequence = 1; ; sequence += 1) {
    const candidate = `annotation-${sequence}`;
    if (!used.has(candidate)) return candidate;
  }
}

function collectDocumentIds(document: DocumentIdNamespace): ReadonlySet<string> {
  const ids = new Set<string>([document.id]);
  const add = (values: readonly { readonly id: string }[]): void => {
    values.forEach((value) => ids.add(value.id));
  };
  add(document.assets);
  add(document.entities);
  add(document.targets);
  add(document.dataSources);
  add(document.bindings);
  add(document.ruleSets);
  document.ruleSets.forEach((ruleSet) => add(ruleSet.rules));
  add(document.annotations);
  add(document.views);
  return ids;
}
