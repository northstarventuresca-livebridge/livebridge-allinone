import assert from "node:assert/strict";
import worker from "../test-preview/password-login-preview-worker.mjs";

for (const pathname of ["/login/", "/admin/"]) {
  const response = await worker.fetch(new Request("https://preview.example" + pathname), {});
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /clerk-js@6\/dist\/clerk\.browser\.js/);
  const inline = [...html.matchAll(/<script>([^]*?)<\/script>/g)].map(m => m[1]).at(-1);
  assert.ok(inline, "inline preview client is rendered");
  new Function(inline); // Parse generated browser JavaScript, do not execute.
  assert.match(inline, /modern\.password\(\{emailAddress:identifier,password\}\)/);
  assert.match(inline, /modern\.finalize/);
  assert.match(inline, /Clerk\.mountSignIn/);
  assert.match(inline, /doPasswordLogin/);
}
console.log("PASS: Isolated LiveBridge preview renders and its client-side JS parses.");
