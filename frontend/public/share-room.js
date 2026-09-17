/* LiveBridge unified room sharing v1
   Account + listener pages use the same language-gate URL and poster style as /sunday/.
*/
(() => {
  const LISTENER_GATE_BASE_URL = "https://livebridge.ca/t/";

  const TRANSLATIONS = {
    en:{title:"Listen Live",subtitle:"In Your Language",message:"We’re live now. Join our LiveBridge broadcast and listen in your own language.",room:"ROOM"},
    fr:{title:"Écoutez en direct",subtitle:"Dans votre langue",message:"Nous sommes en direct. Rejoignez notre diffusion LiveBridge et écoutez dans votre propre langue.",room:"SALLE"},
    es:{title:"Escucha en vivo",subtitle:"En tu idioma",message:"Estamos en vivo. Únase a nuestra transmisión de LiveBridge y escuche en su propio idioma.",room:"SALA"},
    de:{title:"Live zuhören",subtitle:"In Ihrer Sprache",message:"Wir sind jetzt live. Treten Sie unserer LiveBridge-Übertragung bei und hören Sie in Ihrer eigenen Sprache.",room:"RAUM"},
    pt:{title:"Ouça ao vivo",subtitle:"No seu idioma",message:"Estamos ao vivo. Entre na nossa transmissão LiveBridge e ouça no seu próprio idioma.",room:"SALA"},
    it:{title:"Ascolta dal vivo",subtitle:"Nella tua lingua",message:"Siamo in diretta. Partecipa alla nostra trasmissione LiveBridge e ascolta nella tua lingua.",room:"STANZA"},
    nl:{title:"Luister live",subtitle:"In uw eigen taal",message:"We zijn nu live. Doe mee met onze LiveBridge-uitzending en luister in uw eigen taal.",room:"KAMER"},
    pl:{title:"Słuchaj na żywo",subtitle:"W swoim języku",message:"Jesteśmy na żywo. Dołącz do transmisji LiveBridge i słuchaj w swoim języku.",room:"POKÓJ"},
    uk:{title:"Слухайте наживо",subtitle:"Своєю мовою",message:"Ми вже в ефірі. Приєднуйтесь до трансляції LiveBridge і слухайте своєю мовою.",room:"КІМНАТА"},
    ru:{title:"Слушайте в прямом эфире",subtitle:"На своем языке",message:"Мы уже в эфире. Присоединяйтесь к трансляции LiveBridge и слушайте на своем языке.",room:"КОМНАТА"},
    ar:{title:"استمع مباشرة",subtitle:"بلغتك",message:"نحن على الهواء الآن. انضم إلى بث LiveBridge واستمع بلغتك الخاصة.",room:"الغرفة"},
    zh:{title:"收听直播",subtitle:"使用您的语言",message:"我们正在直播。加入 LiveBridge 直播，用您自己的语言收听。",room:"房间"},
    yue:{title:"收聽直播",subtitle:"用你嘅語言",message:"我哋而家直播緊。加入 LiveBridge 直播，用你自己嘅語言收聽。",room:"房間"},
    ja:{title:"ライブで聴く",subtitle:"あなたの言語で",message:"現在ライブ配信中です。LiveBridgeに参加して、あなたの言語でお聴きください。",room:"ルーム"},
    ko:{title:"라이브로 듣기",subtitle:"내 언어로",message:"지금 라이브 중입니다. LiveBridge 방송에 참여해 자신의 언어로 들으세요.",room:"방"},
    hi:{title:"लाइव सुनें",subtitle:"अपनी भाषा में",message:"हम अभी लाइव हैं। हमारे LiveBridge प्रसारण से जुड़ें और अपनी भाषा में सुनें।",room:"रूम"},
    fil:{title:"Makinig nang Live",subtitle:"Sa Iyong Wika",message:"Live na kami. Sumali sa LiveBridge broadcast at makinig sa sarili mong wika.",room:"ROOM"},
    he:{title:"האזינו בשידור חי",subtitle:"בשפה שלכם",message:"אנחנו בשידור חי. הצטרפו לשידור LiveBridge והאזינו בשפה שלכם.",room:"חדר"},
    yo:{title:"Gbọ́ Ní Taara",subtitle:"Ní Èdè Rẹ",message:"A wa lori afefe bayii. Darapọ mọ LiveBridge ki o gbọ ni ede rẹ.",room:"YÀRÁ"},
    ig:{title:"Gee Ntị Ugbu A",subtitle:"N'Asụsụ Gị",message:"Anyị nọ ndụ ugbu a. Sonyere LiveBridge ma gee ntị n'asụsụ gị.",room:"ỤLỌ"},
    ha:{title:"Saurara Kai Tsaye",subtitle:"A Harshenku",message:"Muna kai tsaye yanzu. Shiga LiveBridge ka saurara a harshenka.",room:"DAKI"}
  };

  function normalizeLanguage(value) {
    const raw = String(value || "en").trim().toLowerCase();
    if (raw === "zh-cn") return "zh";
    return raw || "en";
  }

  function buildGateURL(room) {
    return (
      LISTENER_GATE_BASE_URL +
      "?room=" +
      encodeURIComponent(String(room || "").trim().toUpperCase())
    );
  }

  function wrapText(ctx, text, maxWidth) {
    const words = String(text || "").split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";

    for (const word of words) {
      const test = line ? line + " " + word : word;
      if (line && ctx.measureText(test).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }

    if (line) lines.push(line);
    return lines;
  }

  function fitLines(ctx, text, maxWidth, maxLines, startSize, minSize, weight = 900) {
    let size = startSize;
    let lines = [];

    while (size >= minSize) {
      ctx.font = `${weight} ${size}px Arial,Helvetica,sans-serif`;
      lines = wrapText(ctx, text, maxWidth);
      if (lines.length <= maxLines) break;
      size -= 4;
    }

    return { size, lines };
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
  }

  function drawBridgeMark(ctx, x, y, width) {
    ctx.save();
    ctx.lineCap = "round";

    const gradient = ctx.createLinearGradient(x, y, x + width, y + 70);
    gradient.addColorStop(0, "#61efff");
    gradient.addColorStop(1, "#1599ff");
    ctx.strokeStyle = gradient;

    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.arc(x + width * .46, y + 62, width * .42, Math.PI * 1.08, Math.PI * 1.82);
    ctx.stroke();

    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(x + 4, y + 70);
    ctx.bezierCurveTo(x + width * .28, y + 33, x + width * .64, y + 32, x + width, y + 70);
    ctx.stroke();

    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(x + width * .3, y + 67);
    ctx.lineTo(x + width * .3, y + 25);
    ctx.stroke();
    ctx.restore();
  }

  function drawPhoneIcon(ctx, cx, cy) {
    ctx.save();
    ctx.strokeStyle = "#e8f8ff";
    ctx.lineWidth = 5;
    roundedRect(ctx, cx - 20, cy - 31, 40, 62, 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy + 20, 2.8, 0, Math.PI * 2);
    ctx.fillStyle = "#e8f8ff";
    ctx.fill();
    ctx.restore();
  }

  function drawGlobeIcon(ctx, cx, cy) {
    ctx.save();
    ctx.strokeStyle = "#e8f8ff";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, 30, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx, cy, 14, 30, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 28, cy - 10);
    ctx.lineTo(cx + 28, cy - 10);
    ctx.moveTo(cx - 28, cy + 10);
    ctx.lineTo(cx + 28, cy + 10);
    ctx.stroke();
    ctx.restore();
  }

  function drawHeadphonesIcon(ctx, cx, cy) {
    ctx.save();
    ctx.strokeStyle = "#e8f8ff";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(cx, cy + 4, 29, Math.PI, 0);
    ctx.stroke();
    roundedRect(ctx, cx - 35, cy + 1, 12, 29, 5);
    ctx.stroke();
    roundedRect(ctx, cx + 23, cy + 1, 12, 29, 5);
    ctx.stroke();
    ctx.restore();
  }

  function drawStep(ctx, cx, cy, kind, labels) {
    ctx.save();
    const glow = ctx.createRadialGradient(cx, cy, 10, cx, cy, 70);
    glow.addColorStop(0, "rgba(65,229,255,.18)");
    glow.addColorStop(1, "rgba(65,229,255,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, 72, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#43e7ff";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, 58, 0, Math.PI * 2);
    ctx.stroke();

    if (kind === "phone") drawPhoneIcon(ctx, cx, cy);
    if (kind === "globe") drawGlobeIcon(ctx, cx, cy);
    if (kind === "headphones") drawHeadphonesIcon(ctx, cx, cy);

    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.font = "800 24px Arial,Helvetica,sans-serif";
    labels.forEach((line, index) => ctx.fillText(line, cx, cy + 95 + index * 28));
    ctx.restore();
  }

  function drawBackground(ctx, width, height) {
    const base = ctx.createLinearGradient(0, 0, width, height);
    base.addColorStop(0, "#071a3f");
    base.addColorStop(.5, "#0a3b73");
    base.addColorStop(1, "#061c46");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, width, height);

    const glow = ctx.createRadialGradient(width * .86, height * .12, 20, width * .86, height * .12, width * .48);
    glow.addColorStop(0, "rgba(25,221,255,.42)");
    glow.addColorStop(.48, "rgba(19,148,240,.18)");
    glow.addColorStop(1, "rgba(19,148,240,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.globalAlpha = .22;
    ctx.strokeStyle = "#61e7ff";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(1020, -40);
    ctx.bezierCurveTo(1300, 80, 1360, 300, 1660, 350);
    ctx.stroke();
    ctx.restore();

    const floor = ctx.createLinearGradient(0, 720, 0, height);
    floor.addColorStop(0, "rgba(5,19,54,0)");
    floor.addColorStop(1, "rgba(2,9,28,.72)");
    ctx.fillStyle = floor;
    ctx.fillRect(0, 700, width, height - 700);
  }

  async function makePoster({ room, organization, language }) {
    room = String(room || "").trim().toUpperCase() || "LIVE";
    const lang = normalizeLanguage(language);
    const t = TRANSLATIONS[lang] || TRANSLATIONS.en;
    const url = buildGateURL(room);

    const qr = new Image();
    qr.crossOrigin = "anonymous";
    qr.src =
      "https://api.qrserver.com/v1/create-qr-code/" +
      "?size=700x700&margin=8&data=" +
      encodeURIComponent(url);

    await new Promise((resolve, reject) => {
      qr.onload = resolve;
      qr.onerror = reject;
    });

    const canvas = document.createElement("canvas");
    canvas.width = 1600;
    canvas.height = 900;
    const ctx = canvas.getContext("2d");

    drawBackground(ctx, 1600, 900);
    drawBridgeMark(ctx, 286, 48, 245);

    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 76px Arial,Helvetica,sans-serif";
    ctx.fillText("Live", 72, 165);
    ctx.fillStyle = "#40dfff";
    ctx.fillText("Bridge", 220, 165);

    ctx.fillStyle = "rgba(220,239,255,.82)";
    ctx.font = "700 22px Arial,Helvetica,sans-serif";
    ctx.fillText(organization || "LiveBridge Organization", 74, 202);

    const leftWidth = 790;
    let y = 340;

    const titleFit = fitLines(ctx, t.title, leftWidth, 2, lang === "en" ? 112 : 78, 46, 900);
    ctx.fillStyle = "#ffffff";
    ctx.font = `900 ${titleFit.size}px Arial,Helvetica,sans-serif`;
    for (const line of titleFit.lines) {
      ctx.fillText(line, 68, y);
      y += titleFit.size + 8;
    }

    const subtitleFit = fitLines(ctx, t.subtitle, leftWidth, 2, lang === "en" ? 72 : 50, 32, 900);
    ctx.fillStyle = "#49e8ff";
    ctx.font = `900 ${subtitleFit.size}px Arial,Helvetica,sans-serif`;
    for (const line of subtitleFit.lines) {
      ctx.fillText(line, 70, y);
      y += subtitleFit.size + 8;
    }

    y += 12;
    const body = lang === "en"
      ? "Scan the QR code to hear today’s message in your preferred language."
      : t.message;

    ctx.fillStyle = "#ffffff";
    ctx.font = "600 34px Arial,Helvetica,sans-serif";
    wrapText(ctx, body, 720).slice(0, 3).forEach((line, index) => {
      ctx.fillText(line, 74, y + index * 44);
    });

    const qrX = 925;
    const qrY = 82;
    const qrW = 595;
    const qrH = 640;

    ctx.save();
    ctx.shadowColor = "rgba(69,230,255,.72)";
    ctx.shadowBlur = 42;
    ctx.fillStyle = "#ffffff";
    roundedRect(ctx, qrX, qrY, qrW, qrH, 34);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = "#ffffff";
    roundedRect(ctx, qrX, qrY, qrW, qrH, 34);
    ctx.fill();
    ctx.drawImage(qr, qrX + 45, qrY + 45, 505, 505);

    ctx.textAlign = "center";
    ctx.fillStyle = "#092654";
    ctx.font = "900 24px Arial,Helvetica,sans-serif";
    ctx.fillText("SCAN TO LISTEN LIVE", qrX + qrW / 2, qrY + 595);
    ctx.fillStyle = "rgba(23,83,128,.80)";
    ctx.font = "800 18px Arial,Helvetica,sans-serif";
    ctx.fillText(t.room + ": " + room, qrX + qrW / 2, qrY + 625);

    drawStep(ctx, 175, 715, "phone", ["Scan"]);
    drawStep(ctx, 455, 715, "globe", ["Choose Your", "Language"]);
    drawStep(ctx, 735, 715, "headphones", ["Listen Live"]);

    ctx.fillStyle = "#42e6ff";
    ctx.beginPath(); ctx.arc(315, 715, 7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(595, 715, 7, 0, Math.PI * 2); ctx.fill();

    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png", .96));

    return {
      canvas,
      blob,
      filename: "LiveBridge-" + room + "-" + lang + ".png",
      message:
        t.message +
        "\n\n" +
        (organization || "LiveBridge") +
        "\n" +
        t.room + ": " + room +
        "\n" +
        url,
      url
    };
  }

  async function shareGenerated(generated) {
    const file = new File([generated.blob], generated.filename, { type:"image/png" });

    if (navigator.share && navigator.canShare && navigator.canShare({ files:[file] })) {
      await navigator.share({
        title:"LiveBridge Live Room",
        text:generated.message,
        files:[file]
      });
      return;
    }

    if (navigator.share) {
      await navigator.share({
        title:"LiveBridge Live Room",
        text:generated.message,
        url:generated.url
      });
      return;
    }

    await navigator.clipboard.writeText(generated.message);
    alert("Invite text copied. The share graphic is shown below.");
  }

  function accountRoom() {
    return String(window.liveBridgeAccount?.defaultRoom || "").trim().toUpperCase();
  }

  function accountLanguage() {
    return normalizeLanguage(document.getElementById("accountShareLanguage")?.value || "en");
  }

  function installAccountSharing() {
    if (!document.getElementById("listenerQRCode")) return;

    window.createListenerURL = function(room) {
      return buildGateURL(room);
    };

    window.updateSharing = function(account) {
      const room = String(account?.defaultRoom || accountRoom()).trim().toUpperCase();
      const url = buildGateURL(room);
      window.liveBridgeListenerURL = url;

      const text = document.getElementById("listenerShareURL");
      const qr = document.getElementById("listenerQRCode");
      if (text) text.textContent = url;
      if (qr) {
        qr.src =
          "https://api.qrserver.com/v1/create-qr-code/" +
          "?size=300x300&margin=5&data=" +
          encodeURIComponent(url);
      }
    };

    window.makeAccountShareGraphic = async function() {
      return makePoster({
        room:accountRoom(),
        organization:window.liveBridgeAccount?.organizationName || "LiveBridge Organization",
        language:accountLanguage()
      });
    };

    const refresh = () => {
      if (window.liveBridgeAccount) {
        window.updateSharing(window.liveBridgeAccount);
      }
    };

    document.getElementById("accountShareLanguage")?.addEventListener("change", refresh);
    window.addEventListener("load", () => setTimeout(refresh, 700));
    setTimeout(refresh, 1200);
  }

  function listenerRoom() {
    return String(
      document.getElementById("listenerRoom")?.value ||
      new URLSearchParams(window.location.search).get("room") ||
      ""
    ).trim().toUpperCase();
  }

  function listenerLanguage() {
    return normalizeLanguage(
      document.getElementById("listenerLanguage")?.value ||
      new URLSearchParams(window.location.search).get("lang") ||
      "en"
    );
  }

  function listenerOrganization() {
    const room = listenerRoom();
    return room ? "LiveBridge • " + room : "LiveBridge";
  }

  function ensureListenerPreview() {
    if (document.getElementById("lbListenerSharePreview")) return;

    const card = document.querySelector(".lb-listener-share-card > div:first-child");
    if (!card) return;

    const preview = document.createElement("div");
    preview.id = "lbListenerSharePreview";
    preview.style.cssText = "display:none;margin-top:14px;border:1px solid rgba(52,211,153,.28);border-radius:14px;overflow:hidden;background:#061321;";
    preview.innerHTML = `
      <img id="lbListenerSharePreviewImage" alt="LiveBridge invite preview" style="width:100%;display:block;">
      <div style="display:flex;gap:8px;flex-wrap:wrap;padding:10px;background:#0a1928;">
        <button id="lbListenerDownloadGraphic" type="button" class="lb-listener-share-button">Download Graphic</button>
        <button id="lbListenerCopyInviteText" type="button" class="lb-listener-share-button">Copy Invite Text</button>
      </div>
    `;
    card.appendChild(preview);

    document.getElementById("lbListenerDownloadGraphic")?.addEventListener("click", async () => {
      const generated = window.currentListenerShareInvite || await previewListenerGraphic();
      const link = document.createElement("a");
      link.href = generated.canvas.toDataURL("image/png");
      link.download = generated.filename;
      link.click();
    });

    document.getElementById("lbListenerCopyInviteText")?.addEventListener("click", async function() {
      const generated = window.currentListenerShareInvite || await previewListenerGraphic();
      await navigator.clipboard.writeText(generated.message);
      const old = this.textContent;
      this.textContent = "✓ Copied";
      setTimeout(() => this.textContent = old, 1500);
    });
  }

  async function previewListenerGraphic() {
    ensureListenerPreview();
    const generated = await makePoster({
      room:listenerRoom(),
      organization:listenerOrganization(),
      language:listenerLanguage()
    });

    const image = document.getElementById("lbListenerSharePreviewImage");
    const preview = document.getElementById("lbListenerSharePreview");
    if (image) image.src = generated.canvas.toDataURL("image/png");
    if (preview) preview.style.display = "block";
    window.currentListenerShareInvite = generated;
    return generated;
  }

  function installListenerSharing() {
    if (!document.getElementById("lbListenerShareURL")) return;

    window.getListenerShareURL = function() {
      return buildGateURL(listenerRoom());
    };

    window.refreshListenerShare = function() {
      const url = window.getListenerShareURL();
      const text = document.getElementById("lbListenerShareURL");
      const qr = document.getElementById("lbListenerQR");
      if (text) text.textContent = url;
      if (qr) {
        qr.src =
          "https://api.qrserver.com/v1/create-qr-code/" +
          "?size=300x300&margin=5&data=" +
          encodeURIComponent(url);
      }
    };

    ensureListenerPreview();

    const oldShare = document.getElementById("lbListenerShare");
    if (oldShare) {
      const fresh = oldShare.cloneNode(true);
      oldShare.replaceWith(fresh);
      fresh.addEventListener("click", async () => {
        try {
          const generated = await previewListenerGraphic();
          await shareGenerated(generated);
        } catch (error) {
          if (error?.name !== "AbortError") {
            console.error("LiveBridge listener sharing failed:", error);
            alert("The invite preview is shown below.");
          }
        }
      });
    }

    document.getElementById("listenerRoom")?.addEventListener("input", () => {
      window.currentListenerShareInvite = null;
      window.refreshListenerShare();
    });

    document.getElementById("listenerLanguage")?.addEventListener("change", async () => {
      window.currentListenerShareInvite = null;
      window.refreshListenerShare();
      if (document.getElementById("lbListenerSharePreview")?.style.display === "block") {
        await previewListenerGraphic();
      }
    });

    window.refreshListenerShare();
    setTimeout(window.refreshListenerShare, 800);
  }

  function init() {
    installAccountSharing();
    installListenerSharing();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.LiveBridgeRoomShare = {
    buildGateURL,
    makePoster
  };
})();
