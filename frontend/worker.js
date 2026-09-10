const REDIRECTS = new Map([
  ["/livebridge", "/"],
  ["/livebridge/", "/"],
  ["/livebridge-signup", "/signup/"],
  ["/livebridge-signup/", "/signup/"],
  ["/lbaccount", "/account/"],
  ["/lbaccount/", "/account/"],
  ["/lbadmin", "/admin/"],
  ["/lbadmin/", "/admin/"],
  ["/livebridge-sunday", "/sunday/"],
  ["/livebridge-sunday/", "/sunday/"],
  ["/translate", "/t/"],
  ["/translate/", "/t/"],
  ["/translate1", "/t/"],
  ["/translate1/", "/t/"],
  ["/translation1", "/t/"],
  ["/translation1/", "/t/"],
  ["/livebridge-privacy", "/privacy/"],
  ["/livebridge-privacy/", "/privacy/"],
  ["/livebridge-terms", "/terms/"],
  ["/livebridge-terms/", "/terms/"],
]);

const PAGES = new Map([
  ["/", "/index.html"],
  ["/account", "/account/index.html"],
  ["/account/", "/account/index.html"],
  ["/admin", "/admin/index.html"],
  ["/admin/", "/admin/index.html"],
  ["/signup", "/signup/index.html"],
  ["/signup/", "/signup/index.html"],
  ["/sunday", "/sunday/index.html"],
  ["/sunday/", "/sunday/index.html"],
  ["/t", "/t/index.html"],
  ["/t/", "/t/index.html"],
  ["/clientpitch", "/clientpitch/index.html"],
  ["/clientpitch/", "/clientpitch/index.html"],
  ["/live-stats", "/live-stats/index.html"],
  ["/live-stats/", "/live-stats/index.html"],
  ["/privacy", "/privacy/index.html"],
  ["/privacy/", "/privacy/index.html"],
  ["/terms", "/terms/index.html"],
  ["/terms/", "/terms/index.html"],
]);

function preserveQueryRedirect(requestUrl, targetPath) {
  const source = new URL(requestUrl);
  const target = new URL(targetPath, source.origin);
  target.search = source.search;
  return Response.redirect(target.toString(), 301);
}

async function fetchExactAsset(request, env, assetPath) {
  const assetUrl = new URL(request.url);
  assetUrl.pathname = assetPath;
  return env.ASSETS.fetch(new Request(assetUrl.toString(), request));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    const redirectTarget = REDIRECTS.get(path);
    if (redirectTarget) {
      return preserveQueryRedirect(request.url, redirectTarget);
    }

    const assetPath = PAGES.get(path);
    if (assetPath) {
      return fetchExactAsset(request, env, assetPath);
    }

    // Allow exact static files if any are added later.
    const direct = await env.ASSETS.fetch(request);
    if (direct.status !== 404) return direct;

    const notFound = await fetchExactAsset(request, env, "/404.html");
    return new Response(notFound.body, {
      status: 404,
      headers: notFound.headers,
    });
  },
};
