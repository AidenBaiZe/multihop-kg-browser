const graphFile = "./data/graph.json";

const palette = [
  "#007c75",
  "#3675b6",
  "#d69412",
  "#7b4cc2",
  "#2b9348",
  "#647083",
  "#0f9a8c",
  "#b74f6f",
  "#8c6d31"
];

const nodeClassColors = {
  Question: "#007c75",
  Article: "#3675b6",
  Sentence: "#d69412",
  Entity: "#7b4cc2",
  Answer: "#2b9348"
};

const articleLikeTypes = new Set(["Work", "Database", "Dataset", "Organization", "University"]);

const state = {
  data: null,
  nodeById: new Map(),
  edgeById: new Map(),
  query: "",
  type: "all",
  view: "question",
  selectedQuestionId: null,
  selectedNodeId: null,
  startNodeId: null,
  depth: 2,
  clusterMode: "class",
  showLabels: true,
  traversalPaths: []
};

const els = {
  search: document.querySelector("#search-input"),
  typeFilter: document.querySelector("#type-filter"),
  segments: Array.from(document.querySelectorAll(".segment")),
  startNode: document.querySelector("#start-node"),
  nodeOptions: document.querySelector("#node-options"),
  depthRange: document.querySelector("#depth-range"),
  depthLabel: document.querySelector("#depth-label"),
  runTraversal: document.querySelector("#run-traversal"),
  pathCount: document.querySelector("#path-count"),
  clusterMode: document.querySelector("#cluster-mode"),
  labelToggle: document.querySelector("#label-toggle"),
  metricNodes: document.querySelector("#metric-nodes"),
  metricEdges: document.querySelector("#metric-edges"),
  metricQuestions: document.querySelector("#metric-questions"),
  metricClusters: document.querySelector("#metric-clusters"),
  graphTitle: document.querySelector("#graph-title"),
  graphSubtitle: document.querySelector("#graph-subtitle"),
  graph: document.querySelector("#graph"),
  questionList: document.querySelector("#question-list"),
  resultCount: document.querySelector("#result-count"),
  clusterChart: document.querySelector("#cluster-chart"),
  detailCard: document.querySelector("#detail-card"),
  pathResults: document.querySelector("#path-results"),
  aqlCode: document.querySelector("#aql-code"),
  fitGraph: document.querySelector("#fit-graph"),
  pinSelected: document.querySelector("#pin-selected"),
  tooltip: document.querySelector("#tooltip")
};

els.heroQuestion = document.querySelector("#hero-question");
els.heroMeta = document.querySelector("#hero-meta");

let simulation = null;
let graphGroup = null;
let zoomBehavior = null;

init();

async function init() {
  try {
    const response = await fetch(graphFile);
    if (!response.ok) throw new Error(`Failed to load ${graphFile}`);
    const data = await response.json();
    state.data = data;
    state.nodeById = new Map(data.nodes.map((node) => [node.id, node]));
    state.edgeById = new Map(data.edges.map((edge) => [edge.id, edge]));
    state.selectedQuestionId = data.questions[0]?.id ?? null;
    state.startNodeId = data.questions[0]?.start ?? data.nodes[0]?.id ?? null;
    hydrateControls();
    bindEvents();
    render();
  } catch (error) {
    els.detailCard.innerHTML = `<p class="empty">${escapeHtml(error.message)}</p>`;
  }
}

function hydrateControls() {
  const types = ["all", ...new Set(state.data.questions.map((item) => item.type))];
  els.typeFilter.innerHTML = types
    .map((type) => {
      const active = type === state.type ? " is-active" : "";
      const label = type === "all" ? "All" : typeLabel(type);
      return `<button class="filter-chip${active}" type="button" data-type="${type}" aria-pressed="${type === state.type ? "true" : "false"}">${escapeHtml(label)}</button>`;
    })
    .join("");

  els.nodeOptions.innerHTML = state.data.nodes
    .map((node) => `<option value="${escapeHtml(node.label)}"></option>`)
    .join("");

  const start = state.nodeById.get(state.startNodeId);
  els.startNode.value = start?.label ?? "";
  els.depthLabel.textContent = `${state.depth} hops`;
  els.segments.forEach((item) => item.setAttribute("aria-pressed", item.dataset.view === state.view ? "true" : "false"));
}

function bindEvents() {
  els.search.addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    render();
  });

  els.typeFilter.addEventListener("click", (event) => {
    const button = event.target.closest("[data-type]");
    if (!button) return;
    state.type = button.dataset.type;
    els.typeFilter.querySelectorAll("[data-type]").forEach((item) => {
      const active = item === button;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-pressed", active ? "true" : "false");
    });
    render();
  });

  els.segments.forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      state.traversalPaths = [];
      els.segments.forEach((item) => item.classList.toggle("is-active", item === button));
      els.segments.forEach((item) => item.setAttribute("aria-pressed", item === button ? "true" : "false"));
      render();
    });
  });

  els.depthRange.addEventListener("input", (event) => {
    state.depth = Number(event.target.value);
    els.depthLabel.textContent = `${state.depth} hops`;
  });

  els.runTraversal.addEventListener("click", () => {
    const resolved = resolveNode(els.startNode.value);
    if (!resolved) {
      state.traversalPaths = [];
      render();
      return;
    }
    state.startNodeId = resolved.id;
    state.selectedNodeId = resolved.id;
    state.view = "neighborhood";
    state.traversalPaths = findPaths(resolved.id, state.depth);
    els.segments.forEach((item) => item.classList.toggle("is-active", item.dataset.view === "neighborhood"));
    els.segments.forEach((item) => item.setAttribute("aria-pressed", item.dataset.view === "neighborhood" ? "true" : "false"));
    render();
  });

  els.clusterMode.addEventListener("change", (event) => {
    state.clusterMode = event.target.value;
    render();
  });

  els.labelToggle.addEventListener("change", (event) => {
    state.showLabels = event.target.checked;
    render();
  });

  els.fitGraph.addEventListener("click", () => fitGraph());
  els.pinSelected.addEventListener("click", () => pinSelectedNode());
  window.addEventListener("resize", debounce(render, 160));
}

function render() {
  if (!state.data) return;
  const questions = filteredQuestions();
  if (!questions.some((item) => item.id === state.selectedQuestionId)) {
    state.selectedQuestionId = questions[0]?.id ?? state.data.questions[0]?.id ?? null;
  }

  const graph = currentGraph(questions);
  const clusters = assignClusters(graph);

  renderMetrics(graph, questions, clusters);
  renderQuestions(questions);
  renderDetail();
  renderPaths();
  renderClusterChart(clusters);
  renderAql();
  renderGraph(graph, clusters);
}

function filteredQuestions() {
  return state.data.questions.filter((question) => {
    if (state.type !== "all" && question.type !== state.type) return false;
    if (!state.query) return true;
    const edges = question.edgeIds.map((id) => state.edgeById.get(id)).filter(Boolean);
    const nodes = pathNodeIds(question.edgeIds).map((id) => state.nodeById.get(id)).filter(Boolean);
    const haystack = [
      question.id,
      question.type,
      question.cluster,
      question.question,
      question.answer,
      ...(question.keywords ?? []),
      ...edges.flatMap((edge) => [edge.relation, edge.evidence]),
      ...nodes.flatMap((node) => [node.label, node.type, node.cluster, node.description])
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(state.query);
  });
}

function currentGraph(questions) {
  if (state.view === "all") {
    if (!state.query && state.type === "all") {
      return normalizeGraph(state.data.nodes, state.data.edges);
    }
    const edgeIds = new Set(questions.flatMap((question) => question.edgeIds));
    return graphFromEdgeIds(edgeIds);
  }

  if (state.view === "neighborhood") {
    const paths = state.traversalPaths.length ? state.traversalPaths : findPaths(state.startNodeId, state.depth);
    const edgeIds = new Set(paths.flatMap((path) => path.edgeIds));
    return graphFromEdgeIds(edgeIds, state.startNodeId);
  }

  const question = selectedQuestion();
  return semanticGraphFromQuestion(question);
}

function normalizeGraph(nodes, edges) {
  const usableNodeIds = new Set(nodes.map((node) => node.id));
  return {
    nodes: nodes.map((node) => decorateEntityNode(node)),
    edges: edges
      .filter((edge) => usableNodeIds.has(edge.source) && usableNodeIds.has(edge.target))
      .map((edge) => ({ ...edge }))
  };
}

function graphFromEdgeIds(edgeIds, requiredNodeId = null) {
  const edges = Array.from(edgeIds)
    .map((id) => state.edgeById.get(id))
    .filter(Boolean)
    .map((edge) => ({ ...edge }));
  const nodeIds = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
  if (requiredNodeId) nodeIds.add(requiredNodeId);
  const nodes = Array.from(nodeIds)
    .map((id) => state.nodeById.get(id))
    .filter(Boolean)
    .map((node) => decorateEntityNode(node));
  return { nodes, edges };
}

function semanticGraphFromQuestion(question) {
  if (!question) return { nodes: [], edges: [] };

  const nodes = new Map();
  const edges = [];
  const questionId = `question:${question.id}`;
  const answerId = `answer:${question.id}`;

  nodes.set(questionId, {
    id: questionId,
    label: truncateLabel(question.question, 22),
    fullLabel: question.question,
    nodeClass: "Question",
    type: "Question",
    cluster: question.cluster,
    description: `Answer: ${question.answer}`,
    originalQuestionId: question.id
  });

  nodes.set(answerId, {
    id: answerId,
    label: question.answer,
    fullLabel: question.answer,
    nodeClass: "Answer",
    type: "Answer",
    cluster: question.cluster,
    description: `Answer node for ${question.id}`,
    originalId: question.target
  });

  edges.push({
    id: `answer:${question.id}`,
    source: questionId,
    target: answerId,
    relation: "answer",
    weight: 4,
    semantic: true
  });

  question.edgeIds.forEach((edgeId, index) => {
    const edge = state.edgeById.get(edgeId);
    if (!edge) return;

    const sourceNode = state.nodeById.get(edge.source);
    const targetNode = state.nodeById.get(edge.target);
    const articleId = `article:${question.id}:${edge.source}`;
    const sentenceId = `sentence:${question.id}:${edge.id}`;
    const targetSemanticId = edge.target === question.target ? answerId : `entity:${question.id}:${edge.target}`;

    if (sourceNode && !nodes.has(articleId)) {
      nodes.set(articleId, {
        ...sourceNode,
        id: articleId,
        fullLabel: sourceNode.label,
        nodeClass: "Article",
        type: "Article",
        cluster: question.cluster,
        originalId: sourceNode.id
      });
    }

    if (targetNode && targetSemanticId !== answerId && !nodes.has(targetSemanticId)) {
      nodes.set(targetSemanticId, {
        ...targetNode,
        id: targetSemanticId,
        fullLabel: targetNode.label,
        nodeClass: "Entity",
        type: "Entity",
        cluster: question.cluster,
        originalId: targetNode.id
      });
    }

    nodes.set(sentenceId, {
      id: sentenceId,
      label: truncateLabel(edge.evidence, 27),
      fullLabel: edge.evidence,
      nodeClass: "Sentence",
      type: "Sentence",
      cluster: question.cluster,
      description: edge.evidence,
      originalEdgeId: edge.id
    });

    edges.push({
      id: `context:${question.id}:${edge.id}`,
      source: questionId,
      target: articleId,
      relation: "context",
      weight: 2,
      semantic: true,
      originalEdgeId: edge.id
    });

    edges.push({
      id: `supporting:${question.id}:${edge.id}`,
      source: questionId,
      target: sentenceId,
      relation: "supporting_fact",
      weight: 2,
      semantic: true,
      originalEdgeId: edge.id
    });

    edges.push({
      id: `fact:${question.id}:${edge.id}`,
      source: articleId,
      target: targetSemanticId,
      relation: edge.relation,
      weight: 3,
      semantic: true,
      originalEdgeId: edge.id
    });

    if (index === question.edgeIds.length - 1 && targetSemanticId !== answerId) {
      edges.push({
        id: `derived-answer:${question.id}:${edge.id}`,
        source: targetSemanticId,
        target: answerId,
        relation: "answer",
        weight: 3,
        semantic: true,
        originalEdgeId: edge.id
      });
    }
  });

  return { nodes: [...nodes.values()], edges };
}

function pathNodeIds(edgeIds) {
  const ids = [];
  edgeIds.forEach((edgeId, index) => {
    const edge = state.edgeById.get(edgeId);
    if (!edge) return;
    if (index === 0) ids.push(edge.source);
    ids.push(edge.target);
  });
  return ids;
}

function selectedQuestion() {
  return state.data.questions.find((question) => question.id === state.selectedQuestionId) ?? null;
}

function decorateEntityNode(node) {
  const question = selectedQuestion();
  const nodeClass = question?.target === node.id ? "Answer" : articleLikeTypes.has(node.type) ? "Article" : "Entity";
  return {
    ...node,
    nodeClass,
    fullLabel: node.fullLabel ?? node.label,
    originalId: node.originalId ?? node.id
  };
}

function renderMetrics(graph, questions, clusters) {
  els.metricNodes.textContent = graph.nodes.length;
  els.metricEdges.textContent = graph.edges.length;
  els.metricQuestions.textContent = questions.length;
  els.metricClusters.textContent = clusters.size;

  const titles = {
    question: ["证据路径", "当前问题的有序 evidence edges"],
    neighborhood: ["邻域", `${labelFor(state.startNodeId)} 的 ${state.depth} 跳局部图`],
    all: ["全图", "完整样例数据或当前检索结果"]
  };
  const [title, subtitle] = titles[state.view];
  els.graphTitle.textContent = title;
  els.graphSubtitle.textContent = subtitle;
}

function renderQuestions(questions) {
  els.resultCount.textContent = `${questions.length}`;
  if (!questions.length) {
    els.questionList.innerHTML = `<p class="empty">没有匹配的查询样例。</p>`;
    return;
  }

  els.questionList.innerHTML = questions
    .map((question) => {
      const active = question.id === state.selectedQuestionId ? " is-active" : "";
      return `
        <button class="question-item${active}" type="button" data-question-id="${question.id}">
          <strong>${escapeHtml(question.question)}</strong>
          <div class="tags">
            <span class="tag">${escapeHtml(question.type)}</span>
            <span class="tag">${escapeHtml(question.cluster)}</span>
            <span class="tag">${question.edgeIds.length} hops</span>
          </div>
        </button>
      `;
    })
    .join("");

  els.questionList.querySelectorAll("[data-question-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const question = state.data.questions.find((item) => item.id === button.dataset.questionId);
      state.selectedQuestionId = question.id;
      state.startNodeId = question.start;
      state.selectedNodeId = question.start;
      els.startNode.value = labelFor(question.start);
      state.view = "question";
      state.traversalPaths = [];
      els.segments.forEach((item) => item.classList.toggle("is-active", item.dataset.view === "question"));
      els.segments.forEach((item) => item.setAttribute("aria-pressed", item.dataset.view === "question" ? "true" : "false"));
      render();
    });
  });
}

function renderDetail() {
  const question = selectedQuestion();
  if (!question) {
    els.detailCard.innerHTML = `<p class="empty">请选择一个查询样例。</p>`;
    if (els.heroQuestion) els.heroQuestion.textContent = "请选择一个查询样例";
    if (els.heroMeta) els.heroMeta.textContent = "Answer: - | Type: - | Cluster: -";
    return;
  }

  if (els.heroQuestion) els.heroQuestion.textContent = question.question;
  if (els.heroMeta) {
    els.heroMeta.textContent = `Answer: ${question.answer} | Type: ${typeLabel(question.type)} | Cluster: ${question.cluster}`;
  }

  const steps = question.edgeIds
    .map((edgeId, index) => {
      const edge = state.edgeById.get(edgeId);
      if (!edge) return "";
      return `
        <div class="evidence-step">
          <strong>${index + 1}. ${escapeHtml(labelFor(edge.source))}</strong>
          <span> -- ${escapeHtml(edge.relation)} --&gt; </span>
          <strong>${escapeHtml(labelFor(edge.target))}</strong>
          <p>${escapeHtml(edge.evidence)}</p>
        </div>
      `;
    })
    .join("");

  els.detailCard.innerHTML = `
    <h3>${escapeHtml(question.question)}</h3>
    <div class="answer">
      <i data-lucide="check-circle-2" aria-hidden="true"></i>
      <span>答案：${escapeHtml(question.answer)}</span>
    </div>
    <div class="tags">
      <span class="tag">${escapeHtml(question.type)}</span>
      <span class="tag">${escapeHtml(question.cluster)}</span>
      <span class="tag">start: ${escapeHtml(labelFor(question.start))}</span>
    </div>
    <div class="evidence-list">${steps}</div>
  `;
  refreshIcons();
}

function renderPaths() {
  const paths = state.traversalPaths.length ? state.traversalPaths : findPaths(state.startNodeId, state.depth);
  els.pathCount.textContent = `${paths.length} paths`;
  const shown = paths.slice(0, 7);
  if (!shown.length) {
    els.pathResults.innerHTML = `<p class="empty">当前起点没有 ${state.depth} 跳以内的路径。</p>`;
    return;
  }

  els.pathResults.innerHTML = shown
    .map((path) => {
      const label = path.edgeIds
        .map((edgeId) => {
          const edge = state.edgeById.get(edgeId);
          return `${labelFor(edge.source)} --${edge.relation}--> ${labelFor(edge.target)}`;
        })
        .join(" / ");
      return `
        <div class="path-card">
          <strong>${path.edgeIds.length} hops</strong>
          <div>${escapeHtml(label)}</div>
        </div>
      `;
    })
    .join("");
}

function renderClusterChart(clusters) {
  const rows = Array.from(clusters.entries())
    .map(([key, nodes], index) => ({ key, count: nodes.length, color: nodeClassColors[key] ?? palette[index % palette.length] }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  const max = Math.max(1, ...rows.map((row) => row.count));
  els.clusterChart.innerHTML = rows
    .map(
      (row) => `
      <div class="cluster-row">
        <header><span>${escapeHtml(row.key)}</span><span>${row.count}</span></header>
        <div class="bar-track">
          <div class="bar" style="width:${(row.count / max) * 100}%; background:${row.color}"></div>
        </div>
      </div>`
    )
    .join("");
}

function renderAql() {
  const question = selectedQuestion();
  const start = state.startNodeId ?? question?.start ?? "arangodb";
  els.aqlCode.textContent = `-- 1) 多跳遍历
FOR v, e, p IN 1..${state.depth} OUTBOUND 'entities/${start}' evidence_edges
  RETURN {
    path: p.vertices[*].label,
    relations: p.edges[*].relation
  }

-- 2) 关键词检索
FOR n IN entities
  FILTER CONTAINS(LOWER(n.label), LOWER(@keyword))
     OR CONTAINS(LOWER(n.description), LOWER(@keyword))
  RETURN n

-- 3) 简单聚类统计
FOR n IN entities
  COLLECT cluster = n.cluster WITH COUNT INTO size
  SORT size DESC
  RETURN { cluster, size }`;
}

function renderGraph(graph, clusters) {
  if (simulation) simulation.stop();

  const svg = d3.select(els.graph);
  svg.selectAll("*").remove();

  const width = Math.max(320, els.graph.clientWidth || 900);
  const height = Math.max(420, els.graph.clientHeight || 560);
  svg.attr("viewBox", [0, 0, width, height]);
  seedSemanticPositions(graph, width, height);

  if (!graph.nodes.length) {
    svg
      .append("text")
      .attr("x", width / 2)
      .attr("y", height / 2)
      .attr("text-anchor", "middle")
      .attr("fill", "#5c6872")
      .text("No graph data");
    return;
  }

  svg
    .append("defs")
    .append("marker")
    .attr("id", "arrow")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 20)
    .attr("refY", 0)
    .attr("markerWidth", 7)
    .attr("markerHeight", 7)
    .attr("orient", "auto")
    .append("path")
    .attr("fill", "#9aabba")
    .attr("d", "M0,-5L10,0L0,5");

  zoomBehavior = d3
    .zoom()
    .scaleExtent([0.35, 3])
    .on("zoom", (event) => graphGroup.attr("transform", event.transform));
  svg.call(zoomBehavior);

  graphGroup = svg.append("g");
  const linkLayer = graphGroup.append("g");
  const labelLayer = graphGroup.append("g");
  const nodeLayer = graphGroup.append("g");

  const clusterIndex = new Map(Array.from(clusters.keys()).map((key, index) => [key, index]));
  const clusterOf = (node) => node.clusterKey ?? node.cluster ?? node.type;
  const colorFor = (node) => nodeClassColors[node.nodeClass] ?? palette[(clusterIndex.get(clusterOf(node)) ?? 0) % palette.length];
  const activeEdgeIds = new Set(selectedQuestion()?.edgeIds ?? []);
  const isActiveEdge = (edge) => activeEdgeIds.has(edge.id) || activeEdgeIds.has(edge.originalEdgeId) || edge.semantic;
  const hasSemanticClasses = graph.nodes.some((node) => node.nodeClass);
  const usesQuestionLayout = graph.nodes.some((node) => node.nodeClass === "Question");

  const links = linkLayer
    .selectAll("line")
    .data(graph.edges)
    .join("line")
    .attr("class", (edge) => `link${isActiveEdge(edge) ? " is-active" : ""}`)
    .attr("stroke-width", (edge) => 1.2 + edge.weight * 0.4)
    .attr("marker-end", "url(#arrow)");

  const edgeLabels = labelLayer
    .selectAll("text")
    .data(graph.edges)
    .join("text")
    .attr("class", "edge-label")
    .text((edge) => edge.relation);

  const nodes = nodeLayer
    .selectAll("g")
    .data(graph.nodes)
    .join("g")
    .attr("class", (node) => `node node-${(node.nodeClass ?? "Entity").toLowerCase()}${node.id === state.selectedNodeId ? " is-active" : ""}`)
    .call(
      d3
        .drag()
        .on("start", dragStarted)
        .on("drag", dragged)
        .on("end", dragEnded)
    );

  nodes
    .append("circle")
    .attr("r", (node) => radiusFor(node, graph.edges))
    .attr("fill", colorFor)
    .on("click", (_, node) => {
      state.selectedNodeId = node.id;
      if (node.originalId && state.nodeById.has(node.originalId)) {
        state.startNodeId = node.originalId;
        els.startNode.value = labelFor(node.originalId);
        state.traversalPaths = findPaths(node.originalId, state.depth);
      }
      render();
    })
    .on("mouseenter", (event, node) => showTooltip(event, node))
    .on("mousemove", (event, node) => showTooltip(event, node))
    .on("mouseleave", hideTooltip);

  nodes
    .append("text")
    .attr("x", 0)
    .attr("y", (node) => radiusFor(node, graph.edges) + 19)
    .attr("text-anchor", "middle")
    .style("display", state.showLabels ? null : "none")
    .text((node) => node.label);

  simulation = d3
    .forceSimulation(graph.nodes)
    .force(
      "link",
      d3
        .forceLink(graph.edges)
        .id((node) => node.id)
        .distance((edge) => (usesQuestionLayout ? semanticEdgeDistance(edge) : 80 + Math.max(0, 4 - edge.weight) * 18))
    )
    .force("charge", d3.forceManyBody().strength(usesQuestionLayout ? -650 : hasSemanticClasses ? -420 : -380))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("x", d3.forceX((node) => classAnchor(node, width, height)[0]).strength(usesQuestionLayout ? 0.14 : hasSemanticClasses ? 0.035 : 0.025))
    .force("y", d3.forceY((node) => classAnchor(node, width, height)[1]).strength(usesQuestionLayout ? 0.14 : hasSemanticClasses ? 0.035 : 0.025))
    .force("collision", d3.forceCollide().radius((node) => radiusFor(node, graph.edges) + (usesQuestionLayout ? 30 : 18)))
    .on("tick", () => {
      links
        .attr("x1", (edge) => edge.source.x)
        .attr("y1", (edge) => edge.source.y)
        .attr("x2", (edge) => edge.target.x)
        .attr("y2", (edge) => edge.target.y);

      edgeLabels
        .attr("x", (edge) => (edge.source.x + edge.target.x) / 2)
        .attr("y", (edge) => (edge.source.y + edge.target.y) / 2);

      nodes.attr("transform", (node) => `translate(${node.x},${node.y})`);
    });

  window.setTimeout(() => fitGraph(), 650);
}

function assignClusters(graph) {
  const componentMap = state.clusterMode === "component" ? connectedComponents(graph) : new Map();
  graph.nodes.forEach((node) => {
    if (state.clusterMode === "component") {
      node.clusterKey = componentMap.get(node.id) ?? "Component 1";
    } else if (state.clusterMode === "class") {
      node.clusterKey = node.nodeClass ?? node.type ?? node.cluster;
    } else if (state.clusterMode === "type") {
      node.clusterKey = node.type;
    } else {
      node.clusterKey = node.cluster;
    }
  });

  const clusters = new Map();
  graph.nodes.forEach((node) => {
    if (!clusters.has(node.clusterKey)) clusters.set(node.clusterKey, []);
    clusters.get(node.clusterKey).push(node);
  });
  return clusters;
}

function connectedComponents(graph) {
  const adjacency = new Map(graph.nodes.map((node) => [node.id, []]));
  graph.edges.forEach((edge) => {
    adjacency.get(edge.source)?.push(edge.target);
    adjacency.get(edge.target)?.push(edge.source);
  });

  const result = new Map();
  const seen = new Set();
  let component = 0;

  graph.nodes.forEach((node) => {
    if (seen.has(node.id)) return;
    component += 1;
    const key = `Component ${component}`;
    const queue = [node.id];
    seen.add(node.id);
    while (queue.length) {
      const current = queue.shift();
      result.set(current, key);
      (adjacency.get(current) ?? []).forEach((next) => {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      });
    }
  });

  return result;
}

function findPaths(startId, maxDepth) {
  if (!startId) return [];
  const outgoing = new Map();
  state.data.edges.forEach((edge) => {
    if (!outgoing.has(edge.source)) outgoing.set(edge.source, []);
    outgoing.get(edge.source).push(edge);
  });

  const paths = [];
  const queue = [{ nodeId: startId, edgeIds: [], visited: new Set([startId]) }];
  while (queue.length) {
    const current = queue.shift();
    if (current.edgeIds.length >= maxDepth) continue;
    (outgoing.get(current.nodeId) ?? []).forEach((edge) => {
      if (current.visited.has(edge.target)) return;
      const nextEdgeIds = [...current.edgeIds, edge.id];
      const nextVisited = new Set(current.visited);
      nextVisited.add(edge.target);
      paths.push({ edgeIds: nextEdgeIds });
      queue.push({ nodeId: edge.target, edgeIds: nextEdgeIds, visited: nextVisited });
    });
  }
  return paths.sort((a, b) => a.edgeIds.length - b.edgeIds.length || a.edgeIds.join("").localeCompare(b.edgeIds.join("")));
}

function resolveNode(value) {
  const needle = value.trim().toLowerCase();
  if (!needle) return null;
  return (
    state.data.nodes.find((node) => node.id.toLowerCase() === needle) ??
    state.data.nodes.find((node) => node.label.toLowerCase() === needle) ??
    state.data.nodes.find((node) => node.label.toLowerCase().includes(needle))
  );
}

function labelFor(id) {
  return state.nodeById.get(id)?.label ?? id;
}

function truncateLabel(value, max = 34) {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function typeLabel(type) {
  const labels = {
    all: "All",
    bridge: "Bridge",
    location: "Location",
    schema: "Schema",
    dataset: "Dataset"
  };
  return labels[type] ?? type;
}

function radiusFor(node, edges) {
  const semanticRadii = {
    Question: 26,
    Article: 18,
    Sentence: 17,
    Entity: 17,
    Answer: 19
  };
  if (node.nodeClass && semanticRadii[node.nodeClass]) return semanticRadii[node.nodeClass];
  const degree = edges.filter((edge) => edge.source === node.id || edge.target === node.id || edge.source.id === node.id || edge.target.id === node.id).length;
  return Math.min(18, 8 + degree * 1.4);
}

function seedSemanticPositions(graph, width, height) {
  if (!graph.nodes.some((node) => node.nodeClass === "Question")) return;

  const placements = {
    Question: [[0.5, 0.48]],
    Answer: [[0.22, 0.5]],
    Article: [
      [0.53, 0.18],
      [0.73, 0.3],
      [0.36, 0.28],
      [0.67, 0.18]
    ],
    Entity: [
      [0.5, 0.84],
      [0.32, 0.68],
      [0.68, 0.78],
      [0.35, 0.34]
    ],
    Sentence: [
      [0.84, 0.48],
      [0.74, 0.84],
      [0.32, 0.3],
      [0.82, 0.72]
    ]
  };
  const counts = new Map();

  graph.nodes.forEach((node) => {
    const options = placements[node.nodeClass] ?? [[0.5, 0.5]];
    const count = counts.get(node.nodeClass) ?? 0;
    const placement = options[count % options.length];
    const lap = Math.floor(count / options.length);
    const jitter = Math.min(width, height) * 0.035 * lap;
    node.x = placement[0] * width + jitter;
    node.y = placement[1] * height + jitter;
    counts.set(node.nodeClass, count + 1);
  });
}

function classAnchor(node, width, height) {
  const anchors = {
    Question: [width * 0.5, height * 0.5],
    Article: [width * 0.56, height * 0.28],
    Sentence: [width * 0.68, height * 0.62],
    Entity: [width * 0.43, height * 0.72],
    Answer: [width * 0.28, height * 0.48]
  };
  return anchors[node.nodeClass] ?? [width * 0.5, height * 0.5];
}

function semanticEdgeDistance(edge) {
  if (edge.relation === "answer") return 210;
  if (edge.relation === "supporting_fact") return 205;
  if (edge.relation === "context") return 190;
  return 185;
}

function fitGraph() {
  if (!graphGroup || !zoomBehavior) return;
  const svg = d3.select(els.graph);
  const bounds = graphGroup.node().getBBox();
  const width = els.graph.clientWidth || 900;
  const height = els.graph.clientHeight || 560;
  if (!bounds.width || !bounds.height) return;
  const scale = Math.max(0.45, Math.min(1.7, 0.88 / Math.max(bounds.width / width, bounds.height / height)));
  const x = width / 2 - scale * (bounds.x + bounds.width / 2);
  const y = height / 2 - scale * (bounds.y + bounds.height / 2);
  svg.transition().duration(260).call(zoomBehavior.transform, d3.zoomIdentity.translate(x, y).scale(scale));
}

function pinSelectedNode() {
  if (!simulation || !state.selectedNodeId) return;
  const node = simulation.nodes().find((item) => item.id === state.selectedNodeId);
  if (!node) return;
  if (node.fx == null) {
    node.fx = node.x;
    node.fy = node.y;
  } else {
    node.fx = null;
    node.fy = null;
  }
  simulation.alpha(0.25).restart();
}

function dragStarted(event, node) {
  if (!event.active) simulation.alphaTarget(0.3).restart();
  node.fx = node.x;
  node.fy = node.y;
}

function dragged(event, node) {
  node.fx = event.x;
  node.fy = event.y;
}

function dragEnded(event, node) {
  if (!event.active) simulation.alphaTarget(0);
  node.fx = event.x;
  node.fy = event.y;
}

function showTooltip(event, node) {
  els.tooltip.hidden = false;
  els.tooltip.innerHTML = `
    <strong>${escapeHtml(node.fullLabel ?? node.label)}</strong><br />
    ${escapeHtml(node.nodeClass ?? node.type)} · ${escapeHtml(node.clusterKey ?? node.cluster)}<br />
    ${escapeHtml(node.description ?? "")}
  `;
  const rect = els.graph.getBoundingClientRect();
  els.tooltip.style.transform = `translate(${event.clientX - rect.left + 14}px, ${event.clientY - rect.top + 14}px)`;
}

function hideTooltip() {
  els.tooltip.hidden = true;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function debounce(fn, wait) {
  let timer = null;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

window.addEventListener("load", refreshIcons);
