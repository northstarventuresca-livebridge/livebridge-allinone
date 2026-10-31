// LiveBridge independent-password broadcaster access: isolated PREVIEW ONLY.
const ALLOW="https://preview.livebridge.ca";
const json=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{"content-type":"application/json","cache-control":"no-store","access-control-allow-origin":ALLOW,"access-control-allow-headers":"Authorization, Content-Type","access-control-allow-methods":"GET, POST, DELETE, OPTIONS","vary":"Origin","x-content-type-options":"nosniff"}});
const bad=()=>json({error:"Invalid credentials or password login disabled."},401);
const hex=x=>Array.from(new Uint8Array(x),b=>b.toString(16).padStart(2,"0")).join("");
const toBytes=x=>new Uint8Array((x.match(/../g)||[]).map(s=>parseInt(s,16)));
const key=s=>String(s||"").trim().toLowerCase();
async function derive(password,salt){const k=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]);return hex(await crypto.subtle.deriveBits({name:"PBKDF2",salt:toBytes(salt),iterations:600000,hash:"SHA-256"},k,256));}
function equal(a,b){if(a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0;}
async function auth(req,env){
 const h=req.headers.get("Authorization")||"";
 if(!h.startsWith("Bearer "))return null;
 const r=await env.PRODUCTION_API.fetch(new Request("https://livebridge.northstarventures-ca.workers.dev/account",{headers:{Authorization:h}}));
 if(!r.ok)return null;
 const a=await r.json().catch(()=>null);
 if(!a?.success||!a.account?.id)return null;
 const row=await env.ORG_DB.prepare("SELECT id,clerk_user_id,email,account_email,account_status FROM organizations WHERE id=?").bind(a.account.id).first();
 if(row?.account_status!=="active"||!row.clerk_user_id)return null;
 return row;
}
async function enabled(env,id){const x=await env.ORG_DB.prepare("SELECT enabled FROM organization_password_login WHERE organization_id=?").bind(id).first();return x?.enabled===1;}
async function hash(s){return hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)));}
async function limited(env,code,max){const now=Date.now(),until=now+900000;await env.LOGIN_DB.prepare("INSERT INTO broadcast_access_limits(bucket,attempts,reset_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN reset_at<=? THEN 1 ELSE attempts+1 END,reset_at=CASE WHEN reset_at<=? THEN ? ELSE reset_at END").bind(code,until,now,now,until).run();const row=await env.LOGIN_DB.prepare("SELECT attempts FROM broadcast_access_limits WHERE bucket=?").bind(code).first();return row.attempts<=max;}
async function issueTicket(env,sub){const r=await fetch("https://api.clerk.com/v1/sign_in_tokens",{method:"POST",headers:{"Authorization":"Bearer "+env.CLERK_PRODUCTION_SECRET_KEY,"Content-Type":"application/json"},body:JSON.stringify({user_id:sub,expires_in_seconds:60})});if(!r.ok)throw Error("Ticket unavailable");const a=await r.json();if(!a.token)throw Error("Ticket missing");return a.token;}
export default {async fetch(req,env){
 const path=new URL(req.url).pathname,method=req.method;
 if(req.headers.get("Origin")&&req.headers.get("Origin")!==ALLOW)return json({error:"Forbidden origin"},403);
 if(method==="OPTIONS")return new Response(null,{status:204,headers:{"access-control-allow-origin":ALLOW,"access-control-allow-headers":"Authorization, Content-Type","access-control-allow-methods":"GET, POST, DELETE, OPTIONS"}});
 if(path==="/health")return json({preview:true,ready:!!env.CLERK_PRODUCTION_SECRET_KEY});
 try{
  if(path==="/status"&&method==="GET"){
   const org=await auth(req,env);if(!org)return json({error:"Sign in using an email code first."},401);
   const login=key(org.account_email||org.email);
   const row=await env.LOGIN_DB.prepare("SELECT updated_at FROM broadcast_access_test WHERE login=? AND subject=? AND org_id=?").bind(login,org.clerk_user_id,org.id).first();
   return json({enabled:await enabled(env,org.id),enrolled:!!row,login,ready:!!env.CLERK_PRODUCTION_SECRET_KEY});
  }
  if(path==="/enroll"&&method==="POST"){
   const org=await auth(req,env);if(!org)return json({error:"Sign in with an email code first."},401);
   if(!(await enabled(env,org.id)))return json({error:"Your organization has not enabled password login."},403);
   if(!env.CLERK_PRODUCTION_SECRET_KEY)return json({error:"Preview password sign-in is not configured."},503);
   const body=await req.json(),password=String(body.password||""),login=key(org.account_email||org.email);
   if(password.length<15||password.length>128)return json({error:"Password needs 15 to 128 characters."},400);
   if(!login.includes("@")||login.length>254)return json({error:"Account email unavailable."},400);
   const salt=hex(crypto.getRandomValues(new Uint8Array(24))),verifier=await derive(password,salt);
   await env.LOGIN_DB.prepare("DELETE FROM broadcast_access_test WHERE subject=?").bind(org.clerk_user_id).run();
   await env.LOGIN_DB.prepare("INSERT INTO broadcast_access_test(login,subject,org_id,salt,verifier,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(login) DO UPDATE SET subject=excluded.subject,org_id=excluded.org_id,salt=excluded.salt,verifier=excluded.verifier,updated_at=excluded.updated_at").bind(login,org.clerk_user_id,org.id,salt,verifier,Date.now()).run();
   return json({success:true,enrolled:true,login});
  }
  if(path==="/enroll"&&method==="DELETE"){
   const org=await auth(req,env);if(!org)return json({error:"Sign in first."},401);
   await env.LOGIN_DB.prepare("DELETE FROM broadcast_access_test WHERE subject=? AND org_id=?").bind(org.clerk_user_id,org.id).run();
   return json({success:true,enrolled:false});
  }
  if(path==="/login"&&method==="POST"){
   if(!env.CLERK_PRODUCTION_SECRET_KEY)return json({error:"Preview password sign-in is not configured."},503);
   const body=await req.json(),login=key(body.email),pass=String(body.password||"");
   if(!login.includes("@")||login.length>254||!pass||pass.length>128)return bad();
   const ip=await hash(req.headers.get("CF-Connecting-IP")||"unknown");
   if(!(await limited(env,"i:"+ip,30))||!(await limited(env,"u:"+await hash(login),5)))return json({error:"Too many attempts; try again in 15 minutes."},429);
   const credential=await env.LOGIN_DB.prepare("SELECT subject,org_id,salt,verifier FROM broadcast_access_test WHERE login=?").bind(login).first();
   if(!credential){await derive(pass,"000000000000000000000000000000000000000000000000");return bad();}
   if(!equal(await derive(pass,credential.salt),credential.verifier))return bad();
   const org=await env.ORG_DB.prepare("SELECT id,clerk_user_id,account_status FROM organizations WHERE id=?").bind(credential.org_id).first();
   if(!org||org.clerk_user_id!==credential.subject||org.account_status!=="active"||!(await enabled(env,org.id)))return bad();
   return json({success:true,ticket:await issueTicket(env,org.clerk_user_id)});
  }
  return json({error:"Not found"},404);
 }catch(e){console.error("Broadcast credential request failed",e?.name||"error");return json({error:"Password sign-in is unavailable."},503);}
}};