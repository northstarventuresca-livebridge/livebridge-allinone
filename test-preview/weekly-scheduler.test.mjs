import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext, Script} from "node:vm";
import {nextWeeklyWindow,weeklyOccurrenceNear,windowsOverlap,conflictsWithWeekly,isValidTimeZone} from "../backend/weekly-schedule-utils.mjs";

const sunday930={weekday:0,startMinute:570,durationMinutes:75,timeZone:"America/Edmonton"};
const sunday1100={weekday:0,startMinute:660,durationMinutes:75,timeZone:"America/Edmonton"};
const sunday1000={weekday:0,startMinute:600,durationMinutes:60,timeZone:"America/Edmonton"};
const at=t=>Date.parse(t);
const formatter=new Intl.DateTimeFormat("en-CA",{
  timeZone:"America/Edmonton",year:"numeric",month:"2-digit",day:"2-digit",
  hour:"2-digit",minute:"2-digit",hourCycle:"h23"
});
const localTime=epoch=>{
  const p=Object.fromEntries(formatter.formatToParts(new Date(epoch))
    .filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));
  return p.year+"-"+p.month+"-"+p.day+" "+p.hour+":"+p.minute;
};
// Assert wall-clock times, never a fixed UTC offset. IANA timezone rules can change.
const first=nextWeeklyWindow(sunday930,at("2026-11-22T12:00:00Z"));
assert.equal(localTime(first.startAt),"2026-11-22 09:30");
const next=nextWeeklyWindow(sunday930,first.startAt+60000);
assert.equal(localTime(next.startAt),"2026-11-29 09:30");
assert.equal(weeklyOccurrenceNear(sunday930,first.startAt+30*60000).startAt,first.startAt);
assert.equal(localTime(nextWeeklyWindow(sunday930,at("2027-03-14T12:00:00Z")).startAt),"2027-03-14 09:30");
assert.equal(localTime(nextWeeklyWindow(sunday930,at("2027-11-07T12:00:00Z")).startAt),"2027-11-07 09:30");
assert.equal(conflictsWithWeekly(sunday930,sunday1100),false);
assert.equal(conflictsWithWeekly(sunday930,sunday1000),true);
assert.equal(isValidTimeZone("America/Edmonton"),true);
assert.equal(isValidTimeZone("invalid/timezone"),false);
assert.equal(localTime(nextWeeklyWindow(sunday930,first.startAt+60000).startAt),"2026-11-29 09:30",
  "Weekly alarms must advance to next Sunday");
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
// Regression: the native 12-hour picker can select 12:30 AM after 11:25 AM.
// In that case, offer the precise PM correction without saving an unintended time.
const correctionStart=frontend.indexOf("function lbSuggestCorrectEnd(){");
const correctionStop=frontend.indexOf("function lbShowScheduleTimeIssue(",correctionStart);
assert.ok(correctionStart>=0&&correctionStop>correctionStart);
const correction=frontend.slice(correctionStart,correctionStop);
const correctionCase=(startValue,endValue)=>{
  const value=runInNewContext(correction+";lbSuggestCorrectEnd();",{
    lbScheduledStart:{value:startValue},lbScheduledEnd:{value:endValue}
  });
  return value&&{hour:value.getHours(),minute:value.getMinutes()};
};
assert.deepEqual(correctionCase("2026-11-22T11:25","2026-11-22T00:30"),{hour:12,minute:30});
assert.equal(correctionCase("2026-11-22T11:25","2026-11-22T12:30"),null);
assert.equal(correctionCase("2026-11-22T11:25","2026-11-22T09:00"),null);
for(const fragment of [
  'id="lbScheduleCorrectEnd"','id="lbScheduleInputError"',
  'id="lbScheduleTimezone"','/broadcast-schedules-edit',
  'lbValidateScheduleTime(true)','lbEditingScheduleId',
  'lbTimeZoneLabel(item.timeZone||lbBrowserTimezone)'
])assert.ok(frontend.includes(fragment),"Missing scheduler UX "+fragment);
assert.ok(backend.includes('url.pathname==="/schedules-edit"'));
assert.ok(backend.includes('url.pathname==="/broadcast-schedules-edit"'));
console.log("PASS native AM/PM validation regression, explicit timezone selection and safe weekly edit.");

console.log("PASS weekly schedules, overlap checks, DST, auth watchdog, and "+parsed+" inline scripts.");
