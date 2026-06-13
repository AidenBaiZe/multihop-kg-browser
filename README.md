# 多跳知识图谱浏览器

这是一个面向课程项目的静态网页，选择 **ArangoDB property graph** 管理多跳问答数据，并通过 GitHub Pages 托管前端页面。网页支持多跳过程查询、关键词检索、简单聚类和关系可视化。

仓库建议名：`multihop-kg-browser`

## 目标对应

- 数据库：ArangoDB，多模型数据库中的图模型。
- 数据：2WikiMultihopQA 风格的多跳问答样例，包含问题、实体、证据关系和答案。
- 查询：从任意实体出发执行 1 到 3 跳路径遍历。
- 检索：按问题、答案、实体、关系、证据文本和关键词过滤。
- 聚类：按主题字段、节点类型或连通分量做简单聚类。
- 可视化：D3 force-directed graph 展示节点、关系、边标签、路径和聚类颜色。

## 参考案例

- Knowledge Graph Browser: <https://martinnec.github.io/knowledge-graph-browser-website/>
- D3 Graph Visualization in GitHub Pages: <https://tylermclaughlin.github.io/blog/2018/04/29/D3-graph-visualization-in-github-pages.html>
- UNDP D3 knowledge graph library: <https://github.com/UNDP-Data/fe-knowledge-graph-d3-library>
- Whyis Knowledge Explorer paper: <https://ceur-ws.org/Vol-3773/paper2.pdf>

本项目吸收的设计点包括：从起点节点局部展开、用 JSON 作为浏览器图数据、边和节点样式可配置、避免一次性展示过大的全图。

## 数据模型

ArangoDB 中使用三个集合：

| 集合 | 类型 | 说明 |
| --- | --- | --- |
| `entities` | document | 实体、地点、数据库、概念、作品等节点 |
| `evidence_edges` | edge | 多跳证据边，包含 `_from`、`_to`、`relation`、`evidence` |
| `questions` | document | 问题、答案、起点、目标和 evidence edge 顺序 |

网页读取 `data/graph.json`，其结构与数据库导入结构一致。

## 本地运行

```bash
npm run validate
npm run start
```

打开：

```text
http://127.0.0.1:5173
```

## 导入 ArangoDB

启动本地 ArangoDB 后执行：

```bash
ARANGO_URL=http://127.0.0.1:8529 \
ARANGO_DB=multihop_kg \
ARANGO_USER=root \
ARANGO_PASSWORD=your_password \
node scripts/import-to-arangodb.mjs
```

常用 AQL：

```aql
FOR v, e, p IN 1..3 OUTBOUND 'entities/arangodb' evidence_edges
  RETURN {
    path: p.vertices[*].label,
    relations: p.edges[*].relation
  }
```

## GitHub Pages

仓库包含 `.github/workflows/pages.yml`。推送到 `main` 后，GitHub Actions 会发布静态网页。发布地址通常为：

```text
https://AidenBaiZe.github.io/multihop-kg-browser/
```
