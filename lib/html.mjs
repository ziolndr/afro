import { createHash } from "node:crypto";

const NAMED_ENTITIES = new Map([
  ["amp", "&"], ["lt", "<"], ["gt", ">"], ["quot", '"'], ["apos", "'"],
  ["nbsp", " "], ["ndash", "–"], ["mdash", "—"], ["hellip", "…"],
  ["rsquo", "’"], ["lsquo", "‘"], ["rdquo", "”"], ["ldquo", "“"],
  ["copy", "©"], ["trade", "™"], ["reg", "®"]
]);

export function decodeEntities(value = "") {
  return String(value).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, token) => {
    if (token.startsWith("#x") || token.startsWith("#X")) {
      const code = Number.parseInt(token.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (token.startsWith("#")) {
      const code = Number.parseInt(token.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES.get(token.toLowerCase()) ?? match;
  });
}

export function stripHtml(value = "") {
  return decodeEntities(
    String(value)
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|blockquote|section|article)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function truncate(value = "", length = 260) {
  const clean = String(value).trim();
  if (clean.length <= length) return clean;
  const slice = clean.slice(0, Math.max(0, length - 1));
  const boundary = slice.lastIndexOf(" ");
  return `${slice.slice(0, boundary > length * 0.65 ? boundary : slice.length).trim()}…`;
}

export function extractImageUrls(value = "") {
  const urls = [];
  const pattern = /<img\b[^>]*?\bsrc=["']([^"']+)["'][^>]*>/gi;
  for (const match of String(value).matchAll(pattern)) urls.push(decodeEntities(match[1]));
  return [...new Set(urls.filter(Boolean))];
}

export function extractMediaLinks(value = "") {
  const links = [];
  const pattern = /<a\b[^>]*?\bhref=["']([^"']+)["'][^>]*>/gi;
  for (const match of String(value).matchAll(pattern)) {
    const url = decodeEntities(match[1]);
    if (/youtube\.com|youtu\.be|vimeo\.com|soundcloud\.com|spotify\.com|apple\.com\/.*music/i.test(url)) {
      links.push(url);
    }
  }
  return [...new Set(links)];
}

const COUNTRY_ALIASES = [
  ["Algeria", ["algeria"]], ["Angola", ["angola"]], ["Benin", ["benin"]],
  ["Botswana", ["botswana"]], ["Burkina Faso", ["burkina faso"]], ["Burundi", ["burundi"]],
  ["Cabo Verde", ["cabo verde", "cape verde"]], ["Cameroon", ["cameroon"]],
  ["Central African Republic", ["central african republic"]], ["Chad", ["chad"]],
  ["Comoros", ["comoros"]], ["Democratic Republic of the Congo", ["democratic republic of the congo", "dr congo", "drc", "congolese"]],
  ["Republic of the Congo", ["republic of the congo", "congo-brazzaville"]],
  ["Côte d’Ivoire", ["côte d’ivoire", "cote d'ivoire", "ivory coast", "ivoirian"]],
  ["Djibouti", ["djibouti"]], ["Egypt", ["egypt", "egyptian"]],
  ["Equatorial Guinea", ["equatorial guinea"]], ["Eritrea", ["eritrea", "eritrean"]],
  ["Eswatini", ["eswatini", "swaziland"]], ["Ethiopia", ["ethiopia", "ethiopian"]],
  ["Gabon", ["gabon"]], ["Gambia", ["gambia", "gambian"]], ["Ghana", ["ghana", "ghanaian"]],
  ["Guinea", ["guinea"]], ["Guinea-Bissau", ["guinea-bissau"]], ["Kenya", ["kenya", "kenyan"]],
  ["Lesotho", ["lesotho"]], ["Liberia", ["liberia", "liberian"]], ["Libya", ["libya", "libyan"]],
  ["Madagascar", ["madagascar", "malagasy"]], ["Malawi", ["malawi", "malawian"]],
  ["Mali", ["mali", "malian"]], ["Mauritania", ["mauritania", "mauritanian"]],
  ["Mauritius", ["mauritius", "mauritian"]], ["Morocco", ["morocco", "moroccan"]],
  ["Mozambique", ["mozambique", "mozambican"]], ["Namibia", ["namibia", "namibian"]],
  ["Niger", ["niger"]], ["Nigeria", ["nigeria", "nigerian"]], ["Rwanda", ["rwanda", "rwandan"]],
  ["São Tomé and Príncipe", ["são tomé", "sao tome"]], ["Senegal", ["senegal", "senegalese"]],
  ["Seychelles", ["seychelles", "seychellois"]], ["Sierra Leone", ["sierra leone"]],
  ["Somalia", ["somalia", "somali"]], ["South Africa", ["south africa", "south african"]],
  ["South Sudan", ["south sudan", "south sudanese"]], ["Sudan", ["sudan", "sudanese"]],
  ["Tanzania", ["tanzania", "tanzanian"]], ["Togo", ["togo", "togolese"]],
  ["Tunisia", ["tunisia", "tunisian"]], ["Uganda", ["uganda", "ugandan"]],
  ["Zambia", ["zambia", "zambian", "lusaka", "copperbelt"]],
  ["Zimbabwe", ["zimbabwe", "zimbabwean", "harare"]]
];

export function detectCountries(value = "") {
  const haystack = ` ${String(value).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")} `;
  const found = [];
  for (const [country, aliases] of COUNTRY_ALIASES) {
    if (aliases.some((alias) => {
      const clean = alias.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
      return new RegExp(`(^|[^a-z])${clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`, "i").test(haystack);
    })) found.push(country);
  }
  return found;
}

export function hashText(value = "") {
  return createHash("sha256").update(String(value)).digest("hex");
}
