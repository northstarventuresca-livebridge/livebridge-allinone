/* LiveBridge broadcaster share graphic v2 — visual poster refresh */
(() => {
  function roundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
  }

  function wrapPosterText(ctx, text, maxWidth) {
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

    if (line) {
      lines.push(line);
    }

    return lines;
  }

  function fitPosterLines(ctx, text, maxWidth, maxLines, startSize, minSize, weight = 900) {
    let size = startSize;
    let lines = [];

    while (size >= minSize) {
      ctx.font = `${weight} ${size}px Arial,Helvetica,sans-serif`;
      lines = wrapPosterText(ctx, text, maxWidth);
      if (lines.length <= maxLines) {
        break;
      }
      size -= 4;
    }

    return { size, lines };
  }

  function drawBridgeMark(ctx, x, y, width) {
    ctx.save();
    ctx.lineCap = "round";

    const markGradient = ctx.createLinearGradient(x, y, x + width, y + 70);
    markGradient.addColorStop(0, "#61efff");
    markGradient.addColorStop(1, "#1599ff");

    ctx.strokeStyle = markGradient;
    ctx.lineWidth = 12;

    ctx.beginPath();
    ctx.arc(x + width * 0.46, y + 62, width * 0.42, Math.PI * 1.08, Math.PI * 1.82);
    ctx.stroke();

    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(x + 4, y + 70);
    ctx.bezierCurveTo(
      x + width * 0.28, y + 33,
      x + width * 0.64, y + 32,
      x + width, y + 70
    );
    ctx.stroke();

    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(x + width * 0.3, y + 67);
    ctx.lineTo(x + width * 0.3, y + 25);
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

  function drawStep(ctx, cx, cy, kind, labelLines) {
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
    labelLines.forEach((line, index) => {
      ctx.fillText(line, cx, cy + 95 + index * 28);
    });

    ctx.restore();
  }

  function drawBackground(ctx, width, height) {
    const base = ctx.createLinearGradient(0, 0, width, height);
    base.addColorStop(0, "#071a3f");
    base.addColorStop(0.5, "#0a3b73");
    base.addColorStop(1, "#061c46");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, width, height);

    const rightGlow = ctx.createRadialGradient(
      width * 0.86,
      height * 0.12,
      20,
      width * 0.86,
      height * 0.12,
      width * 0.48
    );
    rightGlow.addColorStop(0, "rgba(25,221,255,.42)");
    rightGlow.addColorStop(0.48, "rgba(19,148,240,.18)");
    rightGlow.addColorStop(1, "rgba(19,148,240,0)");
    ctx.fillStyle = rightGlow;
    ctx.fillRect(0, 0, width, height);

    const leftGlow = ctx.createRadialGradient(170, 770, 20, 170, 770, 520);
    leftGlow.addColorStop(0, "rgba(0,137,255,.22)");
    leftGlow.addColorStop(1, "rgba(0,137,255,0)");
    ctx.fillStyle = leftGlow;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = "#61e7ff";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(1020, -40);
    ctx.bezierCurveTo(1300, 80, 1360, 300, 1660, 350);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(1110, -20);
    ctx.bezierCurveTo(1340, 110, 1420, 270, 1640, 290);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.26;
    ctx.strokeStyle = "#39dfff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 820);
    ctx.bezierCurveTo(380, 740, 790, 760, 1600, 805);
    ctx.stroke();
    ctx.restore();

    const floor = ctx.createLinearGradient(0, 720, 0, height);
    floor.addColorStop(0, "rgba(5,19,54,0)");
    floor.addColorStop(1, "rgba(2,9,28,.72)");
    ctx.fillStyle = floor;
    ctx.fillRect(0, 700, width, height - 700);
  }

  async function liveBridgeMakeShareInviteGraphicV2() {
    const lang = document.getElementById("shareInviteLanguage")?.value || "en";
    const t = shareInviteTranslations[lang] || shareInviteTranslations.en;
    const room = document.getElementById("roomName")?.value?.trim().toUpperCase() || "LIVE";
    const org = document.getElementById("broadcasterOrganization")?.textContent?.trim() || "LiveBridge Organization";
    const url = window.currentBroadcasterListenerURL;

    const english = lang === "en";
    const headline = english ? "Listen Live" : t.title;
    const subheadline = english ? "In Your Language" : t.subtitle;
    const bodyCopy = english
      ? "Scan the QR code to hear today’s message in your preferred language."
      : t.message;

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
    drawBackground(ctx, canvas.width, canvas.height);

    drawBridgeMark(ctx, 286, 48, 245);

    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 76px Arial,Helvetica,sans-serif";
    ctx.fillText("Live", 72, 165);
    ctx.fillStyle = "#40dfff";
    ctx.fillText("Bridge", 220, 165);

    ctx.fillStyle = "rgba(220,239,255,.82)";
    ctx.font = "700 22px Arial,Helvetica,sans-serif";
    ctx.fillText(org, 74, 202);

    const leftWidth = 790;
    let y = 340;

    if (english) {
      ctx.fillStyle = "#ffffff";
      ctx.font = "900 112px Arial,Helvetica,sans-serif";
      ctx.fillText(headline, 68, y);
      y += 92;

      ctx.fillStyle = "#49e8ff";
      ctx.font = "900 72px Arial,Helvetica,sans-serif";
      ctx.fillText(subheadline, 70, y);
      y += 75;
    } else {
      const headlineFit = fitPosterLines(ctx, headline, leftWidth, 2, 78, 48, 900);
      ctx.fillStyle = "#ffffff";
      ctx.font = `900 ${headlineFit.size}px Arial,Helvetica,sans-serif`;
      for (const line of headlineFit.lines) {
        ctx.fillText(line, 70, y);
        y += headlineFit.size + 10;
      }

      const subFit = fitPosterLines(ctx, subheadline, leftWidth, 2, 50, 34, 800);
      ctx.fillStyle = "#49e8ff";
      ctx.font = `800 ${subFit.size}px Arial,Helvetica,sans-serif`;
      for (const line of subFit.lines) {
        ctx.fillText(line, 72, y);
        y += subFit.size + 8;
      }
      y += 12;
    }

    ctx.fillStyle = "#ffffff";
    ctx.font = "600 34px Arial,Helvetica,sans-serif";
    const bodyLines = wrapPosterText(ctx, bodyCopy, 720).slice(0, 3);
    bodyLines.forEach((line, index) => {
      ctx.fillText(line, 74, y + index * 44);
    });

    const qrPanelX = 925;
    const qrPanelY = 82;
    const qrPanelW = 595;
    const qrPanelH = 640;

    ctx.save();
    ctx.shadowColor = "rgba(69,230,255,.72)";
    ctx.shadowBlur = 42;
    ctx.fillStyle = "#ffffff";
    roundedRect(ctx, qrPanelX, qrPanelY, qrPanelW, qrPanelH, 34);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = "#ffffff";
    roundedRect(ctx, qrPanelX, qrPanelY, qrPanelW, qrPanelH, 34);
    ctx.fill();

    ctx.drawImage(qr, qrPanelX + 45, qrPanelY + 45, 505, 505);

    ctx.textAlign = "center";
    ctx.fillStyle = "#092654";
    ctx.font = "900 24px Arial,Helvetica,sans-serif";
    ctx.fillText("SCAN TO LISTEN LIVE", qrPanelX + qrPanelW / 2, qrPanelY + 595);

    ctx.fillStyle = "rgba(23,83,128,.80)";
    ctx.font = "800 18px Arial,Helvetica,sans-serif";
    ctx.fillText(t.room + ": " + room, qrPanelX + qrPanelW / 2, qrPanelY + 625);

    drawStep(ctx, 175, 715, "phone", ["Scan"]);
    drawStep(ctx, 455, 715, "globe", ["Choose Your", "Language"]);
    drawStep(ctx, 735, 715, "headphones", ["Listen Live"]);

    ctx.fillStyle = "#42e6ff";
    ctx.beginPath();
    ctx.arc(315, 715, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(595, 715, 7, 0, Math.PI * 2);
    ctx.fill();

    const blob = await new Promise(resolve =>
      canvas.toBlob(resolve, "image/png", 0.96)
    );

    return {
      canvas,
      blob,
      filename: "LiveBridge-" + room + "-" + lang + ".png",
      // The text/share message intentionally keeps the clickable URL.
      // The graphic itself intentionally does not print the URL because the QR code already contains it.
      message:
        t.message +
        "\n\n" +
        org +
        "\n" +
        t.room +
        ": " +
        room +
        "\n" +
        url
    };
  }

  window.makeShareInviteGraphic = liveBridgeMakeShareInviteGraphicV2;
})();
