const TIME_ZONE = "Asia/Shanghai";

const state = {
  items: [],
  query: "",
  source: "all",
  range: "all",
};

const elements = {
  search: document.querySelector("#search"),
  source: document.querySelector("#source-filter"),
  rangeButtons: [...document.querySelectorAll(".range-button")],
  list: document.querySelector("#news-list"),
  loading: document.querySelector("#loading"),
  empty: document.querySelector("#empty"),
  clear: document.querySelector("#clear-filters"),
  count: document.querySelector("#result-count"),
  updateLine: document.querySelector("#update-line"),
};

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const dateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function dateKey(value) {
  return dateKeyFormatter.format(new Date(value));
}

function dayDistance(value) {
  const current = Date.parse(`${dateKey(new Date())}T00:00:00Z`);
  const candidate = Date.parse(`${dateKey(value)}T00:00:00Z`);
  return Math.floor((current - candidate) / 86_400_000);
}

function matchesRange(item) {
  if (state.range === "all") return true;
  if (!item.publishedAt) return false;
  const distance = dayDistance(item.publishedAt);
  if (state.range === "today") return distance === 0;
  return distance >= 0 && distance <= 6;
}

function filteredItems() {
  const query = state.query.trim().toLocaleLowerCase("zh-CN");
  return state.items.filter((item) => {
    const haystack = `${item.title} ${item.summary || ""} ${item.sourceName}`.toLocaleLowerCase("zh-CN");
    return (!query || haystack.includes(query)) &&
      (state.source === "all" || item.sourceId === state.source) &&
      matchesRange(item);
  });
}

function createText(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = value;
  return node;
}

function createCard(item) {
  const card = document.createElement("article");
  card.className = "news-card";

  const meta = document.createElement("div");
  meta.className = "news-meta";
  meta.append(createText("span", "source-badge", item.sourceName));
  meta.append(
    createText(
      "time",
      "",
      item.publishedAt ? dateFormatter.format(new Date(item.publishedAt)) : "发布时间未知",
    ),
  );

  const content = document.createElement("div");
  content.className = "news-content";
  const heading = document.createElement("h3");
  const titleLink = document.createElement("a");
  titleLink.href = item.originalUrl;
  titleLink.target = "_blank";
  titleLink.rel = "noopener noreferrer";
  titleLink.textContent = item.title;
  heading.append(titleLink);
  content.append(heading);
  if (item.summary) content.append(createText("p", "news-summary", item.summary));

  const arrow = document.createElement("a");
  arrow.className = "arrow";
  arrow.href = item.originalUrl;
  arrow.target = "_blank";
  arrow.rel = "noopener noreferrer";
  arrow.setAttribute("aria-label", `阅读原文：${item.title}`);
  arrow.textContent = "↗";

  card.append(meta, content, arrow);
  return card;
}

function render() {
  const items = filteredItems();
  elements.list.replaceChildren(...items.map(createCard));
  elements.count.textContent = `${items.length} 条`;
  elements.empty.hidden = items.length > 0;
}

function resetFilters() {
  state.query = "";
  state.source = "all";
  state.range = "all";
  elements.search.value = "";
  elements.source.value = "all";
  elements.rangeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.range === "all");
  });
  render();
}

function bindEvents() {
  elements.search.addEventListener("input", (event) => {
    state.query = event.target.value;
    render();
  });
  elements.source.addEventListener("change", (event) => {
    state.source = event.target.value;
    render();
  });
  elements.rangeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.range = button.dataset.range;
      elements.rangeButtons.forEach((candidate) => candidate.classList.toggle("is-active", candidate === button));
      render();
    });
  });
  elements.clear.addEventListener("click", resetFilters);
}

function populateSources(items) {
  const sources = [...new Map(items.map((item) => [item.sourceId, item.sourceName])).entries()]
    .sort((left, right) => left[1].localeCompare(right[1], "zh-CN"));
  for (const [id, name] of sources) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = name;
    elements.source.append(option);
  }
}

function renderStatus(status) {
  if (!status || !status.updatedAt) {
    elements.updateLine.textContent = "尚未运行数据更新任务";
    return;
  }
  const failed = status.sources.filter((source) => source.state === "failed");
  const suffix = failed.length ? ` · ${failed.length} 个来源抓取失败，旧内容已保留` : " · 全部来源更新成功";
  elements.updateLine.textContent = `最近更新 ${dateFormatter.format(new Date(status.updatedAt))}${suffix}`;
}

async function initialize() {
  bindEvents();
  try {
    const [newsResponse, statusResponse] = await Promise.all([
      fetch("data/news.json", { cache: "no-store" }),
      fetch("data/update-status.json", { cache: "no-store" }),
    ]);
    if (!newsResponse.ok) throw new Error(`资讯读取失败：${newsResponse.status}`);
    state.items = await newsResponse.json();
    populateSources(state.items);
    render();
    renderStatus(statusResponse.ok ? await statusResponse.json() : null);
  } catch (error) {
    elements.empty.hidden = false;
    elements.empty.querySelector("h3").textContent = "资讯加载失败";
    elements.empty.querySelector("p").textContent = "请稍后重试，或检查数据文件是否已经生成。";
    elements.updateLine.textContent = String(error.message || error);
  } finally {
    elements.loading.hidden = true;
  }
}

initialize();

