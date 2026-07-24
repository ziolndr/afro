import { decodeEntities, detectCountries, extractImageUrls, extractMediaLinks, hashText, stripHtml, truncate } from "./html.mjs";

const EXCLUDED_TYPES = new Set([
  "attachment", "nav_menu_item", "revision", "wp_block", "wp_template", "wp_template_part",
  "wp_navigation", "wp_global_styles", "wp_font_family", "wp_font_face", "user_request"
]);

const CORE_TYPES = [
  { slug: "post", restBase: "posts", restNamespace: "wp/v2", name: "Stories", core: true },
  { slug: "page", restBase: "pages", restNamespace: "wp/v2", name: "Pages", core: true }
];

function cleanBaseUrl(value) {
  return String(value || "https://www.afromag.co.za").replace(/\/+$/, "");
}

function cleanRoutePart(value, fallback = "") {
  return String(value || fallback).replace(/^\/+|\/+$/g, "");
}

class HttpError extends Error {
  constructor(response, url) {
    super(`${response.status} ${response.statusText || "HTTP error"} · ${url}`);
    this.name = "HttpError";
    this.status = response.status;
    this.statusText = response.statusText || "";
    this.url = String(url);
  }
}

async function getJson(url, { timeoutMs = 45000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "AFRO-ARBITER-Field/1.0 (+source-preserving archive build)" },
      signal: controller.signal
    });
    if (!response.ok) throw new HttpError(response, url);
    return { data: await response.json(), headers: response.headers };
  } finally {
    clearTimeout(timer);
  }
}

function routeUrl(baseUrl, restBase, restNamespace = "wp/v2") {
  const namespace = cleanRoutePart(restNamespace, "wp/v2");
  const base = cleanRoutePart(restBase);
  return new URL(`${baseUrl}/wp-json/${namespace}/${base}`);
}

async function fetchPaginated(baseUrl, typeOrRestBase, params = {}, progress = () => {}) {
  const type = typeof typeOrRestBase === "string"
    ? { restBase: typeOrRestBase, restNamespace: "wp/v2", slug: typeOrRestBase }
    : typeOrRestBase;
  const firstUrl = routeUrl(baseUrl, type.restBase, type.restNamespace);
  for (const [key, value] of Object.entries({ per_page: 100, page: 1, ...params })) firstUrl.searchParams.set(key, String(value));
  const first = await getJson(firstUrl);
  const totalPages = Number(first.headers.get("x-wp-totalpages") || 1);
  const total = Number(first.headers.get("x-wp-total") || (Array.isArray(first.data) ? first.data.length : 0) || 0);
  const rows = Array.isArray(first.data) ? [...first.data] : [];
  progress({
    slug: type.slug,
    restBase: type.restBase,
    restNamespace: type.restNamespace,
    page: 1,
    totalPages,
    total,
    loaded: rows.length
  });
  for (let page = 2; page <= totalPages; page += 1) {
    const url = new URL(firstUrl);
    url.searchParams.set("page", String(page));
    const response = await getJson(url);
    if (Array.isArray(response.data)) rows.push(...response.data);
    progress({
      slug: type.slug,
      restBase: type.restBase,
      restNamespace: type.restNamespace,
      page,
      totalPages,
      total,
      loaded: rows.length
    });
  }
  return rows;
}

export function normalizeTypePayload(data) {
  const discovered = Object.entries(data || {}).map(([key, value]) => {
    const type = value || {};
    const slug = String(type.slug || key || "").trim();
    const restBase = String(type.rest_base || type.restBase || "").trim();
    const restNamespace = String(type.rest_namespace || type.restNamespace || "wp/v2").trim();
    return {
      slug,
      restBase,
      restNamespace,
      name: decodeEntities(type.name || type.labels?.name || slug),
      core: slug === "post" || slug === "page"
    };
  }).filter((type) => {
    if (!type.slug || !type.restBase) return false;
    if (EXCLUDED_TYPES.has(type.slug)) return false;
    if (type.restBase === "media") return false;
    return true;
  });

  // WordPress installations differ on whether /types includes `viewable`, and
  // plugin post types may advertise routes that later return 401/403/404.
  // Always attempt posts/pages, then best-effort every other public route.
  const merged = [...CORE_TYPES, ...discovered];
  const seen = new Set();
  return merged.filter((type) => {
    const key = `${cleanRoutePart(type.restNamespace, "wp/v2")}/${cleanRoutePart(type.restBase)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function discoverTypes(baseUrl) {
  try {
    const { data } = await getJson(`${baseUrl}/wp-json/wp/v2/types`);
    return normalizeTypePayload(data);
  } catch {
    return [...CORE_TYPES];
  }
}

function termNames(post) {
  const groups = post?._embedded?.["wp:term"] || [];
  const categories = [];
  const tags = [];
  for (const group of groups) {
    for (const term of group || []) {
      if (term?.taxonomy === "category") categories.push(decodeEntities(term.name || ""));
      else if (term?.taxonomy === "post_tag") tags.push(decodeEntities(term.name || ""));
    }
  }
  return { categories: [...new Set(categories.filter(Boolean))], tags: [...new Set(tags.filter(Boolean))] };
}

function featuredMedia(post, mediaMap) {
  const embedded = post?._embedded?.["wp:featuredmedia"]?.[0];
  const fallback = mediaMap.get(Number(post.featured_media));
  const media = embedded || fallback || null;
  if (!media) return null;
  const sizes = media?.media_details?.sizes || {};
  return {
    id: media.id || post.featured_media || null,
    url: media.source_url || sizes.full?.source_url || sizes.large?.source_url || "",
    alt: decodeEntities(media.alt_text || ""),
    caption: stripHtml(media.caption?.rendered || ""),
    width: Number(media.media_details?.width || 0),
    height: Number(media.media_details?.height || 0),
    mime: media.mime_type || ""
  };
}

function normalizePost(post, type, mediaMap) {
  const title = stripHtml(post.title?.rendered || "Untitled");
  const contentHtml = String(post.content?.rendered || "");
  const contentText = stripHtml(contentHtml);
  const excerpt = stripHtml(post.excerpt?.rendered || "") || truncate(contentText, 320);
  const { categories, tags } = termNames(post);
  const author = post?._embedded?.author?.[0];
  const media = featuredMedia(post, mediaMap);
  const inlineImages = extractImageUrls(contentHtml);
  const images = [...new Set([media?.url, ...inlineImages].filter(Boolean))];
  const mediaLinks = extractMediaLinks(contentHtml);
  const countryText = `${title}\n${excerpt}\n${categories.join(" ")}\n${tags.join(" ")}\n${contentText}`;
  const countries = detectCountries(countryText);
  const semanticText = [
    title,
    excerpt,
    categories.length ? `Categories: ${categories.join(", ")}` : "",
    tags.length ? `Topics: ${tags.join(", ")}` : "",
    countries.length ? `Countries: ${countries.join(", ")}` : "",
    author?.name ? `Author: ${decodeEntities(author.name)}` : "",
    media?.alt ? `Image: ${media.alt}` : "",
    media?.caption ? `Image caption: ${media.caption}` : "",
    contentText.slice(0, 24000)
  ].filter(Boolean).join("\n\n");
  const wordCount = contentText.split(/\s+/).filter(Boolean).length;
  return {
    id: `afromag:${type.slug}:${post.id}`,
    sourceId: Number(post.id),
    type: type.slug === "post" ? "story" : type.slug,
    typeLabel: type.name,
    slug: post.slug || "",
    title,
    excerpt: truncate(excerpt, 360),
    body: contentText,
    url: post.link || "",
    date: post.date_gmt ? `${post.date_gmt}Z` : post.date || "",
    modified: post.modified_gmt ? `${post.modified_gmt}Z` : post.modified || "",
    author: author ? { id: author.id || null, name: decodeEntities(author.name || ""), url: author.link || "" } : null,
    categories,
    tags,
    countries,
    image: media,
    images,
    mediaLinks,
    readMinutes: Math.max(1, Math.round(wordCount / 220)),
    semanticText,
    contentHash: hashText(`${post.modified || ""}\n${semanticText}`),
    source: "Afro Magazine"
  };
}

function normalizeMedia(media, parentMap) {
  const title = stripHtml(media.title?.rendered || "");
  const caption = stripHtml(media.caption?.rendered || "");
  const description = stripHtml(media.description?.rendered || "");
  const alt = decodeEntities(media.alt_text || "").trim();
  const parent = parentMap.get(Number(media.post));
  const semanticText = [title, alt, caption, description, parent?.title ? `From story: ${parent.title}` : ""].filter(Boolean).join("\n\n");
  if (semanticText.length < 24) return null;
  const countries = detectCountries(semanticText);
  return {
    id: `afromag:media:${media.id}`,
    sourceId: Number(media.id),
    type: "media",
    typeLabel: "Media",
    slug: media.slug || "",
    title: title || alt || parent?.title || "Afro Magazine media",
    excerpt: truncate(caption || description || alt, 360),
    body: description,
    url: media.link || media.source_url || "",
    date: media.date_gmt ? `${media.date_gmt}Z` : media.date || "",
    modified: media.modified_gmt ? `${media.modified_gmt}Z` : media.modified || "",
    author: null,
    categories: parent?.categories || [],
    tags: parent?.tags || [],
    countries,
    image: {
      id: Number(media.id),
      url: media.source_url || "",
      alt,
      caption,
      width: Number(media.media_details?.width || 0),
      height: Number(media.media_details?.height || 0),
      mime: media.mime_type || ""
    },
    images: media.source_url ? [media.source_url] : [],
    mediaLinks: [],
    readMinutes: 1,
    semanticText,
    contentHash: hashText(`${media.modified || ""}\n${semanticText}`),
    source: "Afro Magazine"
  };
}

function describeFailure(type, error) {
  return {
    slug: type.slug,
    name: type.name,
    restBase: type.restBase,
    restNamespace: type.restNamespace,
    status: Number(error?.status || 0) || null,
    message: String(error?.message || error),
    url: error?.url || `${type.restNamespace}/${type.restBase}`
  };
}

export async function collectAfroContent({
  sourceUrl = "https://www.afromag.co.za",
  includePages = true,
  includeMediaRecords = false,
  progress = () => {}
} = {}) {
  const baseUrl = cleanBaseUrl(sourceUrl);
  const types = await discoverTypes(baseUrl);
  const selectedTypes = types.filter((type) => includePages || type.slug !== "page");
  const mediaType = { slug: "attachment", restBase: "media", restNamespace: "wp/v2", name: "Media", core: false };
  const media = await fetchPaginated(baseUrl, mediaType, { _embed: 1 }, progress).catch((error) => {
    progress({ ...mediaType, skipped: true, error: describeFailure(mediaType, error) });
    return [];
  });
  const mediaMap = new Map(media.map((item) => [Number(item.id), item]));
  const rawByType = {};
  const records = [];
  const failures = [];

  for (const type of selectedTypes) {
    try {
      const rows = await fetchPaginated(baseUrl, type, { _embed: 1 }, progress);
      rawByType[type.slug] = rows;
      for (const row of rows) records.push(normalizePost(row, type, mediaMap));
    } catch (error) {
      const failure = describeFailure(type, error);
      failures.push(failure);
      rawByType[type.slug] = [];
      progress({ ...type, skipped: true, error: failure });
    }
  }

  const parentMap = new Map(records.map((record) => [record.sourceId, record]));
  if (includeMediaRecords) {
    for (const row of media) {
      const record = normalizeMedia(row, parentMap);
      if (record) records.push(record);
    }
  }
  records.sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.title.localeCompare(b.title));
  return {
    baseUrl,
    types: selectedTypes,
    records,
    failures,
    raw: { types: rawByType, media, failures }
  };
}
