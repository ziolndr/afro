const elements = {
  fieldState: document.querySelector("#field-state"),
  form: document.querySelector("#search-form"),
  query: document.querySelector("#query"),
  submit: document.querySelector("#search-form button[type='submit']"),
  categoryNav: document.querySelector("#primary-navigation"),
  mobileNav: document.querySelector("#mobile-navigation"),
  trendingFilters: document.querySelector("#trending-filters"),
  sectionLabel: document.querySelector("#section-label"),
  outputTitle: document.querySelector("#output-title"),
  measurement: document.querySelector("#measurement"),
  grid: document.querySelector("#story-grid"),
  trendingGrid: document.querySelector("#trending-grid"),
  wireItems: document.querySelector("#wire-items"),
  empty: document.querySelector("#empty-state"),
  storyCount: document.querySelector("#story-count"),
  categoryCount: document.querySelector("#category-count"),
  countryCount: document.querySelector("#country-count"),
  themeToggle: document.querySelector("#theme-toggle"),
  menuButton: document.querySelector("#menu-button"),
  searchJump: document.querySelector("#search-jump"),
  viewLatest: document.querySelector("#view-latest"),
  exploreAll: document.querySelector("#explore-all"),
  learnMore: document.querySelector("#learn-more"),
  backHome: document.querySelector("#back-home")
};

const state = {
  manifest: null,
  category: "",
  query: "",
  requestId: 0,
  timer: null,
  latest: []
};

function setResultsMode(active, { returnToTop = false } = {}) {
  const wasActive = document.body.classList.contains("results-active");
  document.body.classList.toggle("results-active", Boolean(active));
  if (active && returnToTop && !wasActive) {
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  }
}

function clearSearchMode() {
  clearTimeout(state.timer);
  state.query = "";
  elements.query.value = "";
  elements.query.style.height = "auto";
  setResultsMode(false);
  const url = new URL(window.location.href);
  url.searchParams.delete("q");
  history.replaceState({}, "", url);
  loadLatest({ preserveHome: true }).catch(() => {});
  requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
}

const HEADER_SECTIONS = ["", "Culture", "Business", "Travel", "Entertainment"];
const TRENDING_SECTIONS = ["", "Fashion", "Adventure", "Health & Fitness", "Business", "Entertainment", "Lifestyle", "Sports"];

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[character]);
}

function formatDate(value, compact = false) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  return new Intl.DateTimeFormat("en-US", compact
    ? { month: "short", day: "numeric", year: "numeric" }
    : { year: "numeric", month: "long", day: "numeric" }
  ).format(date);
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(Number(value || 0));
}

function categoryFor(record) {
  return record.categories?.[0] || record.typeLabel || record.type || "Story";
}

function recordImage(record) {
  return record.image?.url || record.images?.[0] || "";
}

function preferredTrending(records, count = 4) {
  const selected = [];
  for (const record of records.filter((item) => recordImage(item))) {
    if (selected.length >= count) break;
    selected.push(record);
  }
  for (const record of records) {
    if (selected.length >= count) break;
    if (!selected.some((item) => item.id === record.id)) selected.push(record);
  }
  return selected;
}

function storyCard(record, index, ranked) {
  const image = recordImage(record);
  const rank = ranked ? String(record.rank || index + 1).padStart(2, "0") : "";
  const score = ranked && Number.isFinite(Number(record.resonance)) ? Number(record.resonance).toFixed(3) : "";
  return `
    <article class="story-card">
      <a class="story-link" href="${escapeHtml(record.url || "#")}" target="_blank" rel="noreferrer">
        <div class="story-image-wrap">
          ${image ? `<img class="story-image" src="${escapeHtml(image)}" alt="${escapeHtml(record.image?.alt || record.title || "")}" loading="lazy" decoding="async">` : `<div class="story-no-image">AFRO</div>`}
        </div>
        <div class="story-topline">
          <span>${escapeHtml(categoryFor(record))}${record.countries?.[0] ? ` · ${escapeHtml(record.countries[0])}` : ""}</span>
          <span class="story-rank">${rank}</span>
        </div>
        <h3>${escapeHtml(record.title)}</h3>
        ${record.excerpt ? `<p class="story-excerpt">${escapeHtml(record.excerpt)}</p>` : ""}
        <div class="story-footer">
          <span>${escapeHtml(formatDate(record.date, true))}${record.readMinutes ? ` · ${record.readMinutes} min read` : ""}</span>
          <span class="resonance">${score ? `resonance ${score}` : "read story ↗"}</span>
        </div>
      </a>
    </article>`;
}

function trendingCard(record) {
  const image = recordImage(record);
  return `
    <article class="trending-card">
      <a href="${escapeHtml(record.url || "#")}" target="_blank" rel="noreferrer">
        <div class="trending-image">
          ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(record.image?.alt || record.title || "")}" loading="eager" decoding="async">` : `<div class="story-no-image">AFRO</div>`}
        </div>
        <div class="trending-copy">
          <div class="trending-meta">${escapeHtml(categoryFor(record))}</div>
          <h3>${escapeHtml(record.title)}</h3>
          <div class="trending-date">${escapeHtml(formatDate(record.date, true))}${record.readMinutes ? ` · ${record.readMinutes} min read` : ""}</div>
        </div>
      </a>
    </article>`;
}

function render(records, { ranked = false } = {}) {
  elements.grid.innerHTML = records.map((record, index) => storyCard(record, index, ranked)).join("");
  elements.empty.hidden = records.length > 0;
  if (!records.length) {
    elements.empty.textContent = state.query
      ? "No stories cleared this field and section."
      : "No published stories are available for this section.";
  }
}

function renderHomeData(records) {
  state.latest = records;
  elements.trendingGrid.innerHTML = preferredTrending(records, 4).map(trendingCard).join("");
  elements.wireItems.innerHTML = records.slice(0, 3).map((record) => `<span class="wire-item">${escapeHtml(record.title)}</span>`).join("");
}

function availableName(name) {
  if (!name) return "";
  const match = (state.manifest?.categories || []).find((row) => row.name.toLowerCase() === name.toLowerCase());
  return match?.name || name;
}

function categoryButton(category, label) {
  return `<button type="button" data-category="${escapeHtml(category)}" class="${category === state.category ? "active" : ""}">${escapeHtml(label)}</button>`;
}

function renderCategoryControls() {
  const headerSearch = elements.categoryNav.querySelector(".header-search");
  const sections = HEADER_SECTIONS.map((name) => availableName(name));
  elements.categoryNav.querySelectorAll("[data-category]").forEach((button) => {
    button.classList.toggle("active", (button.dataset.category || "") === state.category);
  });
  elements.mobileNav.innerHTML = sections.map((category, index) => categoryButton(category, index === 0 ? "Stories" : category)).join("");
  elements.trendingFilters.innerHTML = TRENDING_SECTIONS
    .map((name) => availableName(name))
    .map((category, index) => categoryButton(category, index === 0 ? "All" : (category === "Health & Fitness" ? "Health" : category)))
    .join("");
  if (headerSearch) elements.categoryNav.appendChild(headerSearch);
}

function renderFacts(manifest) {
  elements.storyCount.textContent = formatNumber(manifest.count);
  elements.categoryCount.textContent = formatNumber(manifest.categories?.length || 0);
  elements.countryCount.textContent = formatNumber(manifest.countries?.length || 0);
}

async function request(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

async function loadLatest({ preserveHome = false, keepMode = false } = {}) {
  state.query = "";
  if (!keepMode) setResultsMode(false);
  const params = new URLSearchParams({ k: "32" });
  if (state.category) params.set("category", state.category);
  const data = await request(`/field/v1/latest?${params}`);
  if (!preserveHome || !state.latest.length) renderHomeData(data.results);
  elements.sectionLabel.textContent = state.category ? `${state.category} · complete archive` : "The complete archive";
  elements.outputTitle.textContent = state.category || "Latest stories";
  elements.measurement.textContent = `${formatNumber(data.count)} stories embedded once in ARBITER`;
  const homeIds = new Set(preferredTrending(data.results, 4).map((record) => record.id));
  const feed = data.results.filter((record) => !homeIds.has(record.id)).slice(0, 16);
  render(feed.length ? feed : data.results, { ranked: false });
}

async function selectCategory(category, { scroll = false } = {}) {
  state.category = category || "";
  renderCategoryControls();
  elements.mobileNav.classList.remove("open");
  elements.menuButton.setAttribute("aria-expanded", "false");
  const url = new URL(window.location.href);
  if (state.category) url.searchParams.set("section", state.category); else url.searchParams.delete("section");
  history.replaceState({}, "", url);
  if (elements.query.value.trim().length >= 2) await search({ scroll: false });
  else {
    await loadLatest();
    if (scroll) document.querySelector(".trending-section").scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

async function search({ scroll = false } = {}) {
  const text = elements.query.value.trim();
  if (text.length < 2) return loadLatest({ preserveHome: true });
  setResultsMode(true, { returnToTop: scroll });
  const requestId = ++state.requestId;
  state.query = text;
  elements.submit.disabled = true;
  elements.fieldState.textContent = "ARBITER measuring the field";
  try {
    const data = await request("/field/v1/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, k: 24, category: state.category })
    });
    if (requestId !== state.requestId) return;
    elements.sectionLabel.textContent = state.category ? `Meaning field · ${state.category}` : "Meaning field";
    elements.outputTitle.textContent = `“${text}”`;
    elements.measurement.textContent = `${formatNumber(data.meta.count)} stories · ${data.meta.dimension}D · ${data.meta.latencyMs}ms`;
    elements.fieldState.textContent = `${formatNumber(data.meta.count)} stories · ARBITER live`;
    render(data.results, { ranked: true });
    const url = new URL(window.location.href);
    url.searchParams.set("q", text);
    if (state.category) url.searchParams.set("section", state.category); else url.searchParams.delete("section");
    history.replaceState({}, "", url);
    if (scroll) requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  } catch (error) {
    elements.empty.hidden = false;
    elements.empty.textContent = error.message;
    elements.fieldState.textContent = "Field unavailable";
  } finally {
    if (requestId === state.requestId) elements.submit.disabled = false;
  }
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("afro-theme", theme);
  document.querySelector('meta[name="theme-color"]').setAttribute("content", theme === "dark" ? "#090908" : "#fbfaf7");
}

async function initialize() {
  try {
    const manifest = await request("/field/v1/manifest");
    if (manifest.status !== "ready") throw new Error("The field has not been built yet.");
    state.manifest = manifest;
    state.category = new URL(window.location.href).searchParams.get("section") || "";
    elements.fieldState.textContent = `${formatNumber(manifest.count)} stories · ${manifest.dimension}D`;
    renderCategoryControls();
    renderFacts(manifest);
    await loadLatest();
    const query = new URL(window.location.href).searchParams.get("q") || "";
    if (query) {
      elements.query.value = query;
      setResultsMode(true);
      await search();
    }
  } catch (error) {
    elements.fieldState.textContent = "Field not built";
    elements.wireItems.innerHTML = "<span>Build the Afro Magazine field to load live stories.</span>";
    elements.trendingGrid.innerHTML = "";
    elements.empty.hidden = false;
    elements.empty.innerHTML = `The complete Afro Magazine field is not present yet. Run <code>npm run build-field</code>, then restart the site.`;
  }
}

function categoryClick(event) {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  selectCategory(button.dataset.category || "", { scroll: event.currentTarget === elements.trendingFilters });
}

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  clearTimeout(state.timer);
  search({ scroll: true });
});

elements.query.addEventListener("input", () => {
  clearTimeout(state.timer);
  elements.query.style.height = "auto";
  elements.query.style.height = `${Math.min(elements.query.scrollHeight, 66)}px`;
  const text = elements.query.value.trim();
  if (text.length === 0) {
    setResultsMode(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("q");
    history.replaceState({}, "", url);
  }
  state.timer = setTimeout(() => text.length >= 3 ? search() : (text.length === 0 ? loadLatest({ preserveHome: true }) : null), 480);
});

elements.categoryNav.addEventListener("click", categoryClick);
elements.mobileNav.addEventListener("click", categoryClick);
elements.trendingFilters.addEventListener("click", categoryClick);

document.querySelectorAll("[data-query]").forEach((button) => button.addEventListener("click", () => {
  elements.query.value = button.dataset.query;
  search({ scroll: true });
}));

elements.themeToggle.addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
elements.menuButton.addEventListener("click", () => {
  const open = !elements.mobileNav.classList.contains("open");
  elements.mobileNav.classList.toggle("open", open);
  elements.menuButton.setAttribute("aria-expanded", String(open));
});
elements.searchJump.addEventListener("click", () => {
  elements.query.focus();
  document.querySelector(".search-form").scrollIntoView({ behavior: "smooth", block: "center" });
});
elements.viewLatest.addEventListener("click", () => document.querySelector(".field-output").scrollIntoView({ behavior: "smooth", block: "start" }));
elements.exploreAll.addEventListener("click", () => document.querySelector(".field-output").scrollIntoView({ behavior: "smooth", block: "start" }));
elements.learnMore.addEventListener("click", () => document.querySelector(".field-output").scrollIntoView({ behavior: "smooth", block: "start" }));
elements.backHome.addEventListener("click", clearSearchMode);

initialize();
