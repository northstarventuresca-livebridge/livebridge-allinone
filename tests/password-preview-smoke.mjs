import assert from "node:assert/strict";
import worker from "../test-preview/password-login-preview-worker.mjs";

for (const pathname of ["/login/", "/admin/"]) {
  const response = await worker.fetch(new Request("https://preview.example" + pathname), {});
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /clerk-js@6\/dist\/clerk\.browser\.js/);
  assert.match(html, /@clerk\/ui@1\/dist\/ui\.browser\.js/);
  assert.match(html, /data-clerk-publishable-key/);
  const inline = [...html.matchAll(/<script>([^]*?)<\/script>/g)].map(m => m[1]).at(-1);
  assert.ok(inline, "inline preview client is rendered");
  new Function(inline); // Parse generated browser JavaScript, do not execute.
  assert.match(inline, /Clerk\.load\(\{ui:\{ClerkUI:window\.__internal_ClerkUICtor\}\}\)/);
  assert.match(inline, /modern\.password\(\{emailAddress:identifier,password\}\)/);
  assert.match(inline, /Clerk\.signIn\.finalize/);
  assert.match(inline, /Clerk\.mountSignIn/);
  assert.match(inline, /doPasswordLogin/);
  assert.match(inline, /if\(field\)field\.value/);
  assert.match(inline, /legacy\.create\(\{identifier,password\}\)/);
  assert.match(inline, /needs_second_factor/);
}
console.log("PASS: Isolated LiveBridge preview renders and its client-side JS parses.");
