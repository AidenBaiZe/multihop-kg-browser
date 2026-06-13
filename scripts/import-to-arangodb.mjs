import { readFile } from "node:fs/promises";

const endpoint = process.env.ARANGO_URL ?? "http://127.0.0.1:8529";
const database = process.env.ARANGO_DB ?? "multihop_kg";
const username = process.env.ARANGO_USER ?? "root";
const password = process.env.ARANGO_PASSWORD ?? "";

const data = JSON.parse(await readFile(new URL("../data/graph.json", import.meta.url), "utf8"));
const auth = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;

await request("/_api/database", {
  method: "POST",
  body: { name: database },
  ok: [201, 202, 409]
});

await ensureCollection("entities", 2);
await ensureCollection("questions", 2);
await ensureCollection("evidence_edges", 3);

await truncate("entities");
await truncate("questions");
await truncate("evidence_edges");

await insertMany(
  "entities",
  data.nodes.map((node) => ({ _key: node.id, ...node }))
);

await insertMany(
  "questions",
  data.questions.map((question) => ({ _key: question.id, ...question }))
);

await insertMany(
  "evidence_edges",
  data.edges.map((edge) => ({
    _key: edge.id,
    _from: `entities/${edge.source}`,
    _to: `entities/${edge.target}`,
    ...edge
  }))
);

console.log(`Imported ${data.nodes.length} nodes, ${data.edges.length} edges, ${data.questions.length} questions into ${database}.`);

async function ensureCollection(name, type) {
  await request(`/_db/${database}/_api/collection`, {
    method: "POST",
    body: { name, type },
    ok: [200, 201, 409]
  });
}

async function truncate(name) {
  await request(`/_db/${database}/_api/collection/${name}/truncate`, {
    method: "PUT",
    ok: [200, 201, 202]
  });
}

async function insertMany(collection, documents) {
  await request(`/_db/${database}/_api/document/${collection}`, {
    method: "POST",
    body: documents,
    ok: [200, 201, 202]
  });
}

async function request(path, { method, body, ok }) {
  const response = await fetch(`${endpoint}${path}`, {
    method,
    headers: {
      authorization: auth,
      "content-type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!ok.includes(response.status)) {
    const text = await response.text();
    throw new Error(`${method} ${path} failed with ${response.status}: ${text}`);
  }

  return response;
}
