import type { StudioProjectRepository, StudioProjectSnapshot } from "../project";

export interface InitializeRepositoryOptions {
  readonly repository: StudioProjectRepository;
  readonly signal: AbortSignal;
  readonly loadStarter: (signal: AbortSignal) => Promise<StudioProjectSnapshot>;
  readonly withAuthority?: (
    operation: () => Promise<InitializedRepository>,
  ) => Promise<InitializedRepository>;
}

export interface InitializedRepository {
  readonly current: StudioProjectSnapshot;
  readonly items: Awaited<ReturnType<StudioProjectRepository["listRecent"]>>;
}

export async function initializeRepository(
  options: InitializeRepositoryOptions,
): Promise<InitializedRepository> {
  return options.withAuthority === undefined
    ? initializeWithAuthority(options)
    : options.withAuthority(() => initializeWithAuthority(options));
}

async function initializeWithAuthority(
  options: InitializeRepositoryOptions,
): Promise<InitializedRepository> {
  const existing = await options.repository.listRecent();
  assertActive(options.signal);
  if (existing[0] !== undefined) {
    return {
      current: await options.repository.open(existing[0].id),
      items: await options.repository.listRecent(),
    };
  }

  const starter = await options.loadStarter(options.signal);
  assertActive(options.signal);

  // A second tab may have completed initialization while the archive was loading.
  const raced = await options.repository.listRecent();
  if (raced[0] !== undefined) {
    return {
      current: await options.repository.open(raced[0].id),
      items: await options.repository.listRecent(),
    };
  }

  const current = await options.repository.save(starter);
  return { current, items: await options.repository.listRecent() };
}

function assertActive(signal: AbortSignal): void {
  if (!signal.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason
    : new DOMException("Repository initialization was aborted.", "AbortError");
}
