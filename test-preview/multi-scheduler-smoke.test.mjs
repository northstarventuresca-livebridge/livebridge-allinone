import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const backend=readFileSync(new URL("../backend/worker.js",import.meta.url),"utf8");
const html=readFileSync(new URL("../frontend/public/sunday/index.html",import.meta.url),"utf8");
for(const part of [
  '/broadcast-schedules','/broadcast-schedules-remove',
  '/schedules-list','/schedules-add','/schedules-remove',
  'broadcast-schedules-v2','SCHEDULE_START_GRACE_MS',
  'stopHandled','alertChecked'
])assert.ok(backend.includes(part),`Missing backend scheduling contract: ${part}`);
for(const part of [
  'id="lbScheduledStart"','id="lbScheduledEnd"',
  'id="lbEnableSchedule"','id="lbScheduleList"',
  'id="lbScheduleDone"','id="lbSchedulerPickerOK"',
  'lbLoadSchedules','lbCheckBroadcastSchedule'
])assert.ok(html.includes(part),`Missing UI contract: ${part}`);
const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
let verified=0;
for(const part of scripts){
  if(/\bsrc\s*=/.test(part[1])||!part[2].trim())continue;
  new vm.Script(part[2],{filename:"sunday.html inline script "+verified});
  verified++;
}
assert.ok(verified>=1);
assert.match(html,/broadcasting&&lbStartedScheduledSlots.has\(item.id\)/,
  "Ending must not interrupt unrelated manually started broadcasts.");
console.log("Scheduler smoke PASS: "+verified+" scripts parse; API, UI and safety guards present.");
