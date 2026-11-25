import { writeFileSync } from "node:fs";
import type { ServerResponse } from "node:http";
import path from "node:path";

import type { Connect, Plugin, ResolvedConfig, ViteDevServer } from "vite";

import { PUBLIC_MODE } from "../src/mode";
import { SEARCH_INDEX_BASE, parseApiPath } from "../src/records/api-paths";
import {
  applyReviews,
  parseReviewInputs,
  resolveFactPath,
  type ReviewMap,
} from "../src/records/reviews";
import { DataSource, emitStatic } from "./data-source";
import { emitSearch, SearchCorpus } from "./search-index";

/**
 * The data API. The dataset IS the JSON files under data/ — facts in <collection>.json,
 * fact-level reviews in the <collection>.reviews.json sidecar — so every review click lands as
 * a clean git diff. URL grammar: src/records/api-paths.ts; payloads: ./data-source.ts.
 *
 * Dev server — every GET resource, read live from data/ (including the gitignored
 * data/texts/local/), plus the one write:
 *   POST /api/data/:collection/reviews → body: ReviewInput | ReviewInput[]; applies the batch
 *                                         as one write and returns the updated { records, reviews }
 *
 * Build — the same GET payloads written as static files under dist/api/, committed content
 * only. The published site has no write path; the client hides review controls there.
 */
const API_MOUNT = "/api";
const DATA_DIR = path.resolve(__dirname, "../data");
const JSON_INDENT = 2;

const reviewsPath = (collection: string) => path.join(DATA_DIR, `${collection}.reviews.json`);

const writeReviews = (collection: string, reviews: ReviewMap) =>
  writeFileSync(reviewsPath(collection), `${JSON.stringify(reviews, null, JSON_INDENT)}\n`);

const readBody = (req: Connect.IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });

const sendJson = (res: ServerResponse, status: number, body: unknown) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
};

const notFound = (res: ServerResponse) => sendJson(res, 404, { error: "not found" });

/** Pagefind's own file types; anything else (its compressed index chunks) is opaque bytes. */
const INDEX_TYPES: Record<string, string> = {
  ".js": "text/javascript",
  ".json": "application/json",
  ".css": "text/css",
};
const OPAQUE_TYPE = "application/octet-stream";

/** Dev: the search index, built in memory on the first request (about 25 s) and kept. */
const serveIndex = async (
  corpus: SearchCorpus,
  req: Connect.IncomingMessage,
  res: ServerResponse,
) => {
  const wanted = new URL(req.url ?? "/", "http://localhost").pathname.replace(/^\//, "");
  const file = (await corpus.files()).find((f) => f.path === wanted);
  if (!file) return notFound(res);
  res.setHeader("Content-Type", INDEX_TYPES[path.extname(file.path)] ?? OPAQUE_TYPE);
  res.end(file.content);
};

const handle = async (
  source: DataSource,
  corpus: SearchCorpus,
  published: boolean,
  req: Connect.IncomingMessage,
  res: ServerResponse,
) => {
  // connect strips the mount point from req.url; the grammar is written against full paths.
  const pathname = `${API_MOUNT}${new URL(req.url ?? "/", "http://localhost").pathname}`;
  const route = parseApiPath(pathname);
  if (!route) return notFound(res);

  if (route.kind === "reviews") {
    if (published) return sendJson(res, 405, { error: "the public build is read-only" });
    if (req.method !== "POST") return sendJson(res, 405, { error: "reviews are POST only" });
    const current = source.collection(route.collection);
    if (!current) return notFound(res);
    let body: unknown;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return sendJson(res, 400, { error: "invalid JSON body" });
    }
    const inputs = parseReviewInputs(body);
    if (!inputs) return sendJson(res, 400, { error: "invalid review input" });

    const dangling = inputs.find(
      (input) => resolveFactPath(current.records, input.path) === undefined,
    );
    if (dangling) return sendJson(res, 404, { error: `unknown fact path: ${dangling.path}` });

    const reviews = applyReviews(current.reviews, inputs, new Date().toISOString());
    writeReviews(route.collection, reviews);
    return sendJson(res, 200, { records: current.records, reviews });
  }

  if (req.method !== "GET") return sendJson(res, 405, { error: "read-only resource" });
  const body =
    route.kind === "collection"
      ? source.collection(route.collection)
      : route.kind === "registry"
        ? source.registry()
        : route.kind === "outline"
          ? source.outline()
          : route.kind === "words"
            ? corpus.words()
            : source.content(route.edition, route.unit);
  return body ? sendJson(res, 200, body) : notFound(res);
};

export const dataApiPlugin = (): Plugin => {
  let config: ResolvedConfig;
  return {
    name: "book-of-adam:data-api",
    configResolved: (resolved) => {
      config = resolved;
    },
    configureServer: (server: ViteDevServer) => {
      const published = config.mode === PUBLIC_MODE;
      const source = DataSource({ dataDir: DATA_DIR, published });
      const corpus = SearchCorpus(source);
      server.middlewares.use(API_MOUNT, (req, res) => {
        void handle(source, corpus, published, req, res).catch((error) =>
          sendJson(res, 500, { error: String(error) }),
        );
      });
      server.middlewares.use(SEARCH_INDEX_BASE, (req, res) => {
        void serveIndex(corpus, req, res).catch((error) =>
          sendJson(res, 500, { error: String(error) }),
        );
      });
    },
    closeBundle: async () => {
      if (config.command !== "build") return;
      const outDir = path.resolve(config.root, config.build.outDir);
      const source = DataSource({ dataDir: DATA_DIR, published: config.mode === PUBLIC_MODE });
      const written = emitStatic(source, outDir);
      config.logger.info(
        `book-of-adam: wrote ${written.length} static data files under ${outDir}/api`,
      );
      const indexed = await emitSearch(SearchCorpus(source), outDir);
      config.logger.info(
        `book-of-adam: wrote the search index (${indexed.length} files) under ${outDir}${SEARCH_INDEX_BASE}`,
      );
    },
  };
};
