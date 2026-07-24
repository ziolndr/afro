import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { decodeEntities, detectCountries, extractImageUrls, stripHtml, truncate } from "../lib/html.mjs";
import { collectAfroContent, normalizeTypePayload } from "../lib/wordpress.mjs";

assert.equal(decodeEntities("Africa&#8217;s &amp; future"), "Africa’s & future");
assert.equal(stripHtml("<p>Hello <strong>Africa</strong></p><script>bad()</script>"), "Hello Africa");
assert.deepEqual(extractImageUrls('<p><img src="https://x/a.jpg"><img src="https://x/a.jpg"><img src="https://x/b.png"></p>'), ["https://x/a.jpg", "https://x/b.png"]);
assert.deepEqual(detectCountries("A Lusaka founder expands from Zambia into South Africa and Kenya."), ["Kenya", "South Africa", "Zambia"]);
assert.equal(truncate("one two three four five", 14), "one two three…");

const typesWithoutViewable = normalizeTypePayload({
  post: { slug: "post", rest_base: "posts", rest_namespace: "wp/v2", name: "Posts" },
  page: { slug: "page", rest_base: "pages", rest_namespace: "wp/v2", name: "Pages" },
  attachment: { slug: "attachment", rest_base: "media", name: "Media" }
});
assert.deepEqual(typesWithoutViewable.map(({ slug, restBase, restNamespace }) => [slug, restBase, restNamespace]), [
  ["post", "posts", "wp/v2"],
  ["page", "pages", "wp/v2"]
]);

const namespacedTypes = normalizeTypePayload({
  custom: { slug: "custom", rest_base: "items", rest_namespace: "vendor/v1", name: "Custom" }
});
assert.equal(namespacedTypes.find((type) => type.slug === "custom")?.restNamespace, "vendor/v1");

const emptyTypes = normalizeTypePayload({});
assert.deepEqual(emptyTypes.map(({ slug, restBase }) => [slug, restBase]), [["post", "posts"], ["page", "pages"]]);

// Regression: a plugin type can be listed in /types while its advertised route
// returns 404. The complete field must retain posts/pages and skip only that route.
const server = http.createServer((request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  response.setHeader("content-type", "application/json");
  response.setHeader("x-wp-totalpages", "1");
  if (url.pathname === "/wp-json/wp/v2/types") {
    response.end(JSON.stringify({
      post: { slug: "post", rest_base: "posts", rest_namespace: "wp/v2", name: "Posts" },
      page: { slug: "page", rest_base: "pages", rest_namespace: "wp/v2", name: "Pages" },
      custom: { slug: "custom", rest_base: "private-items", rest_namespace: "vendor/v1", name: "Private Items" }
    }));
    return;
  }
  if (url.pathname === "/wp-json/wp/v2/media") {
    response.setHeader("x-wp-total", "0");
    response.end("[]");
    return;
  }
  if (url.pathname === "/wp-json/wp/v2/posts" || url.pathname === "/wp-json/wp/v2/pages") {
    const isPost = url.pathname.endsWith("posts");
    response.setHeader("x-wp-total", "1");
    response.end(JSON.stringify([{
      id: isPost ? 1 : 2,
      slug: isPost ? "story" : "about",
      link: `http://example.test/${isPost ? "story" : "about"}`,
      date: "2026-07-24T10:00:00",
      modified: "2026-07-24T10:00:00",
      title: { rendered: isPost ? "A story" : "About" },
      excerpt: { rendered: "Public content" },
      content: { rendered: "<p>Public African content.</p>" },
      _embedded: {}
    }]));
    return;
  }
  if (url.pathname === "/wp-json/vendor/v1/private-items") {
    response.statusCode = 404;
    response.end(JSON.stringify({ code: "rest_no_route" }));
    return;
  }
  response.statusCode = 404;
  response.end(JSON.stringify({ code: "rest_no_route" }));
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
try {
  const address = server.address();
  const result = await collectAfroContent({ sourceUrl: `http://127.0.0.1:${address.port}` });
  assert.equal(result.records.length, 2);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].status, 404);
  assert.equal(result.failures[0].restNamespace, "vendor/v1");
} finally {
  server.close();
  await once(server, "close");
}

console.log("PASS · AFRO editorial field unit tests");
