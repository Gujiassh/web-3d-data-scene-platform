export const MAX_ANNOTATION_LINK_LENGTH = 2048;

export function isValidAnnotationOpenLinkHref(href: string): boolean {
  if (
    href.length === 0 ||
    [...href].length > MAX_ANNOTATION_LINK_LENGTH ||
    !href.startsWith("https://")
  ) {
    return false;
  }

  try {
    const url = new URL(href);
    return url.protocol === "https:" && url.username === "" && url.password === "";
  } catch {
    return false;
  }
}
