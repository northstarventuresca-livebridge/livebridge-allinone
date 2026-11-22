// Recurring broadcast windows use wall-clock time in the broadcaster's IANA timezone.
// Resolve each occurrence independently so Sunday hours remain stable across DST.
const formatters=new Map();
function localParts(epoch,timeZone){
  let formatter=formatters.get(timeZone);
  if(!formatter){
    formatter=new Intl.DateTimeFormat("en-US",{
      timeZone,year:"numeric",month:"2-digit",day:"2-digit",
      hour:"2-digit",minute:"2-digit",hourCycle:"h23"
    });
    formatters.set(timeZone,formatter);
  }
  const parts=Object.fromEntries(formatter.formatToParts(new Date(epoch))
    .filter(x=>x.type!=="literal").map(x=>[x.type,Number(x.value)]));
  return {year:parts.year,month:parts.month,day:parts.day,hour:parts.hour,minute:parts.minute};
}
export function isValidTimeZone(value){
  if(typeof value!=="string"||value.length>80)return false;
  try{new Intl.DateTimeFormat("en-US",{timeZone:value});return true}catch{return false}
}
function wallTimeToEpoch(year,month,day,hour,minute,timeZone){
  const expected=Date.UTC(year,month-1,day,hour,minute);
  let guess=expected;
  for(let i=0;i<5;i++){
    const p=localParts(guess,timeZone);
    const observed=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute);
    const shift=expected-observed;
    if(shift===0)return guess;
    guess+=shift;
  }
  // A DST spring-forward gap is not a valid local service time.
  return null;
}
export function nextWeeklyWindow(slot,afterMs=Date.now()){
  const zone=slot.timeZone||"America/Edmonton";
  const weekday=Number(slot.weekday);
  const minute=Number(slot.startMinute);
  const duration=Number(slot.durationMinutes);
  if(!isValidTimeZone(zone)||!Number.isInteger(weekday)||weekday<0||weekday>6
    ||!Number.isInteger(minute)||minute<0||minute>=1440
    ||!Number.isInteger(duration)||duration<1||duration>720)return null;
  const p=localParts(afterMs,zone);
  const localMidnight=Date.UTC(p.year,p.month-1,p.day);
  for(let offset=0;offset<15;offset++){
    const day=new Date(localMidnight+offset*86400000);
    if(day.getUTCDay()!==weekday)continue;
    const startAt=wallTimeToEpoch(day.getUTCFullYear(),day.getUTCMonth()+1,
      day.getUTCDate(),Math.floor(minute/60),minute%60,zone);
    if(startAt!==null&&startAt>=afterMs)
      return {startAt,endAt:startAt+duration*60000};
  }
  return null;
}
export function weeklyOccurrenceNear(slot,now=Date.now()){
  return nextWeeklyWindow(slot,now-(Number(slot.durationMinutes)||0)*60000-1000);
}
export function windowsOverlap(a,b){
  return !!a&&!!b&&a.startAt<b.endAt&&a.endAt>b.startAt;
}
export function conflictsWithWeekly(existing,candidate,reference=Date.now()){
  // Probe next two calendar weeks to account for different timezones and DST.
  for(let day=0;day<15;day++){
    const at=reference+day*86400000;
    const a=nextWeeklyWindow(existing,at);
    const b=nextWeeklyWindow(candidate,at);
    if(a&&b&&windowsOverlap(a,b))return true;
    if(a){
      const bNear=nextWeeklyWindow(candidate,a.startAt-12*3600000);
      if(bNear&&windowsOverlap(a,bNear))return true;
    }
  }
  return false;
}
