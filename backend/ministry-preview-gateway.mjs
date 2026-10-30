import {
  BETA_AGREEMENT_VERSION,
  ministryAdminRoute,
  saveMinistryOfferAssignment,
  recordBetaAcceptance,
  assignMinistryCampusFromOffer
} from "./ministry-partners.mjs";

const CORS = {
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Methods":"GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":"Content-Type, Authorization",
  "Cache-Control":"no-store"
};
const json=(data,status=200)=>new Response(JSON.stringify(data),{
  status,headers:{...CORS,"Content-Type":"application/json"}
});
async function prod(request, env, path) {
  const u = new URL(request.url);
  const url = "https://livebridge.northstarventures-ca.workers.dev" +
    (path || u.pathname + u.search);
  return env.PRODUCTION_API.fetch(new Request(url, request));
}
async function verifiedAdmin(request, env) {
  const response = await prod(request, env, "/admin/plans");
  if (!response.ok) throw new Error("Administrator access required.");
  return { clerkUserId:"verified-through-production", admin:{} };
}
export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    if (request.method==="OPTIONS") return new Response(null,{status:204,headers:CORS});
    if(url.pathname==="/ministry-preview-health")
      return json({success:true,preview:true,mode:"production-auth-real-d1"});

    if(url.pathname.startsWith("/admin/ministry-"))
      return ministryAdminRoute(request,env,req=>verifiedAdmin(req,env));

    if(url.pathname==="/admin/offer-create" && request.method==="POST") {
      const body=await request.clone().json();
      const check=await verifiedAdmin(request,env);
      const response=await prod(request,env);
      if(!response.ok) return response;
      const data=await response.json();
      if(data.success && data.offer?.token) {
        try {
          await saveMinistryOfferAssignment(env,data.offer.token,body);
        } catch(e) {
          return json({success:false,error:"Offer created, but campus assignment was not saved: "+e.message},409);
        }
        data.offerUrl="https://preview.livebridge.ca/offer/"+data.offer.token;
      }
      return json(data);
    }

    if(url.pathname==="/account-sync" && request.method==="POST") {
      const body=await request.clone().json();
      if(body.betaAgreementAccepted!==true ||
         body.betaAgreementVersion!==BETA_AGREEMENT_VERSION ||
         !Number(body.betaAgreementAcceptedAt)) {
        return json({success:false,error:"You must accept the current LiveBridge Beta Participation Agreement."},400);
      }
      // The production Worker validates Clerk identity, Stripe checkout and
      // membership; this preview never sees or copies production secrets.
      const response=await prod(request,env);
      if(!response.ok) return response;
      const data=await response.clone().json();
      if(!data.success || !data.account?.id || !data.account?.clerkUserId)
        return response;
      try {
        await recordBetaAcceptance(env,Number(data.account.id),
          data.account.clerkUserId,body,request);
        const token=String(body.previewOfferToken||"").trim();
        if(token) {
          const offer=await env.TRANSLATIONS_DB.prepare(
            "SELECT plan_code, redeemed_at FROM offers WHERE token = ?"
          ).bind(token).first();
          if(offer?.redeemed_at &&
             String(offer.plan_code)===String(data.account.planCode)) {
            await assignMinistryCampusFromOffer(env,token,Number(data.account.id));
          }
        }
      } catch(e) {
        return json({success:false,retryable:true,
          error:"Registration exists, but beta agreement or campus setup needs retry: "+e.message},503);
      }
      return json(data);
    }
    return prod(request,env);
  }
};