
const LIVE="https://livebridge.northstarventures-ca.workers.dev";
const CLERK="https://clerk.livebridge.ca/npm/@clerk/clerk-js@latest/dist/clerk.browser.js";
const KEY="pk_live_Y2xlcmsubGl2ZWJyaWRnZS5jYSQ";
function reply(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json","cache-control":"no-store"}})}
async function upstream(path,token){return fetch(LIVE+path,{method:"GET",headers:{Authorization:"Bearer "+token},cf:{cacheTtl:0}})}
async function authAdmin(token){const r=await upstream("/admin/admin-candidates",token);if(!r.ok)throw new Error("Administrator access required");const v=await r.json();return v.candidates||[]}
async function authAccount(token){const r=await upstream("/account",token);if(!r.ok)throw new Error("Valid LiveBridge account required");let raw=token.split(".")[1];if(!raw)throw new Error("Invalid token");let json=JSON.parse(atob(raw.replace(/-/g,"+").replace(/_/g,"/")));if(!json.sub)throw new Error("Missing account identity");return json.sub}
const css=String.raw\`body{background:#07111f;color:#eaf3ff;font:15px Arial;margin:0}main{max-width:1000px;margin:34px auto;padding:24px}h1{font-size:32px}p,small{color:#adbed5}button,input{font:inherit;padding:12px;border-radius:9px}button{cursor:pointer;background:#2487e1;border:0;color:white}button:disabled{opacity:.5}.panel{background:#13263e;border:1px solid #344d70;border-radius:18px;padding:24px;margin:18px 0}.row{display:flex;justify-content:space-between;align-items:center;border-top:1px solid #31465f;padding:16px 0;gap:12px;flex-wrap:wrap}input{background:#fafafa;color:#111;border:0;width:min(90%,350px);margin:5px 0}label{display:block;margin:14px 0}a{color:#9cd3ff}.tag{background:#473173;padding:12px 18px;font-weight:800;text-align:center}.error{color:#ffbcbc}.ok{color:#8af5c8}\`;
function page(kind){const admin=kind==="admin";return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LiveBridge password login test</title><style>'+css+'</style></head><body><div class="tag">ISOLATED TEST PREVIEW — LIVE SITE UNCHANGED</div><main><h1>LiveBridge · '+(admin?'Admin password access':'Password login test')+'</h1><p>'+(admin?'Enable password login for an account in the isolated test environment.':'Test signing in with a password instead of an email code.')+'</p><p><a href="/admin/">Admin</a> &nbsp; <a href="/login/">Password Login Test</a></p><div id="login" class="panel"></div><div id="content" class="panel" style="display:none"></div><p id="message" role="status"></p></main><script async crossorigin="anonymous" data-clerk-publishable-key="'+KEY+'" src="'+CLERK+'"></script><script>'+client(admin)+'</script></body></html>'}
function client(admin){return String.raw\`
const root=document.getElementById('login'),panel=document.getElementById('content'),msg=document.getElementById('message');
function say(s,err=false){msg.className=err?'error':'ok';msg.textContent=s}
async function token(){return await Clerk.session?.getToken()}
async function api(path,method='GET',payload){let t=await token();const r=await fetch('/api/'+path,{method,headers:{Authorization:'Bearer '+t,'content-type':'application/json'},body:payload?JSON.stringify(payload):undefined});const v=await r.json();if(!r.ok)throw new Error(v.error||'Request failed');return v}
function signout(){Clerk.signOut().then(()=>location.reload())}
async function afterSignIn(){
 root.innerHTML='<p>Signed in: '+String(Clerk.user?.primaryEmailAddress?.emailAddress||'')+'</p><button id="out">Sign out</button>';
 document.getElementById('out').onclick=signout;
 panel.style.display='block';
 if(\${admin}){
  const v=await api('accounts');
  panel.innerHTML='<h2>Account password preferences (test only)</h2><p>Only these test settings are changed. Production accounts are not modified here.</p><div id="accounts"></div>';
  const div=document.getElementById('accounts');
  for(const item of v.candidates){
   const row=document.createElement('div');row.className='row';
   const name=document.createElement('div');const b=document.createElement('strong');b.textContent=item.organizationName||item.accountHolder||'Account';const sub=document.createElement('small');sub.textContent=' '+(item.email||'');name.append(b,document.createElement('br'),sub);
   const btn=document.createElement('button');btn.textContent=item.passwordLoginEnabled?'Disable test password login':'Enable test password login';
   btn.onclick=async()=>{btn.disabled=true;try{const r=await api('toggle','POST',{clerkUserId:item.clerkUserId,enabled:!item.passwordLoginEnabled});item.passwordLoginEnabled=r.enabled;btn.textContent=r.enabled?'Disable test password login':'Enable test password login';say('Test setting saved.');}catch(e){say(e.message,true)}finally{btn.disabled=false}};
   row.append(name,btn);div.append(row);
  }
 }else{
  const v=await api('policy');panel.innerHTML='<h2>'+(v.enabled?'Password login enabled for this test account':'Email-code login default')+'</h2><p>Manage your Clerk password through the account security profile. Test access is separate from production preferences.</p><button id="manage">Manage password & security</button>';document.getElementById('manage').onclick=()=>Clerk.openUserProfile();
 }
}
async function init(){
 await Clerk.load();
 if(Clerk.isSignedIn){try{await afterSignIn()}catch(e){say(e.message,true)}return}
 if(\${admin}){Clerk.mountSignIn(root,{routing:'hash'});return}
 root.innerHTML='<h2>Test password sign-in</h2><form id="pw"><label>Email<br><input id="email" type="email" autocomplete="username" required></label><label>Password<br><input id="pass" type="password" autocomplete="current-password" required></label><button id="submit">Sign in with password</button></form><p>Need to set a password? <button id="standard" type="button">Sign in by email code first</button></p><div id="standardMount"></div>';
 document.getElementById('standard').onclick=()=>{document.getElementById('pw').style.display='none';Clerk.mountSignIn(document.getElementById('standardMount'),{routing:'hash'})};
 document.getElementById('pw').onsubmit=async e=>{e.preventDefault();const b=document.getElementById('submit');b.disabled=true;try{const v=await Clerk.client.signIn.create({strategy:'password',identifier:document.getElementById('email').value.trim(),password:document.getElementById('pass').value});if(v.status!=='complete'||!v.createdSessionId)throw new Error('Clerk requires an additional verification step. Use standard sign-in.');await Clerk.setActive({session:v.createdSessionId});const policy=await api('policy');if(!policy.enabled){await Clerk.signOut();throw new Error('Password sign-in is not enabled for this account in the test settings.')}say('Password sign-in successful.');await afterSignIn()}catch(err){say(err.errors?.[0]?.longMessage||err.message,true)}finally{b.disabled=false;document.getElementById('pass').value=''}};
}
window.addEventListener('load',()=>init().catch(e=>say(e.message,true)));
\`}
export default {async fetch(request,env){
 const url=new URL(request.url),path=url.pathname;
 if(!path.startsWith("/api/"))return new Response(page(path.startsWith("/login")?"login":"admin"),{headers:{"content-type":"text/html;charset=utf-8","cache-control":"no-store","x-robots-tag":"noindex"}});
 try{
  const header=request.headers.get("Authorization")||"";if(!header.startsWith("Bearer "))return reply({error:"Sign in required"},401);
  const token=header.slice(7);
  if(path==="/api/accounts"&&request.method==="GET"){
   const candidates=await authAdmin(token);
   const rows=await env.TEST_DB.prepare("SELECT clerk_user_id,enabled FROM password_login_test").all();
   const set=new Set((rows.results||[]).filter(r=>r.enabled===1).map(r=>r.clerk_user_id));
   return reply({candidates:candidates.map(c=>({...c,passwordLoginEnabled:set.has(c.clerkUserId)}))});
  }
  if(path==="/api/toggle"&&request.method==="POST"){
   const candidates=await authAdmin(token),body=await request.json();
   const userId=String(body.clerkUserId||"");if(!candidates.some(c=>c.clerkUserId===userId))return reply({error:"Account not found"},404);
   const enabled=body.enabled===true;
   await env.TEST_DB.prepare("INSERT INTO password_login_test(clerk_user_id,enabled,updated_at) VALUES(?,?,?) ON CONFLICT(clerk_user_id) DO UPDATE SET enabled=excluded.enabled,updated_at=excluded.updated_at").bind(userId,enabled?1:0,Date.now()).run();
   return reply({success:true,enabled});
  }
  if(path==="/api/policy"&&request.method==="GET"){
   const userId=await authAccount(token);
   const row=await env.TEST_DB.prepare("SELECT enabled FROM password_login_test WHERE clerk_user_id=?").bind(userId).first();
   return reply({enabled:row?.enabled===1});
  }
  return reply({error:"Not found"},404);
 }catch(e){return reply({error:e.message||"Test server error"},403)}
}};
