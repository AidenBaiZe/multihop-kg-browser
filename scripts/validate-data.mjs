import { readFile } from "node:fs/promises";

const file = new URL("../data/graph.json", import.meta.url);
const data = JSON.parse(await readFile(file, "utf8"));

const errors = [];
const nodeIds = new Set(data.nodes.map((node) => node.id));
const edgeIds = new Set(data.edges.map((edge) => edge.id));

for (const edge of data.edges) {
  if (!nodeIds.has(edge.source)) errors.push(`Edge ${edge.id} has missing source ${edge.source}`);
  if (!nodeIds.has(edge.target)) errors.push(`Edge ${edge.id} has missing target ${edge.target}`);
}

for (const question of data.questions) {
  if (!nodeIds.has(question.start)) errors.push(`Question ${question.id} has missing start ${question.start}`);
  if (!nodeIds.has(question.target)) errors.push(`Question ${question.id} has missing target ${question.target}`);
  for (const edgeId of question.edgeIds) {
    if (!edgeIds.has(edgeId)) errors.push(`Question ${question.id} references missing edge ${edgeId}`);
  }

  const questionEdges = question.edgeIds.map((edgeId) => data.edges.find((edge) => edge.id === edgeId));
  for (let index = 1; index < questionEdges.length; index += 1) {
    if (questionEdges[index - 1]?.target !== questionEdges[index]?.source) {
      errors.push(`Question ${question.id} has a broken path at ${questionEdges[index - 1]?.id} -> ${questionEdges[index]?.id}`);
    }
  }
}

const duplicateNodes = duplicates(data.nodes.map((node) => node.id));
const duplicateEdges = duplicates(data.edges.map((edge) => edge.id));
const duplicateQuestions = duplicates(data.questions.map((question) => question.id));

if (duplicateNodes.length) errors.push(`Duplicate node ids: ${duplicateNodes.join(", ")}`);
if (duplicateEdges.length) errors.push(`Duplicate edge ids: ${duplicateEdges.join(", ")}`);
if (duplicateQuestions.length) errors.push(`Duplicate question ids: ${duplicateQuestions.join(", ")}`);

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(
  `Validated ${data.nodes.length} nodes, ${data.edges.length} edges, ${data.questions.length} questions.`
);

function duplicates(values) {
  const seen = new Set();
  const dupes = new Set();
  for (const value of values) {
    if (seen.has(value)) dupes.add(value);
    seen.add(value);
  }
  return [...dupes];
}
