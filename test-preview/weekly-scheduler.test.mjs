import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext, Script} from "node:vm";
import {nextWeeklyWindow,weeklyOccurrenceNear,windowsOverlap,conflictsWithWeekly,isValidTimeZone} from "../backend/weekly-schedule-utils.mjs";

const sunday930={weekday:0,startMinute:570,durationMinutes:75,timeZone:"America/Edmonton"};
const sunday1100={weekday:0,startMinute:660,durationMinutes:75,timeZone:"America/Edmonton"};
const sunday1000={weekday:0,startMinute:600,durationMinutes:60,timeZone:"America/Edmonton"};
const at=t=>Date.parse(t);
assert.equal(nextWeeklyWindow(sunday930,at("2026-11-22T12:00:00Z")).startAt,at("2026-11-22T16:30:00Z"));
assert.equal(nextWeeklyWindow(sunday930,at("2026-11-22T17:00:00Z")).startAt,at("2026-11-29T16:30:00Z"));
assert.equal(weeklyOccurrenceNear(sunday930,at("2026-11-22T17:00:00Z")).startAt,at("2026-11-22T16:30:00Z"));
assert.equal(nextWeeklyWindow(sunday930,at("2027-03-14T12:00:00Z")).startAt,at("2027-03-14T15:30:00Z"));
assert.equal(nextWeeklyWindow(sunday930,at("2027-11-07T12:00:00Z")).startAt,at("2027-11-07T16:30:00Z"));
assert.equal(conflictsWithWeekly(sunday930,sunday1100),false);
assert.equal(conflictsWithWeekly(sunday930,sunday1000),true);
assert.equal(isValidTimeZone("America/Edmonton"),true);
assert.equal(isValidTimeZone("invalid/timezone"),false);
const last=nextWeeklyWindow(sunday930,at("2026-11-22T14:00:00Z"));
const afterCompleted=nextWeeklyWindow(sunday930,last.startAt+60000);
assert.equal(afterCompleted.startAt,at("2026-11-29T16:30:00Z"),"Weekly alarms must advance to next Sunday");
assert.equal(windowsOverlap({startAt:100,endAt:200},{startAt:200,endAt:300}),false);

const backend=readFileSync(new URL("../backend/worker.js",import.meta.url),"utf8");
const frontend=readFileSync(new URL("../frontend/public/sunday/index.html",import.meta.url),"utf8");
for(const fragment of [
  "broadcast-weekly-schedules-v1","weeklyOccurrenceNear",
  "lastStopFor===window.startAt","scheduled_broadcaster_offline",
  "broadcast-scheduler-presence-v1","lastPreflight30For","lastPreflight5For"
])assert.ok(backend.includes(fragment),"Missing backend contract "+fragment);
for(const fragment of [
  'id="lbRepeatWeekly"','id="lbEnableSchedulerAlerts"',
  "getBroadcasterSessionToken(forceFresh=false)",
  "session.getToken({skipCache:true})",
  "lbReportHealthIssue","lbHeartbeatVerified",
  "lbScheduleResponseSet","lbHoldScreenWakeLock",
  "broadcaster page"
])assert.ok(frontend.includes(fragment),"Missing frontend contract "+fragment);
let parsed=0;
for(const script of frontend.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
  if(/\bsrc\s*=/.test(script[1])||!script[2].trim())continue;
  new Script(script[2]);parsed++;
}
assert.ok(parsed>=6);
console.log("PASS weekly schedules, overlap checks, DST, auth watchdog, and "+parsed+" inline scripts.");
