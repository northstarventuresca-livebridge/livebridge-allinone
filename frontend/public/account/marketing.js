
(function(){
  "use strict";

  var state = {
    loaded:false,
    profile:null,
    supportedLanguages:{},
    campaigns:[],
    analysis:null,
    currentCampaign:null,
    graphics:[]
  };

  function esc(value){
    return String(value == null ? "" : value)
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&#039;");
  }

  function installStyles(){
    if(document.getElementById("lbMarketingStyles")) return;
    var style=document.createElement("style");
    style.id="lbMarketingStyles";
    style.textContent=[
      ".lbm-stack{display:grid;gap:16px}",
      ".lbm-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}",
      ".lbm-field{display:grid;gap:6px}",
      ".lbm-field.full{grid-column:1/-1}",
      ".lbm-field label{font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.05em;color:#8fa6bf}",
      ".lbm-field input,.lbm-field textarea,.lbm-field select{width:100%;box-sizing:border-box;background:#0b1726;color:#fff;border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:11px 12px;font:inherit;outline:none}",
      ".lbm-field textarea{min-height:90px;resize:vertical}",
      ".lbm-field input:focus,.lbm-field textarea:focus,.lbm-field select:focus{border-color:rgba(45,151,255,.6);box-shadow:0 0 0 3px rgba(45,151,255,.08)}",
      ".lbm-colors{display:grid;grid-template-columns:1fr 1fr;gap:10px}",
      ".lbm-color-row{display:flex;gap:8px;align-items:center}",
      ".lbm-color-row input[type=color]{width:48px;height:42px;padding:2px;flex:0 0 auto}",
      ".lbm-actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:14px}",
      ".lbm-primary,.lbm-secondary{border:0;border-radius:10px;padding:11px 15px;font-weight:900;cursor:pointer;font-family:inherit}",
      ".lbm-primary{background:linear-gradient(135deg,#2588ff,#6f43df);color:white}",
      ".lbm-secondary{background:#16283d;color:#dbe8f5;border:1px solid rgba(255,255,255,.12)}",
      ".lbm-primary:disabled,.lbm-secondary:disabled{opacity:.55;cursor:default}",
      ".lbm-status{font-size:12px;color:#8fa6bf}",
      ".lbm-status.good{color:#63e7a1}",
      ".lbm-status.bad{color:#ff8c8c}",
      ".lbm-language-list{display:grid;gap:9px;margin-top:14px}",
      ".lbm-language{display:grid;grid-template-columns:42px 1fr auto;gap:12px;align-items:center;padding:12px;border-radius:12px;background:#0b1726;border:1px solid rgba(255,255,255,.08)}",
      ".lbm-rank{width:36px;height:36px;border-radius:999px;background:rgba(45,151,255,.12);display:grid;place-items:center;font-weight:900;color:#78b7ff}",
      ".lbm-language-name{font-weight:900;color:#eef6ff}",
      ".lbm-language-meta{font-size:11px;color:#8fa6bf;margin-top:3px;line-height:1.45}",
      ".lbm-language-why{font-size:12px;color:#b8c9da;margin-top:5px;line-height:1.45}",
      ".lbm-pill{font-size:10px;font-weight:900;border-radius:999px;padding:5px 8px;white-space:nowrap}",
      ".lbm-pill.yes{background:rgba(52,212,189,.10);color:#72ead4;border:1px solid rgba(52,212,189,.24)}",
      ".lbm-pill.no{background:rgba(255,190,82,.08);color:#ffd978;border:1px solid rgba(255,190,82,.20)}",
      ".lbm-sources{margin-top:6px;font-size:10px}",
      ".lbm-sources a{color:#78b7ff;text-decoration:none;margin-right:8px}",
      ".lbm-summary{padding:12px 14px;border-radius:11px;background:rgba(45,151,255,.06);border:1px solid rgba(45,151,255,.14);color:#b9cde0;font-size:12px;line-height:1.55;margin-top:12px}",
      ".lbm-campaign-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:15px}",
      ".lbm-graphic-card{background:#0b1726;border:1px solid rgba(255,255,255,.09);border-radius:14px;padding:12px;min-width:0}",
      ".lbm-graphic-title{font-weight:900;font-size:13px;margin-bottom:8px}",
      ".lbm-graphic-card img{width:100%;height:auto;display:block;border-radius:9px;background:#06101c}",
      ".lbm-download{width:100%;margin-top:9px}",
      ".lbm-saved{display:grid;gap:8px;margin-top:12px}",
      ".lbm-saved-item{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:11px 12px;background:#0b1726;border:1px solid rgba(255,255,255,.08);border-radius:10px;cursor:pointer}",
      ".lbm-saved-item:hover{border-color:rgba(45,151,255,.35)}",
      ".lbm-saved-name{font-weight:900;font-size:12px}",
      ".lbm-saved-meta{font-size:10px;color:#8399af;margin-top:3px}",
      "@media(max-width:900px){.lbm-campaign-grid{grid-template-columns:1fr}.lbm-grid{grid-template-columns:1fr}.lbm-field.full{grid-column:auto}}"
    ].join("\n");
    document.head.appendChild(style);
  }

  function root(){
    return document.getElementById("lbMarketingRoot");
  }

  function renderShell(){
    var el=root();
    if(!el) return;
    el.innerHTML=[
      '<div class="lbm-stack">',
        '<div class="lb-card">',
          '<div class="lb-card-title">Organization Marketing Profile</div>',
          '<div class="lb-muted" style="margin-top:6px;line-height:1.5">LiveBridge uses this information to research your local language communities and create branded outreach campaigns.</div>',
          '<div class="lbm-grid" style="margin-top:16px">',
            '<div class="lbm-field"><label>Website</label><input id="lbmWebsite" type="url" placeholder="https://yourchurch.ca"></div>',
            '<div class="lbm-field"><label>Logo URL</label><input id="lbmLogo" type="url" placeholder="https://.../logo.png"></div>',
            '<div class="lbm-field full"><label>Street Address</label><input id="lbmAddress" type="text" placeholder="123 Main Street"></div>',
            '<div class="lbm-field"><label>City</label><input id="lbmCity" type="text" placeholder="Spruce Grove"></div>',
            '<div class="lbm-field"><label>Province / Region</label><input id="lbmRegion" type="text" placeholder="Alberta"></div>',
            '<div class="lbm-field"><label>Country</label><input id="lbmCountry" type="text" value="Canada"></div>',
            '<div class="lbm-field"><label>Brand Colours</label><div class="lbm-colors"><div class="lbm-color-row"><input id="lbmPrimary" type="color" value="#2588ff"><span class="lb-muted">Primary</span></div><div class="lbm-color-row"><input id="lbmSecondary" type="color" value="#6f43df"><span class="lb-muted">Secondary</span></div></div></div>',
            '<div class="lbm-field full"><label>Service / Event Details</label><textarea id="lbmServiceDetails" placeholder="Example: Sundays at 9:30 AM and 11:00 AM. Everyone is welcome."></textarea></div>',
          '</div>',
          '<div class="lbm-actions"><button class="lbm-primary" id="lbmSaveProfile">Save Marketing Profile</button><span class="lbm-status" id="lbmProfileStatus"></span></div>',
        '</div>',

        '<div class="lb-card">',
          '<div class="lb-card-title">Local Language Opportunity</div>',
          '<div class="lb-muted" style="margin-top:6px;line-height:1.5">Research the strongest non-English language communities around your organization using current public demographic information.</div>',
          '<div class="lbm-actions"><button class="lbm-primary" id="lbmAnalyze">Analyze My Area</button><span class="lbm-status" id="lbmAnalyzeStatus"></span></div>',
          '<div id="lbmAnalysis"></div>',
        '</div>',

        '<div class="lb-card">',
          '<div class="lb-card-title">Generate Marketing Campaign</div>',
          '<div class="lb-muted" style="margin-top:6px;line-height:1.5">Choose a LiveBridge-supported language. We will create a printable community poster, an English social graphic, and a social graphic in the selected language.</div>',
          '<div class="lbm-grid" style="margin-top:15px">',
            '<div class="lbm-field"><label>Campaign Language</label><select id="lbmLanguage"></select></div>',
          '</div>',
          '<div class="lbm-actions"><button class="lbm-primary" id="lbmGenerate">Generate 3-Graphic Campaign</button><span class="lbm-status" id="lbmGenerateStatus"></span></div>',
          '<div id="lbmCampaign"></div>',
        '</div>',

        '<div class="lb-card">',
          '<div class="lb-card-title">Saved Campaigns</div>',
          '<div class="lb-muted" style="margin-top:6px">Open any previous campaign and download the graphics again.</div>',
          '<div class="lbm-saved" id="lbmSaved"></div>',
        '</div>',
      '</div>'
    ].join("");

    document.getElementById("lbmSaveProfile").addEventListener("click",saveProfile);
    document.getElementById("lbmAnalyze").addEventListener("click",analyzeArea);
    document.getElementById("lbmGenerate").addEventListener("click",generateCampaign);
  }

  async function sessionToken(){
    if(typeof window.getLiveBridgeSessionToken==="function"){
      return await window.getLiveBridgeSessionToken();
    }
    return null;
  }

  async function api(path,options){
    var token=await sessionToken();
    if(!token) throw new Error("Please sign in again.");
    var opts=options||{};
    opts.headers=Object.assign({},opts.headers||{},{
      "Authorization":"Bearer "+token
    });
    if(opts.body && !opts.headers["Content-Type"]){
      opts.headers["Content-Type"]="application/json";
    }
    var response=await fetch(
      (window.LB_WORKER || "https://livebridge.northstarventures-ca.workers.dev")+path,
      opts
    );
    var data=await response.json();
    if(!response.ok || data.success===false){
      throw new Error(data.error || "LiveBridge request failed.");
    }
    return data;
  }

  function fillProfile(profile){
    state.profile=profile||{};
    document.getElementById("lbmWebsite").value=state.profile.websiteUrl||"";
    document.getElementById("lbmLogo").value=state.profile.logoUrl||"";
    document.getElementById("lbmAddress").value=state.profile.address||"";
    document.getElementById("lbmCity").value=state.profile.city||"";
    document.getElementById("lbmRegion").value=state.profile.region||"";
    document.getElementById("lbmCountry").value=state.profile.country||"Canada";
    document.getElementById("lbmPrimary").value=state.profile.primaryColor||"#2588ff";
    document.getElementById("lbmSecondary").value=state.profile.secondaryColor||"#6f43df";
    document.getElementById("lbmServiceDetails").value=state.profile.serviceDetails||"";
    state.analysis=state.profile.analysis||null;
  }

  function profilePayload(){
    return {
      websiteUrl:document.getElementById("lbmWebsite").value.trim(),
      logoUrl:document.getElementById("lbmLogo").value.trim(),
      address:document.getElementById("lbmAddress").value.trim(),
      city:document.getElementById("lbmCity").value.trim(),
      region:document.getElementById("lbmRegion").value.trim(),
      country:document.getElementById("lbmCountry").value.trim(),
      primaryColor:document.getElementById("lbmPrimary").value,
      secondaryColor:document.getElementById("lbmSecondary").value,
      serviceDetails:document.getElementById("lbmServiceDetails").value.trim()
    };
  }

  function setStatus(id,message,type){
    var el=document.getElementById(id);
    if(!el) return;
    el.textContent=message||"";
    el.className="lbm-status"+(type ? " "+type : "");
  }

  async function persistProfile(){
    var data=await api("/marketing/profile",{
      method:"POST",
      body:JSON.stringify(profilePayload())
    });
    fillProfile(data.profile);
    return data.profile;
  }

  async function saveProfile(){
    var button=document.getElementById("lbmSaveProfile");
    button.disabled=true;
    setStatus("lbmProfileStatus","Saving...","");
    try{
      await persistProfile();
      setStatus("lbmProfileStatus","✓ Saved","good");
    }catch(error){
      setStatus("lbmProfileStatus",error.message,"bad");
    }finally{
      button.disabled=false;
    }
  }

  function renderLanguageSelect(){
    var select=document.getElementById("lbmLanguage");
    if(!select) return;
    var preferred="";
    if(state.analysis && Array.isArray(state.analysis.languages)){
      var first=state.analysis.languages.find(function(item){return item.supportedByLiveBridge;});
      if(first) preferred=first.code;
    }
    select.innerHTML=Object.keys(state.supportedLanguages||{}).map(function(code){
      var name=state.supportedLanguages[code];
      return '<option value="'+esc(code)+'">'+esc(name)+'</option>';
    }).join("");
    if(preferred && state.supportedLanguages[preferred]){
      select.value=preferred;
    }
  }

  function renderAnalysis(){
    var box=document.getElementById("lbmAnalysis");
    if(!box) return;
    var analysis=state.analysis;
    if(!analysis || !Array.isArray(analysis.languages) || !analysis.languages.length){
      box.innerHTML="";
      return;
    }

    var verifiedSources=(analysis.sources||[]).map(function(source){
      return '<a href="'+esc(source.url)+'" target="_blank" rel="noopener">'+esc(source.title||"Source")+'</a>';
    }).join(" ");

    var summary='<div class="lbm-summary"><strong>Area summary:</strong> '+esc(analysis.areaSummary||"")+
      (analysis.methodology ? '<br><strong>Measurement:</strong> '+esc(analysis.methodology) : '')+
      (verifiedSources ? '<br><strong>Research sources:</strong> <span class="lbm-sources">'+verifiedSources+'</span>' : '')+
      '</div>';

    var rows=analysis.languages.map(function(item,index){
      var supported=item.supportedByLiveBridge===true;
      var sourceHtml=(item.sources||[]).map(function(source){
        return '<a href="'+esc(source.url)+'" target="_blank" rel="noopener">'+esc(source.title||"Source")+'</a>';
      }).join("");
      return [
        '<div class="lbm-language" data-language-code="'+esc(item.code)+'" data-supported="'+(supported?"1":"0")+'">',
          '<div class="lbm-rank">'+(index+1)+'</div>',
          '<div>',
            '<div class="lbm-language-name">'+esc(item.language)+'</div>',
            '<div class="lbm-language-meta">'+esc(item.estimatedPeople||"Not reported")+
              (item.estimatedShare ? ' · '+esc(item.estimatedShare) : '')+'</div>',
            '<div class="lbm-language-why">'+esc(item.why||"")+'</div>',
            sourceHtml ? '<div class="lbm-sources">'+sourceHtml+'</div>' : '',
          '</div>',
          '<div class="lbm-pill '+(supported?"yes":"no")+'">'+(supported?"LiveBridge ready":"Not on listener list")+'</div>',
        '</div>'
      ].join("");
    }).join("");

    box.innerHTML=summary+'<div class="lbm-language-list">'+rows+'</div>';

    box.querySelectorAll(".lbm-language[data-supported='1']").forEach(function(row){
      row.style.cursor="pointer";
      row.addEventListener("click",function(){
        var select=document.getElementById("lbmLanguage");
        if(select && state.supportedLanguages[row.dataset.languageCode]){
          select.value=row.dataset.languageCode;
          document.getElementById("lbmGenerate").scrollIntoView({behavior:"smooth",block:"center"});
        }
      });
    });

    renderLanguageSelect();
  }

  async function analyzeArea(){
    var button=document.getElementById("lbmAnalyze");
    button.disabled=true;
    setStatus("lbmAnalyzeStatus","Researching current local language data...","");
    try{
      await persistProfile();
      var data=await api("/marketing/analyze",{method:"POST",body:"{}"});
      state.analysis=data.analysis;
      if(state.profile) state.profile.analysis=data.analysis;
      renderAnalysis();
      setStatus("lbmAnalyzeStatus","✓ Analysis complete","good");
    }catch(error){
      setStatus("lbmAnalyzeStatus",error.message,"bad");
    }finally{
      button.disabled=false;
    }
  }

  function renderSaved(){
    var box=document.getElementById("lbmSaved");
    if(!box) return;
    if(!state.campaigns.length){
      box.innerHTML='<div class="lb-muted">No saved campaigns yet.</div>';
      return;
    }
    box.innerHTML=state.campaigns.map(function(campaign,index){
      var date=campaign.createdAt ? new Date(campaign.createdAt).toLocaleDateString() : "";
      return [
        '<div class="lbm-saved-item" data-index="'+index+'">',
          '<div><div class="lbm-saved-name">'+esc(campaign.campaignName||campaign.languageName+" Campaign")+'</div>',
          '<div class="lbm-saved-meta">'+esc(campaign.languageName||"")+(date ? " · "+esc(date) : "")+'</div></div>',
          '<div style="color:#78b7ff;font-weight:900">Open →</div>',
        '</div>'
      ].join("");
    }).join("");
    box.querySelectorAll(".lbm-saved-item").forEach(function(item){
      item.addEventListener("click",function(){
        var campaign=state.campaigns[Number(item.dataset.index)];
        if(campaign) showCampaign(campaign);
      });
    });
  }

  async function generateCampaign(){
    var button=document.getElementById("lbmGenerate");
    var language=document.getElementById("lbmLanguage").value;
    if(!language) return;
    button.disabled=true;
    setStatus("lbmGenerateStatus","Creating campaign copy and graphics...","");
    try{
      await persistProfile();
      var data=await api("/marketing/generate",{
        method:"POST",
        body:JSON.stringify({languageCode:language})
      });
      state.currentCampaign=data.campaign;
      state.campaigns.unshift(data.campaign);
      renderSaved();
      await showCampaign(data.campaign);
      setStatus("lbmGenerateStatus","✓ Campaign generated and saved","good");
    }catch(error){
      setStatus("lbmGenerateStatus",error.message,"bad");
    }finally{
      button.disabled=false;
    }
  }

  function wrapLines(ctx,text,maxWidth){
    var raw=String(text||"").trim();
    if(!raw) return [];
    var hasSpaces=/\s/.test(raw);
    var parts=hasSpaces ? raw.split(/\s+/) : Array.from(raw);
    var joiner=hasSpaces ? " " : "";
    var lines=[];
    var line="";
    parts.forEach(function(part){
      var test=line ? line+joiner+part : part;
      if(line && ctx.measureText(test).width>maxWidth){
        lines.push(line);
        line=part;
      }else{
        line=test;
      }
    });
    if(line) lines.push(line);
    return lines;
  }

  function drawWrapped(ctx,text,x,y,maxWidth,lineHeight,maxLines){
    var lines=wrapLines(ctx,text,maxWidth).slice(0,maxLines||99);
    lines.forEach(function(line,index){
      ctx.fillText(line,x,y+(index*lineHeight));
    });
    return y+(lines.length*lineHeight);
  }

  function loadImage(url){
    return new Promise(function(resolve){
      if(!url){ resolve(null); return; }
      var img=new Image();
      img.crossOrigin="anonymous";
      var finished=false;
      var done=function(value){
        if(finished) return;
        finished=true;
        resolve(value);
      };
      img.onload=function(){done(img);};
      img.onerror=function(){done(null);};
      setTimeout(function(){done(null);},4500);
      img.src=url;
    });
  }

  function listenerURL(campaign){
    var room=String(campaign.roomName||"").trim().toUpperCase();
    var lang=String(campaign.languageCode||"").trim().toLowerCase();
    return "https://livebridge.ca/t/?room="+encodeURIComponent(room)+"&lang="+encodeURIComponent(lang);
  }

  async function fetchMarketingBackground(campaign,kind){
    if(!campaign || !campaign.id) return null;

    try{
      var token=await sessionToken();
      if(!token) return null;

      var response=await fetch(
        (window.LB_WORKER || "https://livebridge.northstarventures-ca.workers.dev")+
        "/marketing/background?campaignId="+encodeURIComponent(campaign.id)+
        "&kind="+encodeURIComponent(kind),
        {
          method:"GET",
          cache:"no-store",
          headers:{
            "Authorization":"Bearer "+token
          }
        }
      );

      if(!response.ok){
        return null;
      }

      var blob=await response.blob();
      var objectUrl=URL.createObjectURL(blob);

      return await new Promise(function(resolve){
        var img=new Image();
        var finished=false;

        function done(value){
          if(finished) return;
          finished=true;

          if(!value){
            URL.revokeObjectURL(objectUrl);
          }else{
            value.__lbObjectUrl=objectUrl;
          }

          resolve(value);
        }

        img.onload=function(){done(img);};
        img.onerror=function(){done(null);};
        img.src=objectUrl;
      });
    }catch(error){
      console.warn("Marketing AI artwork unavailable:",error);
      return null;
    }
  }

  function drawImageCover(ctx,img,width,height){
    if(!img || !img.width || !img.height) return false;

    var scale=Math.max(
      width/img.width,
      height/img.height
    );

    var drawWidth=img.width*scale;
    var drawHeight=img.height*scale;
    var x=(width-drawWidth)/2;
    var y=(height-drawHeight)/2;

    ctx.drawImage(
      img,
      x,
      y,
      drawWidth,
      drawHeight
    );

    return true;
  }

  async function makeGraphic(campaign,block,kind,targetLanguage,backgroundImage){
    var print=kind==="print";
    var width=print ? 1275 : 1080;
    var height=print ? 1650 : 1080;
    var canvas=document.createElement("canvas");
    canvas.width=width;
    canvas.height=height;
    var ctx=canvas.getContext("2d");
    var primary=campaign.primaryColor||"#2588ff";
    var secondary=campaign.secondaryColor||"#6f43df";

    var hasAiBackground=drawImageCover(
      ctx,
      backgroundImage,
      width,
      height
    );

    if(hasAiBackground){
      var readability=ctx.createLinearGradient(0,0,width,height);
      readability.addColorStop(0,"rgba(3,10,18,.84)");
      readability.addColorStop(.56,"rgba(3,10,18,.58)");
      readability.addColorStop(1,"rgba(3,10,18,.76)");
      ctx.fillStyle=readability;
      ctx.fillRect(0,0,width,height);
    }else{
      var gradient=ctx.createLinearGradient(0,0,width,height);
      gradient.addColorStop(0,"#071321");
      gradient.addColorStop(.55,"#0a1d31");
      gradient.addColorStop(1,"#050b14");
      ctx.fillStyle=gradient;
      ctx.fillRect(0,0,width,height);
    }

    var glow=ctx.createRadialGradient(width*.85,height*.1,20,width*.85,height*.1,width*.7);
    glow.addColorStop(0,primary+"66");
    glow.addColorStop(1,primary+"00");
    ctx.fillStyle=glow;
    ctx.fillRect(0,0,width,height);

    ctx.fillStyle=secondary+"22";
    ctx.beginPath();
    ctx.arc(width*.1,height*.9,width*.38,0,Math.PI*2);
    ctx.fill();

    var pad=print ? 78 : 64;
    var isRtl=String(campaign.languageCode||"")==="he" && targetLanguage;
    ctx.direction=isRtl ? "rtl" : "ltr";
    ctx.textAlign=isRtl ? "right" : "left";
    var x=isRtl ? width-pad : pad;

    var logo=await loadImage(campaign.logoUrl);
    if(logo){
      var maxW=print ? 260 : 200;
      var maxH=print ? 115 : 90;
      var scale=Math.min(maxW/logo.width,maxH/logo.height,1);
      ctx.drawImage(logo,isRtl ? width-pad-(logo.width*scale) : pad,pad,logo.width*scale,logo.height*scale);
    }else{
      ctx.fillStyle="#ffffff";
      ctx.font=(print ? "900 34px" : "900 28px")+" Arial";
      ctx.fillText(String(campaign.organizationName||"LiveBridge"),x,pad+35);
    }

    ctx.fillStyle=primary;
    ctx.font=(print ? "900 24px" : "900 20px")+" Arial";
    ctx.fillText("LIVEBRIDGE · LIVE TRANSLATION",x,print ? 230 : 175);

    var y=print ? 345 : 270;
    ctx.fillStyle="#ffffff";
    ctx.font=(print ? "900 72px" : "900 58px")+" Arial";
    y=drawWrapped(ctx,block.headline,x,y,width-(pad*2),print ? 82 : 66,4);

    if(block.subheadline){
      y+=20;
      ctx.fillStyle=primary;
      ctx.font=(print ? "800 38px" : "800 30px")+" Arial";
      y=drawWrapped(ctx,block.subheadline,x,y,width-(pad*2),print ? 48 : 40,3);
    }

    y+=print ? 50 : 35;
    ctx.fillStyle="#d7e5f3";
    ctx.font=(print ? "500 31px" : "500 25px")+" Arial";
    y=drawWrapped(ctx,block.body,x,y,width-(pad*2),print ? 45 : 36,6);

    y+=print ? 48 : 34;
    var ctaWidth=Math.min(width-(pad*2),print ? 800 : 700);
    var ctaX=isRtl ? width-pad-ctaWidth : pad;
    ctx.fillStyle=primary;
    ctx.beginPath();
    if(ctx.roundRect){
      ctx.roundRect(ctaX,y-42,ctaWidth,print ? 98 : 82,20);
    }else{
      ctx.rect(ctaX,y-42,ctaWidth,print ? 98 : 82);
    }
    ctx.fill();
    ctx.fillStyle="#ffffff";
    ctx.font=(print ? "900 30px" : "900 25px")+" Arial";
    ctx.textAlign="center";
    ctx.fillText(block.cta||"Join us",ctaX+(ctaWidth/2),y+(print ? 17 : 12));

    var qrUrl="https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=8&data="+encodeURIComponent(listenerURL(campaign));
    var qr=await loadImage(qrUrl);
    var footerY=height-(print ? 300 : 210);

    ctx.direction="ltr";
    ctx.textAlign="left";
    if(qr){
      var qrSize=print ? 190 : 130;
      ctx.fillStyle="#ffffff";
      ctx.beginPath();
      if(ctx.roundRect){ctx.roundRect(pad,footerY,qrSize+24,qrSize+24,16);}else{ctx.rect(pad,footerY,qrSize+24,qrSize+24);}
      ctx.fill();
      ctx.drawImage(qr,pad+12,footerY+12,qrSize,qrSize);
    }

    var infoX=pad+(qr ? (print ? 250 : 180) : 0);
    ctx.fillStyle="#ffffff";
    ctx.font=(print ? "900 28px" : "900 22px")+" Arial";
    ctx.fillText(String(campaign.organizationName||""),infoX,footerY+38);
    ctx.fillStyle="#9db2c7";
    ctx.font=(print ? "600 22px" : "600 18px")+" Arial";

    var infoY=footerY+75;
    if(campaign.address){
      infoY=drawWrapped(ctx,campaign.address,infoX,infoY,width-infoX-pad,print ? 31 : 26,2);
    }
    if(campaign.websiteUrl){
      infoY+=8;
      drawWrapped(ctx,campaign.websiteUrl,infoX,infoY,width-infoX-pad,print ? 31 : 26,2);
    }

    ctx.fillStyle=primary;
    ctx.font=(print ? "800 20px" : "800 16px")+" Arial";
    ctx.fillText("Scan to follow the live message in "+String(campaign.languageName||"your language"),infoX,height-pad);

    if(
      backgroundImage &&
      backgroundImage.__lbObjectUrl
    ){
      URL.revokeObjectURL(
        backgroundImage.__lbObjectUrl
      );
    }

    return canvas;
  }

  async function showCampaign(campaign){
    state.currentCampaign=campaign;
    var box=document.getElementById("lbmCampaign");
    if(!box) return;
    box.innerHTML='<div class="lbm-summary"><strong>'+esc(campaign.campaignName||"Marketing Campaign")+'</strong> · '+esc(campaign.languageName||"")+'<br><span style="color:#8fa6bf">Creating AI artwork and applying your exact logo, wording and QR code.</span></div><div class="lbm-campaign-grid" id="lbmGraphics"><div class="lbm-graphic-card">Creating AI poster artwork...</div><div class="lbm-graphic-card">Creating AI English social artwork...</div><div class="lbm-graphic-card">Creating AI translated social artwork...</div></div>';

    var backgrounds=await Promise.all([
      fetchMarketingBackground(campaign,"print"),
      fetchMarketingBackground(campaign,"socialEnglish"),
      fetchMarketingBackground(campaign,"socialTarget")
    ]);

    var results=await Promise.all([
      makeGraphic(campaign,campaign.printTarget||{},"print",true,backgrounds[0]),
      makeGraphic(campaign,campaign.socialEnglish||{},"social",false,backgrounds[1]),
      makeGraphic(campaign,campaign.socialTarget||{},"social",true,backgrounds[2])
    ]);

    state.graphics=[
      {title:"Printable Community Poster",canvas:results[0],filename:"LiveBridge-"+(campaign.languageCode||"language")+"-poster.png"},
      {title:"English Social Graphic",canvas:results[1],filename:"LiveBridge-English-social.png"},
      {title:(campaign.languageName||"Translated")+" Social Graphic",canvas:results[2],filename:"LiveBridge-"+(campaign.languageCode||"language")+"-social.png"}
    ];

    document.getElementById("lbmGraphics").innerHTML=state.graphics.map(function(item,index){
      return [
        '<div class="lbm-graphic-card">',
          '<div class="lbm-graphic-title">'+esc(item.title)+'</div>',
          '<img src="'+item.canvas.toDataURL("image/png")+'" alt="'+esc(item.title)+'">',
          '<button class="lbm-secondary lbm-download" data-download="'+index+'">Download PNG</button>',
        '</div>'
      ].join("");
    }).join("");

    document.querySelectorAll("[data-download]").forEach(function(button){
      button.addEventListener("click",function(){
        var item=state.graphics[Number(button.dataset.download)];
        if(!item) return;
        var link=document.createElement("a");
        link.href=item.canvas.toDataURL("image/png");
        link.download=item.filename;
        link.click();
      });
    });

    box.scrollIntoView({behavior:"smooth",block:"start"});
  }

  async function loadMarketing(){
    if(state.loaded) return;
    state.loaded=true;
    renderShell();
    setStatus("lbmProfileStatus","Loading...","");
    try{
      var data=await api("/marketing/profile",{method:"GET"});
      state.supportedLanguages=data.supportedLanguages||{};
      state.campaigns=Array.isArray(data.campaigns)?data.campaigns:[];
      fillProfile(data.profile||{});
      renderLanguageSelect();
      renderAnalysis();
      renderSaved();
      setStatus("lbmProfileStatus","","");
    }catch(error){
      state.loaded=false;
      setStatus("lbmProfileStatus",error.message,"bad");
    }
  }

  function wire(){
    installStyles();
    var button=document.querySelector('.lb-nav-button[data-panel="marketing"]');
    if(button){
      button.addEventListener("click",function(){
        loadMarketing();
      });
    }
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",wire);
  }else{
    wire();
  }
})();
