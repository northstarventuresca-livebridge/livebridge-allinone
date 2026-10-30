/* LiveBridge admin-only ministry organization and campus management. */
(function () {
  "use strict";
  const state = {parents:[],campuses:[],acceptances:[],loading:false};
  const $ = id => document.getElementById(id);
  const txt = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const money = cents => cents == null ? "Not set" : new Intl.NumberFormat("en-CA",{style:"currency",currency:"CAD"}).format(Number(cents)/100);
  const usd = cost => "$" + Number(cost || 0).toFixed(2) + " USD";
  const typeLabel = type => ({
    ministry_gift:"Ministry Gift (permanently complimentary)",
    founding_ministry_partner:"Founding Ministry Partner",
    standard_customer:"Standard Customer"
  }[type] || "Standard Customer");
  const typeOptions = value => [
    ["standard_customer","Standard Customer"],
    ["founding_ministry_partner","Founding Ministry Partner"],
    ["ministry_gift","Ministry Gift — no charge"]
  ].map(([v,label])=>`<option value="${v}" ${v===value?"selected":""}>${label}</option>`).join("");
  const parentOptions = selected =>
    '<option value="">Independent / No parent</option>' +
    state.parents.map(p=>`<option value="${p.id}" ${Number(p.id)===Number(selected)?"selected":""}>${txt(p.name)}</option>`).join("");

  function fillInviteParents() {
    const select = $("offerMinistryParent");
    if (!select) return;
    const old = select.value;
    select.innerHTML = parentOptions(old);
  }

  function renderOverview() {
    const target = $("ministryParentOverview");
    if (!target) return;
    const orgs = typeof adminOrganizations !== "undefined" ? adminOrganizations : [];
    const cards = state.parents.map(parent => {
      const campuses = state.campuses.filter(c=>Number(c.parent_id)===Number(parent.id));
      let minutes=0,broadcasts=0,listeners=0,cost=0;
      const children = campuses.map(c=>{
        const org = orgs.find(o=>Number(o.id)===Number(c.organization_id));
        minutes += Number(org?.usedMinutes||0);
        broadcasts += Number(org?.stats?.broadcastCount||0);
        listeners += Number(org?.stats?.listenerSessions||0);
        cost += Number(org?.stats?.apiCostUsd||0);
        return `<button type="button" class="lb-button secondary" style="font-size:11px;max-width:100%;white-space:normal" data-ministry-open="${Number(c.organization_id)}">${txt(c.campus_name||c.organization_name)} · ${txt(typeLabel(c.partnership_type))}</button>`;
      }).join("");
      return `<div style="background:#0d1b2a;border:1px solid #2b465f;border-radius:13px;padding:14px;min-width:240px;flex:1">
        <strong style="font-size:15px">${txt(parent.name)}</strong>
        <div style="color:#a0bcd0;font-size:11px;margin:6px 0 11px">
          ${campuses.length} campuses · ${(minutes/60).toFixed(1)} h used (current cycle) ·
          ${broadcasts} broadcasts · ${listeners} listener sessions · ${usd(cost)} estimated API costs this month
        </div><div style="display:flex;flex-wrap:wrap;gap:6px">${children || '<small style="color:#a6bed2">No campuses assigned yet.</small>'}</div>
      </div>`;
    }).join("");
    target.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px">
        <div><strong style="font-size:16px">Parent Organizations & Campuses</strong>
          <div style="color:#9eb4ca;font-size:11px;margin-top:3px">Combined reporting; each campus retains its own login, room, plan, and billing.</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <input id="ministryNewParentName" aria-label="New parent organization" placeholder="New parent organization" style="padding:8px;border-radius:8px;background:#0c1b29;color:white;border:1px solid #365774;max-width:210px">
          <button id="ministryCreateParent" class="lb-button green" type="button">+ Create Parent</button>
        </div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">${cards || '<div style="color:#9fb1c3">No parent organizations yet. Create one above to group campuses.</div>'}</div>
      <div id="ministryParentMessage" style="font-size:12px;margin-top:7px"></div>
    `;
    $("ministryCreateParent").addEventListener("click",createParent);
    target.querySelectorAll("[data-ministry-open]").forEach(b=>b.addEventListener("click",()=>openOrganization(Number(b.dataset.ministryOpen))));
  }

  function renderCampus(account) {
    if (!account) return;
    let target = $("ministryCampusEditor");
    if (!target) {
      const profile = $("orgProfileFields");
      if (!profile) return;
      target = document.createElement("section");
      target.id = "ministryCampusEditor";
      profile.insertAdjacentElement("afterend", target);
    }
    const c = state.campuses.find(row=>Number(row.organization_id)===Number(account.id)) || {};
    const acceptance = state.acceptances.find(row=>Number(row.organization_id)===Number(account.id));
    target.innerHTML = `
      <div class="lb-card-title" style="margin:12px 0">Ministry Relationship & Campus</div>
      <div style="color:#9db6cc;font-size:11px;margin-bottom:12px">Admin-only grouping and partner classification. Changing these fields does not change the Stripe subscription price or grant unlimited broadcast access.</div>
      <div class="lb-form-grid">
        <div class="lb-field"><label>Parent organization</label><select id="ministryEditParent">${parentOptions(c.parent_id)}</select></div>
        <div class="lb-field"><label>Campus name</label><input id="ministryEditCampus" maxlength="120" placeholder="Calgary Campus" value="${txt(c.campus_name||"")}"></div>
        <div class="lb-field"><label>Relationship</label><select id="ministryEditType">${typeOptions(c.partnership_type||"standard_customer")}</select></div>
        <div class="lb-field"><label>Partner discount (%)</label><input id="ministryEditDiscount" type="number" min="0" max="100" step="1" value="${Number(c.discount_percent||0)}"></div>
        <div class="lb-field"><label>Agreed monthly rate (CAD; optional)</label><input id="ministryEditMonthly" type="number" min="0" step=".01" placeholder="Plan-specific" value="${c.agreed_monthly_cents == null ? "" : Number(c.agreed_monthly_cents)/100}"></div>
        <div class="lb-field"><label>Pricing notes (internal)</label><textarea id="ministryEditNotes">${txt(c.pricing_notes||"")}</textarea></div>
      </div>
      <div style="display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin-top:8px">
        <button class="lb-button green" id="ministrySaveCampus" type="button">Save Campus & Partnership</button>
        <span style="color:#9bb4ce;font-size:11px">Beta agreement: ${acceptance ? "Accepted "+new Date(Number(acceptance.accepted_at)).toLocaleDateString("en-CA") : "No acceptance record on current version"}</span>
      </div>
      <div id="ministryCampusMessage" class="lb-message"></div>
    `;
    $("ministrySaveCampus").addEventListener("click",()=>saveCampus(account.id));
    $("ministryEditType").addEventListener("change",()=>{
      if ($("ministryEditType").value==="ministry_gift") {
        $("ministryEditDiscount").value="100"; $("ministryEditMonthly").value="0";
      }
    });
  }

  async function post(path,payload) {
    const response = await adminFetch(path,{method:"POST",body:JSON.stringify(payload)});
    const data = await response.json();
    if (!response.ok || !data.success) throw Error(data.error||"Could not save.");
    return data;
  }
  async function createParent(){
    const input=$("ministryNewParentName"), message=$("ministryParentMessage");
    const name=input.value.trim();
    if (!name) {input.focus();return;}
    try {await post("/admin/ministry-parent-save",{name});input.value="";await refresh();} 
    catch(error){message.textContent=error.message;message.style.color="#ff9a9a";}
  }
  async function saveCampus(organizationId) {
    const message=$("ministryCampusMessage"),button=$("ministrySaveCampus");
    button.disabled=true;
    try{
      const price=$("ministryEditMonthly").value.trim();
      await post("/admin/ministry-campus-save",{
        organizationId,
        parentId:$("ministryEditParent").value||null,
        campusName:$("ministryEditCampus").value.trim(),
        partnershipType:$("ministryEditType").value,
        discountPercent:Number($("ministryEditDiscount").value||0),
        agreedMonthlyCents:price===""?null:Math.round(Number(price)*100),
        pricingNotes:$("ministryEditNotes").value.trim()
      });
      message.textContent="✓ Campus and partnership saved.";
      message.className="lb-message good";
      await refresh();
    }catch(error){message.textContent=error.message;message.className="lb-message bad";}
    finally{button.disabled=false;}
  }
  async function refresh() {
    if (state.loading) return;
    state.loading=true;
    try{
      const res=await adminFetch("/admin/ministry-overview");
      const data=await res.json();
      if (!res.ok || !data.success) throw Error(data.error||"Cannot load ministry overview.");
      state.parents=data.parents||[];
      state.campuses=data.campuses||[];
      state.acceptances=data.acceptances||[];
      renderOverview();fillInviteParents();
      if (typeof selectedOrganization !== "undefined" && selectedOrganization) renderCampus(selectedOrganization);
    }catch(error){
      const target=$("ministryParentOverview");
      if(target)target.textContent="Ministry overview unavailable: "+error.message;
      console.error("Ministry admin:",error);
    }finally{state.loading=false;}
  }
  window.LiveBridgeMinistryAdmin={refresh,renderCampus,fillInviteParents};
})();
