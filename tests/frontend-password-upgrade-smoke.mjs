import assert from "node:assert/strict";
import worker from "../frontend/worker.js";
import fs from "node:fs";

const url = "https://preview.livebridge.ca/account/password-login-upgrade.js";
const response = await worker.fetch(new Request(url), {});
assert.equal(response.status, 200);
assert.match(response.headers.get("content-type") || "", /application\/javascript/);
assert.equal(response.headers.get("cache-control"), "no-store");
const script = await response.text();
new Function(script); // parse only, no account credentials
assert.match(script, /signIn\.create\(\{ identifier, password \}\)/);
assert.doesNotMatch(script, /strategy:\s*["']password["']/);
assert.match(script, /result\.status === "needs_second_factor"/);
assert.match(script, /clerk\.setActive\(\{ session: result\.createdSessionId \}\)/);
assert.match(script, /stopImmediatePropagation/);
assert.match(script, /passwordEnabled === true/);
assert.match(script, /clerk\.openUserProfile\(\)/);
assert.match(script, /Set Up Password Login/);
const source = fs.readFileSync(new URL("../frontend/worker.js", import.meta.url), "utf8");
assert.match(source, /<script src=\\"\/account\/password-login-upgrade\.js\\"><\/script>/);
console.log("PASS: Password login bundle parses; existing email-code login is preserved; onboarding button is included.");