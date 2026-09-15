const TIME_ZONE = "Asia/Shanghai";

const state = {
  items: [],
  query: "",
  source: "all",
  range: "all",
  readIds: new Set(),
  hideRead: false,
  briefItems: [],
  briefIndex: 0,
  sourceStatus: new Map(),
  lastRandomId: "",
  page: 1,
  pageSize: 15,
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
  statTotal: document.querySelector("#stat-total"),
  statSources: document.querySelector("#stat-sources"),
  statToday: document.querySelector("#stat-today"),
  mascotDisplay: document.querySelector("#mascot-display"),
  mascotName: document.querySelector("#mascot-name"),
  variantOptions: [...document.querySelectorAll(".variant-option")],
  hideRead: document.querySelector("#hide-read"),
  readCount: document.querySelector("#read-count"),
  briefProgress: document.querySelector("#brief-progress"),
  briefTitle: document.querySelector("#brief-title"),
  briefSource: document.querySelector("#brief-source"),
  briefFreshness: document.querySelector("#brief-freshness"),
  briefEstimate: document.querySelector("#brief-estimate"),
  briefSteps: document.querySelector("#brief-steps"),
  briefPrev: document.querySelector("#brief-prev"),
  briefNext: document.querySelector("#brief-next"),
  radarBar: document.querySelector("#radar-bar"),
  radarLegend: document.querySelector("#radar-legend"),
  radarTotal: document.querySelector("#radar-total"),
  mascotMessage: document.querySelector("#mascot-message"),
  randomFeed: document.querySelector("#random-feed"),
  copyBrief: document.querySelector("#copy-brief"),
  exportPdf: document.querySelector("#export-pdf"),
  pagination: document.querySelector("#pagination"),
  printReportDate: document.querySelector("#print-report-date"),
  printNewsList: document.querySelector("#print-news-list"),
  printReportCount: document.querySelector("#print-report-count"),
  heroVideo: document.querySelector("#hero-video"),
  videoToggle: document.querySelector("#video-toggle"),
  videoToggleLabel: document.querySelector("#video-toggle-label"),
};

const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const saveDataPreference = Boolean(navigator.connection?.saveData);
let pageTransitionAnimation = null;
let videoPausedForVisibility = false;

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

function exactTime(value) {
  if (!value || Number.isNaN(Date.parse(value))) return "未提供";
  return dateFormatter.format(new Date(value));
}

function freshness(value) {
  if (!value || Number.isNaN(Date.parse(value))) {
    return { label: "日期未知", unknown: true };
  }

  const difference = Math.max(0, Date.now() - Date.parse(value));
  const minutes = Math.floor(difference / 60_000);
  const hours = Math.floor(difference / 3_600_000);
  const days = dayDistance(value);
  if (minutes < 60) return { label: "刚刚", unknown: false };
  if (hours < 6) return { label: `${hours} 小时前`, unknown: false };
  if (days === 0) return { label: "今天", unknown: false };
  if (days === 1) return { label: "昨天", unknown: false };
  if (days > 1 && days < 7) return { label: `${days} 天前`, unknown: false };
  return { label: exactTime(value).slice(0, 10), unknown: false };
}

function sourceCategory(item) {
  const officialIds = ["openai-blog", "huggingface-blog"];
  const chineseIds = ["qbitai", "jiqizhixin", "aihot-curated", "aihot-daily"];
  if (officialIds.includes(item.sourceId) || item.sourceName.includes("官方")) return "official";
  if (chineseIds.includes(item.sourceId)) return "chinese";
  return "overseas";
}

function saveReadIds() {
  try {
    localStorage.setItem("git-yuanbao-read-items", JSON.stringify([...state.readIds]));
  } catch {
    // Reading history still works for the current page when storage is unavailable.
  }
}

function loadReadIds() {
  try {
    const saved = JSON.parse(localStorage.getItem("git-yuanbao-read-items") || "[]");
    if (Array.isArray(saved)) state.readIds = new Set(saved);
  } catch {
    state.readIds = new Set();
  }
}

function markRead(itemId) {
  state.readIds.add(itemId);
  saveReadIds();
  render();
  renderBrief();
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
    return (!state.hideRead || !state.readIds.has(item.id)) &&
      (!query || haystack.includes(query)) &&
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

function showToast(message, isError = false) {
  let toast = document.querySelector("#copy-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "copy-toast";
    toast.className = "toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.append(toast);
  }
  toast.textContent = message;
  toast.classList.toggle("is-error", isError);
  toast.classList.add("is-visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("is-visible"), 1800);
}

async function copyText(value, successMessage, errorMessage) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
    } else {
      const input = document.createElement("textarea");
      input.value = value;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.append(input);
      input.select();
      const copied = document.execCommand("copy");
      input.remove();
      if (!copied) throw new Error("copy command failed");
    }
    showToast(successMessage);
    return true;
  } catch {
    showToast(errorMessage, true);
    return false;
  }
}

function copyLink(url) {
  return copyText(url, "链接已复制", "复制失败，请打开原文后复制");
}

function attributionLabel(value) {
  const labels = {
    "source-feed": "来源订阅源摘要",
    "source-page": "来源网页摘要",
  };
  return labels[value] || "未提供";
}

function appendLensField(lens, label, value, link) {
  const group = document.createElement("div");
  group.append(createText("dt", "", label));
  const detail = document.createElement("dd");
  if (link) {
    const anchor = document.createElement("a");
    anchor.href = link;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.textContent = value;
    detail.append(anchor);
  } else {
    detail.textContent = value;
  }
  group.append(detail);
  lens.append(group);
}

function createSourceLens(item) {
  const lens = document.createElement("dl");
  lens.className = "source-lens";
  lens.hidden = true;
  const status = state.sourceStatus.get(item.sourceId);
  const statusText = !status
    ? "未提供"
    : status.state === "success"
      ? `更新正常 · ${exactTime(status.checkedAt)}`
      : `抓取失败 · 保留旧内容`;

  appendLensField(lens, "发布时间", exactTime(item.publishedAt));
  appendLensField(lens, "采集时间", exactTime(item.collectedAt));
  appendLensField(lens, "摘要来源", attributionLabel(item.contentAttribution), item.sourceUrl);
  appendLensField(lens, "更新状态", statusText);
  return lens;
}

function createCard(item, index = 0) {
  const card = document.createElement("article");
  card.className = "news-card";
  card.dataset.source = item.sourceId;
  card.dataset.itemId = item.id;
  card.style.setProperty("--row-index", String(index));
  card.classList.toggle("is-read", state.readIds.has(item.id));

  const meta = document.createElement("div");
  meta.className = "news-meta";
  const sourceButton = createText("button", "source-badge", item.sourceName);
  sourceButton.type = "button";
  sourceButton.setAttribute("aria-expanded", "false");
  const lens = createSourceLens(item);
  sourceButton.addEventListener("click", () => {
    const expanded = sourceButton.getAttribute("aria-expanded") === "true";
    sourceButton.setAttribute("aria-expanded", String(!expanded));
    lens.hidden = expanded;
  });
  meta.append(sourceButton);

  const fresh = freshness(item.publishedAt);
  const freshnessNode = createText("span", `freshness${fresh.unknown ? " is-unknown" : ""}`, fresh.label);
  if (item.publishedAt) freshnessNode.title = exactTime(item.publishedAt);
  meta.append(freshnessNode);
  if (state.readIds.has(item.id)) {
    const readState = createText("span", "read-state", "已读");
    const dot = document.createElement("i");
    dot.className = "read-state-dot";
    dot.setAttribute("aria-hidden", "true");
    readState.prepend(dot);
    meta.append(readState);
  }

  const content = document.createElement("div");
  content.className = "news-content";
  const heading = document.createElement("h3");
  const titleLink = document.createElement("a");
  titleLink.href = item.originalUrl;
  titleLink.target = "_blank";
  titleLink.rel = "noopener noreferrer";
  titleLink.textContent = item.title;
  titleLink.addEventListener("click", () => markRead(item.id));
  heading.append(titleLink);
  content.append(heading);
  if (item.summary) content.append(createText("p", "news-summary", item.summary));
  const copyButton = document.createElement("button");
  copyButton.className = "copy-link";
  copyButton.type = "button";
  copyButton.textContent = "复制链接";
  copyButton.addEventListener("click", () => copyLink(item.originalUrl));
  content.append(copyButton);

  const arrow = document.createElement("a");
  arrow.className = "arrow";
  arrow.href = item.originalUrl;
  arrow.target = "_blank";
  arrow.rel = "noopener noreferrer";
  arrow.setAttribute("aria-label", `阅读原文：${item.title}`);
  arrow.textContent = "↗";
  arrow.addEventListener("click", () => markRead(item.id));

  card.append(meta, content, arrow, lens);
  return card;
}

function pickBriefItems(items) {
  const sorted = [...items].sort((left, right) => Date.parse(right.publishedAt || 0) - Date.parse(left.publishedAt || 0));
  const today = sorted.filter((item) => item.publishedAt && dayDistance(item.publishedAt) === 0);
  const pool = today.length >= 5 ? today : sorted;
  const buckets = {
    chinese: pool.filter((item) => sourceCategory(item) === "chinese"),
    overseas: pool.filter((item) => sourceCategory(item) === "overseas"),
    official: pool.filter((item) => sourceCategory(item) === "official"),
  };
  const result = [];
  const categoryOrder = ["chinese", "overseas", "official", "chinese", "overseas"];

  for (const category of categoryOrder) {
    const candidate = buckets[category].find((item) => !result.includes(item));
    if (candidate) result.push(candidate);
  }
  for (const item of pool) {
    if (result.length >= 5) break;
    if (!result.includes(item)) result.push(item);
  }
  return result.slice(0, 5);
}

function renderBrief() {
  if (!state.briefItems.length) {
    elements.briefProgress.textContent = "0/0";
    elements.briefTitle.textContent = "今天暂时没有可速览的资讯";
    elements.briefTitle.removeAttribute("href");
    elements.briefSource.textContent = "等待更新";
    elements.briefFreshness.textContent = "—";
    elements.briefEstimate.textContent = "—";
    elements.briefSteps.replaceChildren();
    return;
  }

  state.briefIndex = Math.min(state.briefIndex, state.briefItems.length - 1);
  const item = state.briefItems[state.briefIndex];
  const fresh = freshness(item.publishedAt);
  const estimate = Math.max(1, Math.ceil(state.briefItems.length * 0.6));
  elements.briefProgress.textContent = `${state.briefIndex + 1}/${state.briefItems.length}`;
  elements.briefTitle.textContent = item.title;
  elements.briefTitle.href = item.originalUrl;
  elements.briefTitle.target = "_blank";
  elements.briefTitle.rel = "noopener noreferrer";
  elements.briefTitle.dataset.itemId = item.id;
  elements.briefTitle.classList.toggle("is-read", state.readIds.has(item.id));
  elements.briefSource.textContent = item.sourceName;
  elements.briefFreshness.textContent = fresh.label;
  elements.briefEstimate.textContent = `约 ${estimate} 分钟完成当天浏览`;

  const steps = state.briefItems.map((candidate, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "brief-step";
    button.classList.toggle("is-active", index === state.briefIndex);
    button.classList.toggle("is-read", state.readIds.has(candidate.id));
    button.setAttribute("aria-label", `查看第 ${index + 1} 条精选资讯`);
    button.addEventListener("click", () => {
      state.briefIndex = index;
      renderBrief();
    });
    return button;
  });
  elements.briefSteps.replaceChildren(...steps);
}

function renderRadar(items) {
  const definitions = [
    { id: "chinese", label: "中文媒体" },
    { id: "overseas", label: "海外媒体" },
    { id: "official", label: "官方动态" },
  ];
  const total = items.length;
  const counts = Object.fromEntries(definitions.map(({ id }) => [id, items.filter((item) => sourceCategory(item) === id).length]));
  elements.radarTotal.textContent = `${total} 条`;

  const segments = definitions.map(({ id, label }) => {
    const percentage = total ? Math.round((counts[id] / total) * 100) : 0;
    const segment = document.createElement("span");
    segment.className = `radar-segment is-${id}`;
    segment.style.width = `${percentage}%`;
    segment.title = `${label}：${counts[id]} 条，占 ${percentage}%`;
    return segment;
  });
  elements.radarBar.replaceChildren(...segments);

  const legendItems = definitions.map(({ id, label }) => {
    const percentage = total ? Math.round((counts[id] / total) * 100) : 0;
    const node = document.createElement("div");
    node.className = `radar-item is-${id}`;
    const marker = document.createElement("i");
    marker.setAttribute("aria-hidden", "true");
    node.append(marker, document.createTextNode(label), createText("strong", "", `${counts[id]} 条 / ${percentage}%`));
    return node;
  });
  elements.radarLegend.replaceChildren(...legendItems);
  elements.radarBar.setAttribute(
    "aria-label",
    definitions.map(({ id, label }) => `${label} ${counts[id]} 条`).join("，"),
  );
}

function renderMascotMessage(items, status) {
  const failedCount = (status?.sources || []).filter((source) => source.state === "failed").length;
  const counts = {
    chinese: items.filter((item) => sourceCategory(item) === "chinese").length,
    overseas: items.filter((item) => sourceCategory(item) === "overseas").length,
    official: items.filter((item) => sourceCategory(item) === "official").length,
  };
  const total = Math.max(1, items.length);

  if (failedCount) {
    elements.mascotMessage.textContent = `${failedCount} 个来源暂时掉线，旧内容还在，稍后再来巡一遍。`;
  } else if (counts.official / total >= 0.6) {
    elements.mascotMessage.textContent = "今天官方信号很强，先看发布，再找媒体解读。";
  } else if (counts.overseas / total >= 0.5) {
    elements.mascotMessage.textContent = "海外消息占上风，适合看看产品与行业的新动向。";
  } else if (counts.chinese / total >= 0.5) {
    elements.mascotMessage.textContent = "中文媒体很活跃，今天的本地观察值得优先看。";
  } else {
    elements.mascotMessage.textContent = "三路信号比较均衡，放心从今日速览开始。";
  }
}

function copyTodayBrief() {
  if (!state.briefItems.length) {
    showToast("今天暂时没有可复制的速览", true);
    return;
  }
  const lines = [`Git源宝每日 AI 资讯分享｜${dateKey(new Date())}`, ""];
  state.briefItems.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.title}`, `来源：${item.sourceName}`, item.originalUrl, "");
  });
  copyText(lines.join("\n").trim(), "今日 5 条已复制", "复制失败，请稍后重试");
}

function oneSentenceSummary(item) {
  const raw = String(item.summary || item.title || "暂无摘要").replace(/\s+/g, " ").trim();
  const sentences = raw.match(/[^。！？.!?]+[。！？.!?]?(?:[”’」』])?/g) || [];
  const noise = /^(还是|这个|那个|太|啊|嗯|快讯|点击|阅读全文|图片来源)/i;
  const sentence = sentences
    .map((value) => value.trim())
    .find((value) => value.length >= 16 && !noise.test(value)) ||
    (raw.length >= 16 && !noise.test(raw) ? raw : item.title);
  return sentence.length > 120 ? `${sentence.slice(0, 119).trim()}…` : sentence;
}

function reportItems() {
  const published = state.items.filter((item) => item.publishedAt && !Number.isNaN(Date.parse(item.publishedAt)));
  const todayKey = dateKey(new Date());
  const today = published.filter((item) => dateKey(item.publishedAt) === todayKey);
  if (today.length) return { items: today, date: todayKey, isFallback: false };

  const latestDate = published.reduce((latest, item) => {
    const key = dateKey(item.publishedAt);
    return key > latest ? key : latest;
  }, "");
  return {
    items: latestDate ? published.filter((item) => dateKey(item.publishedAt) === latestDate) : [],
    date: latestDate || todayKey,
    isFallback: Boolean(latestDate),
  };
}

function renderPrintReport() {
  const report = reportItems();
  const generatedDate = dateKey(new Date());
  elements.printReportDate.textContent = report.isFallback
    ? `生成 ${generatedDate} · 最近收录 ${report.date}`
    : generatedDate;
  elements.printReportCount.textContent = `${report.items.length} 条资讯 · 数据日期 ${report.date}`;

  if (!report.items.length) {
    const empty = createText("li", "print-empty", "今天暂时没有已收录的 AI 新闻。");
    elements.printNewsList.replaceChildren(empty);
    return report;
  }

  const nodes = report.items.map((item) => {
    const row = document.createElement("li");
    row.className = "print-news-item";
    row.append(createText("h3", "", item.title));
    row.append(createText("p", "", oneSentenceSummary(item)));

    const source = document.createElement("div");
    source.className = "print-news-source";
    source.append(createText("strong", "", `出处：${item.sourceName}`));
    const link = document.createElement("a");
    link.href = item.originalUrl;
    link.textContent = item.originalUrl;
    source.append(link);
    row.append(source);
    return row;
  });
  elements.printNewsList.replaceChildren(...nodes);
  return report;
}

function exportTodayPdf() {
  const report = renderPrintReport();
  const previousTitle = document.title;
  document.title = `Git源宝今日AI新闻_${report.date}`;
  const restore = () => {
    document.title = previousTitle;
    window.removeEventListener("afterprint", restore);
  };
  window.addEventListener("afterprint", restore);
  window.print();
  window.setTimeout(() => {
    if (document.title !== previousTitle) restore();
  }, 1200);
}

function pageCountFor(total) {
  return Math.max(1, Math.ceil(total / state.pageSize));
}

function paginationSequence(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const pages = new Set([1, total, current - 1, current, current + 1]);
  const valid = [...pages].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
  const sequence = [];
  valid.forEach((page, index) => {
    if (index && page - valid[index - 1] > 1) sequence.push("gap");
    sequence.push(page);
  });
  return sequence;
}

function goToPage(page, shouldScroll = true) {
  const totalPages = pageCountFor(filteredItems().length);
  const nextPage = Math.min(Math.max(page, 1), totalPages);
  if (nextPage === state.page) return;

  const applyPage = () => {
    state.page = nextPage;
    render();
    pageTransitionAnimation?.cancel();
    pageTransitionAnimation = null;
    if (!reducedMotionQuery.matches) {
      pageTransitionAnimation = elements.list.animate(
        [
          { opacity: 0, transform: "translateX(-18px)" },
          { opacity: 1, transform: "translateX(0)" },
        ],
        { duration: 320, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
      );
    }
    if (shouldScroll) {
      document.querySelector("#latest").scrollIntoView({
        behavior: reducedMotionQuery.matches ? "auto" : "smooth",
        block: "start",
      });
    }
  };

  if (reducedMotionQuery.matches) {
    applyPage();
    return;
  }
  pageTransitionAnimation?.cancel();
  pageTransitionAnimation = elements.list.animate(
    [
      { opacity: 1, transform: "translateX(0)" },
      { opacity: 0, transform: "translateX(18px) scale(0.995)" },
    ],
    { duration: 150, easing: "cubic-bezier(0.7, 0, 0.84, 0)", fill: "forwards" },
  );
  pageTransitionAnimation.addEventListener("finish", applyPage, { once: true });
}

function renderPagination(total) {
  const totalPages = pageCountFor(total);
  state.page = Math.min(state.page, totalPages);
  elements.pagination.hidden = totalPages <= 1;
  if (totalPages <= 1) {
    elements.pagination.replaceChildren();
    return;
  }

  const previous = createText("button", "pagination-direction", "上一页");
  previous.type = "button";
  previous.disabled = state.page === 1;
  previous.addEventListener("click", () => goToPage(state.page - 1));

  const pages = paginationSequence(state.page, totalPages).map((value) => {
    if (value === "gap") return createText("span", "pagination-gap", "…");
    const button = createText("button", "pagination-page", String(value));
    button.type = "button";
    if (value === state.page) button.setAttribute("aria-current", "page");
    button.setAttribute("aria-label", `第 ${value} 页`);
    button.addEventListener("click", () => goToPage(value));
    return button;
  });

  const next = createText("button", "pagination-direction", "下一页");
  next.type = "button";
  next.disabled = state.page === totalPages;
  next.addEventListener("click", () => goToPage(state.page + 1));
  elements.pagination.replaceChildren(previous, ...pages, next);
}

function renderFromFirstPage() {
  state.page = 1;
  render();
}

function pickRandomUnread() {
  let candidates = filteredItems().filter((item) => !state.readIds.has(item.id));
  if (candidates.length > 1) candidates = candidates.filter((item) => item.id !== state.lastRandomId);
  if (!candidates.length) {
    showToast("当前范围已经全部读完", true);
    return;
  }

  const item = candidates[Math.floor(Math.random() * candidates.length)];
  state.lastRandomId = item.id;
  const itemIndex = filteredItems().findIndex((candidate) => candidate.id === item.id);
  state.page = Math.floor(itemIndex / state.pageSize) + 1;
  render();
  const card = [...elements.list.querySelectorAll(".news-card")].find((candidate) => candidate.dataset.itemId === item.id);
  if (!card) return;
  elements.list.querySelectorAll(".is-picked").forEach((candidate) => candidate.classList.remove("is-picked"));
  card.classList.add("is-picked");
  card.scrollIntoView({ behavior: reducedMotionQuery.matches ? "auto" : "smooth", block: "center" });
  showToast(`源宝选好了：${item.sourceName}`);
  window.setTimeout(() => card.classList.remove("is-picked"), 2600);
}

function render() {
  const items = filteredItems();
  const totalPages = pageCountFor(items.length);
  state.page = Math.min(state.page, totalPages);
  const pageStart = (state.page - 1) * state.pageSize;
  const visibleItems = items.slice(pageStart, pageStart + state.pageSize);
  elements.list.replaceChildren(...visibleItems.map((item, index) => createCard(item, index)));
  elements.count.textContent = items.length
    ? `${items.length} 条 · 第 ${state.page}/${totalPages} 页`
    : "0 条";
  elements.empty.hidden = items.length > 0;
  elements.readCount.textContent = String(state.readIds.size);
  renderPagination(items.length);
}

function resetFilters() {
  state.query = "";
  state.source = "all";
  state.range = "all";
  state.hideRead = false;
  state.page = 1;
  elements.search.value = "";
  elements.source.value = "all";
  elements.hideRead.setAttribute("aria-pressed", "false");
  elements.rangeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.range === "all");
  });
  render();
}

function selectMascot(option) {
  if (option.classList.contains("is-active")) return;

  const applySelection = () => {
    elements.mascotDisplay.src = option.dataset.src;
    elements.mascotDisplay.alt = option.dataset.alt;
    elements.mascotName.textContent = option.dataset.name;
    elements.variantOptions.forEach((candidate) => {
      const active = candidate === option;
      candidate.classList.toggle("is-active", active);
      candidate.setAttribute("aria-pressed", String(active));
    });
    elements.mascotDisplay.classList.remove("is-switching");
  };

  const nextImage = new Image();
  nextImage.onload = () => {
    elements.mascotDisplay.classList.add("is-switching");
    window.setTimeout(applySelection, 150);
  };
  nextImage.onerror = () => showToast("这个形态暂时无法加载", true);
  nextImage.src = option.dataset.src;
}

function syncVideoControl() {
  const isPaused = elements.heroVideo.paused;
  elements.videoToggle.setAttribute("aria-pressed", String(isPaused));
  elements.videoToggleLabel.textContent = isPaused ? "播放背景" : "暂停背景";
  elements.videoToggle.title = isPaused ? "播放全屏背景视频" : "暂停全屏背景视频";
}

function applyMotionPreference() {
  if (reducedMotionQuery.matches || saveDataPreference) {
    elements.heroVideo.pause();
    syncVideoControl();
    return;
  }

  elements.heroVideo.play().catch(syncVideoControl);
}

function setupHeroVideo() {
  elements.heroVideo.addEventListener("play", syncVideoControl);
  elements.heroVideo.addEventListener("pause", syncVideoControl);
  elements.heroVideo.addEventListener("error", () => {
    elements.videoToggle.hidden = true;
  });
  elements.videoToggle.addEventListener("click", () => {
    if (elements.heroVideo.paused) {
      elements.heroVideo.play().catch(() => showToast("浏览器暂时阻止了视频播放", true));
    } else {
      elements.heroVideo.pause();
    }
  });
  reducedMotionQuery.addEventListener("change", applyMotionPreference);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      videoPausedForVisibility = !elements.heroVideo.paused;
      if (videoPausedForVisibility) elements.heroVideo.pause();
      return;
    }
    if (videoPausedForVisibility && !reducedMotionQuery.matches && !saveDataPreference) {
      videoPausedForVisibility = false;
      elements.heroVideo.play().catch(syncVideoControl);
    }
  });
  applyMotionPreference();
  syncVideoControl();
}

function setupMotion() {
  const root = document.documentElement;
  const stage = document.querySelector(".mascot-stage");
  const motion = {
    frame: 0,
    lastTime: performance.now(),
    scrollCurrent: 0,
    scrollTarget: 0,
    tiltXCurrent: 0,
    tiltXTarget: 0,
    tiltYCurrent: 0,
    tiltYTarget: 0,
  };

  const schedule = () => {
    if (!motion.frame) motion.frame = requestAnimationFrame(tick);
  };

  const tick = (time) => {
    motion.frame = 0;
    const dt = Math.min((time - motion.lastTime) / 1000, 0.05);
    motion.lastTime = time;
    const scrollFollow = 1 - Math.exp(-12 * dt);
    const tiltFollow = 1 - Math.exp(-16 * dt);
    motion.scrollCurrent += (motion.scrollTarget - motion.scrollCurrent) * scrollFollow;
    motion.tiltXCurrent += (motion.tiltXTarget - motion.tiltXCurrent) * tiltFollow;
    motion.tiltYCurrent += (motion.tiltYTarget - motion.tiltYCurrent) * tiltFollow;
    root.style.setProperty("--page-scroll", motion.scrollCurrent.toFixed(4));
    root.style.setProperty("--hero-tilt-x", motion.tiltXCurrent.toFixed(4));
    root.style.setProperty("--hero-tilt-y", motion.tiltYCurrent.toFixed(4));

    const unsettled = Math.abs(motion.scrollTarget - motion.scrollCurrent) > 0.001 ||
      Math.abs(motion.tiltXTarget - motion.tiltXCurrent) > 0.001 ||
      Math.abs(motion.tiltYTarget - motion.tiltYCurrent) > 0.001;
    if (unsettled) schedule();
  };

  const updateScrollTarget = () => {
    const available = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    motion.scrollTarget = Math.min(1, Math.max(0, window.scrollY / available));
    schedule();
  };

  window.addEventListener("scroll", updateScrollTarget, { passive: true });
  window.addEventListener("resize", updateScrollTarget, { passive: true });
  updateScrollTarget();

  if (stage && window.matchMedia("(pointer: fine)").matches && !reducedMotionQuery.matches) {
    stage.addEventListener("pointermove", (event) => {
      const box = stage.getBoundingClientRect();
      motion.tiltXTarget = ((event.clientX - box.left) / box.width - 0.5) * 2;
      motion.tiltYTarget = ((event.clientY - box.top) / box.height - 0.5) * 2;
      schedule();
    });
    stage.addEventListener("pointerleave", () => {
      motion.tiltXTarget = 0;
      motion.tiltYTarget = 0;
      schedule();
    });
  }
}

function bindEvents() {
  elements.search.addEventListener("input", (event) => {
    state.query = event.target.value;
    renderFromFirstPage();
  });
  elements.source.addEventListener("change", (event) => {
    state.source = event.target.value;
    renderFromFirstPage();
  });
  elements.rangeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.range = button.dataset.range;
      elements.rangeButtons.forEach((candidate) => candidate.classList.toggle("is-active", candidate === button));
      renderFromFirstPage();
    });
  });
  elements.variantOptions.forEach((option) => {
    option.addEventListener("click", () => selectMascot(option));
  });
  elements.hideRead.addEventListener("click", () => {
    state.hideRead = !state.hideRead;
    elements.hideRead.setAttribute("aria-pressed", String(state.hideRead));
    renderFromFirstPage();
  });
  elements.briefPrev.addEventListener("click", () => {
    if (!state.briefItems.length) return;
    state.briefIndex = (state.briefIndex - 1 + state.briefItems.length) % state.briefItems.length;
    renderBrief();
  });
  elements.briefNext.addEventListener("click", () => {
    if (!state.briefItems.length) return;
    state.briefIndex = (state.briefIndex + 1) % state.briefItems.length;
    renderBrief();
  });
  elements.briefTitle.addEventListener("click", () => {
    if (elements.briefTitle.dataset.itemId) markRead(elements.briefTitle.dataset.itemId);
  });
  elements.randomFeed.addEventListener("click", pickRandomUnread);
  elements.copyBrief.addEventListener("click", copyTodayBrief);
  elements.exportPdf.addEventListener("click", exportTodayPdf);
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
  elements.updateLine.classList.toggle("is-warning", failed.length > 0);
}

function renderStats(items) {
  const sourceCount = new Set(items.map((item) => item.sourceId)).size;
  const todayCount = items.filter((item) => item.publishedAt && dayDistance(item.publishedAt) === 0).length;
  elements.statTotal.textContent = String(items.length);
  elements.statSources.textContent = String(sourceCount);
  elements.statToday.textContent = String(todayCount);
}

async function initialize() {
  setupHeroVideo();
  setupMotion();
  loadReadIds();
  bindEvents();
  try {
    const [newsResponse, statusResponse] = await Promise.all([
      fetch("data/news.json", { cache: "no-store" }),
      fetch("data/update-status.json", { cache: "no-store" }),
    ]);
    if (!newsResponse.ok) throw new Error(`资讯读取失败：${newsResponse.status}`);
    state.items = await newsResponse.json();
    const status = statusResponse.ok ? await statusResponse.json() : null;
    state.sourceStatus = new Map((status?.sources || []).map((source) => [source.sourceId, source]));
    state.briefItems = pickBriefItems(state.items);
    populateSources(state.items);
    renderStats(state.items);
    renderRadar(state.items);
    renderMascotMessage(state.items, status);
    renderBrief();
    render();
    renderStatus(status);
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
