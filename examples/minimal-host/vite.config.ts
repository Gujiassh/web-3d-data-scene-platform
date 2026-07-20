import { existsSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve, sep } from "node:path";

import { defineConfig, type Plugin } from "vite";

const contentSecurityPolicy =
  "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' blob: data:; connect-src 'self' wss:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'self'";

export default defineConfig({
  base: "./",
  plugins: [publishedPathGuard()],
  server: {
    headers: { "Content-Security-Policy": contentSecurityPolicy },
  },
  preview: {
    headers: { "Content-Security-Policy": contentSecurityPolicy },
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: "three-runtime", test: /node_modules[\\/]three[\\/]/, priority: 20 }],
        },
      },
    },
  },
});

function publishedPathGuard(): Plugin {
  return {
    name: "published-path-404-guard",
    configureServer(server) {
      server.middlewares.use(guard(resolve(import.meta.dirname, "public")));
    },
    configurePreviewServer(server) {
      server.middlewares.use(guard(resolve(import.meta.dirname, "dist")));
    },
  };
}

function guard(root: string) {
  const publishedRoot = resolve(root, "published");
  return (
    request: IncomingMessage,
    response: ServerResponse,
    next: (error?: unknown) => void,
  ): void => {
    if (request.url === undefined) return next();
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    } catch {
      return notFound(response);
    }
    if (!pathname.startsWith("/published/")) return next();
    const target = resolve(root, pathname.slice(1));
    if (
      !target.startsWith(`${publishedRoot}${sep}`) ||
      !existsSync(target) ||
      !statSync(target).isFile()
    ) {
      return notFound(response);
    }
    next();
  };
}

function notFound(response: ServerResponse): void {
  response.statusCode = 404;
  response.setHeader("Content-Type", "text/plain; charset=utf-8");
  response.end("Not found.");
}
