import path from "node:path";

import { auditReleaseDocs } from "./docs-audit.mjs";

const result = await auditReleaseDocs(path.resolve(import.meta.dirname, "../.."));
process.stdout.write(
  `release-docs status=PASS files=${result.files} local_links=${result.localLinks}\n`,
);
