interface FakeOwnerDocument {
  activeElement: null;
  createElement(tagName: string): FakeElement;
}

interface FakeElement {
  readonly children: { item(index: number): FakeElement | null };
  readonly dataset: Record<string, string>;
  readonly ownerDocument: FakeOwnerDocument;
  readonly style: Record<string, string>;
  className: string;
  hidden: boolean;
  tabIndex: number;
  addEventListener(): void;
  append(...children: FakeElement[]): void;
  getBoundingClientRect(): DOMRect;
  insertBefore(child: FakeElement, before: FakeElement | null): void;
  remove(): void;
  removeEventListener(): void;
  setAttribute(name: string, value: string): void;
}

export function createHotspotTestContainer(): HTMLElement {
  const ownerDocument = createOwnerDocument();
  const root = createElement(ownerDocument, 800, 600);
  return Object.assign(root, {
    clientHeight: 600,
    clientWidth: 800,
    replaceChildren(): void {},
  }) as unknown as HTMLElement;
}

function createOwnerDocument(): FakeOwnerDocument {
  const ownerDocument: FakeOwnerDocument = {
    activeElement: null,
    createElement: () => createElement(ownerDocument, 0, 0),
  };
  return ownerDocument;
}

function createElement(
  ownerDocument: FakeOwnerDocument,
  width: number,
  height: number,
): FakeElement {
  const entries: FakeElement[] = [];
  return {
    children: { item: (index) => entries[index] ?? null },
    dataset: {},
    ownerDocument,
    style: {},
    className: "",
    hidden: false,
    tabIndex: -1,
    addEventListener(): void {},
    append(...children): void {
      entries.push(...children);
    },
    getBoundingClientRect(): DOMRect {
      return {
        bottom: height,
        height,
        left: 0,
        right: width,
        top: 0,
        width,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      };
    },
    insertBefore(child, before): void {
      if (before === null) entries.push(child);
      else entries.splice(Math.max(0, entries.indexOf(before)), 0, child);
    },
    remove(): void {},
    removeEventListener(): void {},
    setAttribute(): void {},
  };
}
