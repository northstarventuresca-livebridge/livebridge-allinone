/* Password-access preview gateway: all identity checks delegated to the existing
   production Clerk-verified API. The password itself is NEVER handled here. */
const origin="https://preview.livebridge.ca";
const cors={
  "Access-Control-Allow-Origin":origin,
  "Access-Control-Allow-Methods":"GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":"Authorization, Content-Type",
  "Cache-Control":"no-store",
  "Vary":"Origin"
};
const json=(data,status=200)=>new Response(JSON.stringify(data),
 {status,headers:{"Content-Type":"application/json",...cors}});
async function identity(request,env,admin){
  const auth=request.headers.get("Authorization")||"";
  if (!auth.startsWith("Bearer ")) return null;
  const path=admin?"/admin/me":"/account";
  const result=await env.PRODUCTION_API.fetch(new Request(
    "https://livebridge.northstarventures-ca.workers.dev"+path,
    {method:"GET",headers:{"Authorization":auth}}
  ));
  if(!result.ok) return null;
  const obj=await result.json();
  if(!obj.success) return null;
  if(admin && !["super_admin","superadmin","admin","owner"].includes(
    String(obj.admin?.role||"").toLowerCase())) return null;
  return admin?obj.admin:obj.account;
}
async function ensureTable(env){
  await env.TRANSLATIONS_DB.prepare(`
    CREATE TABLE IF NOT EXISTS organization_password_login (
      organization_id INTEGER PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
      updated_at INTEGER NOT NULL,
      updated_by TEXT NOT NULL,
      FOREIGN KEY (organization_id) REFERENCES organizations(id)
    )
  `).run();
}
async function current(env,orgId){
  const row=await env.TRANSLATIONS_DB.prepare(
    "SELECT enabled FROM organization_password_login WHERE organization_id=?"
  ).bind(orgId).first();
  return row?.enabled===1;
}
export default {
  async fetch(request,env){
    const path=new URL(request.url).pathname;
    if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
    if(path==="/auth-preview/health")return json({success:true,staging:true,noProductionChanges:true});
    if(!["/admin/password-login","/account/password-login"].includes(path))
      return json({success:false,error:"Not found"},404);
    try{
      const isAdmin=path.startsWith("/admin");
      const principal=await identity(request,env,isAdmin);
      if(!principal)return json({success:false,error:"Not authorized"},403);
      await ensureTable(env);
      if(!isAdmin){
        if(request.method!=="GET")return json({success:false,error:"Method not allowed"},405);
        const orgId=Number(principal.id||0);
        if(!Number.isSafeInteger(orgId)||orgId<1)return json({success:false,error:"Account unavailable"},404);
        return json({success:true,enabled:await current(env,orgId)});
      }
      const url=new URL(request.url);
      const body=request.method==="POST"?await request.json():{};
      const orgId=Number(body.organizationId||url.searchParams.get("organizationId")||0);
      if(!Number.isSafeInteger(orgId)||orgId<1)return json({success:false,error:"Invalid organization"},400);
      const organization=await env.TRANSLATIONS_DB.prepare(
        "SELECT id FROM organizations WHERE id=?"
      ).bind(orgId).first();
      if(!organization)return json({success:false,error:"Organization not found"},404);
      if(request.method==="GET")return json({success:true,organizationId:orgId,enabled:await current(env,orgId)});
      if(request.method!=="POST"||typeof body.enabled!=="boolean")
        return json({success:false,error:"Invalid preference"},400);
      const now=Date.now();
      await env.TRANSLATIONS_DB.prepare(`
        INSERT INTO organization_password_login(organization_id,enabled,updated_at,updated_by)
        VALUES(?,?,?,?)
        ON CONFLICT(organization_id) DO UPDATE SET
          enabled=excluded.enabled,updated_at=excluded.updated_at,updated_by=excluded.updated_by
      `).bind(orgId,body.enabled?1:0,now,String(principal.clerkUserId||"admin")).run();
      return json({success:true,organizationId:orgId,enabled:body.enabled});
    }catch(error){
      console.error("Password access preview:",error?.message||error);
      return json({success:false,error:"Unable to process security preference"},500);
    }
  }
};