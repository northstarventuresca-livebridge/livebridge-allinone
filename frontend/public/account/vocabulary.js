// Organization Vocabulary editor for the existing LiveBridge Account Information tab.
(function () {
  "use strict";
  const card = document.getElementById("organizationVocabularyCard");
  const root = document.getElementById("organizationVocabularyRoot");
  if (!card || !root) return;

  root.innerHTML = [
    '<p class="lb-muted" style="margin:8px 0 14px;line-height:1.6">',
    'Teach LiveBridge how to spell unusual names, local places and unique terms. ',
    'Hints apply only to your organization and are used for new live transcription sessions. ',
    'The AI checks context rather than blindly replacing every similar-sounding word.</p>',
    '<form id="lbVocabularyForm" style="display:grid;gap:12px;">',
    '<label class="lb-small-label">Correct spelling *',
    '<input required maxlength="80" id="lbVocabSpelling" placeholder="Jachin" autocomplete="off" style="display:block;width:100%;margin-top:5px;padding:11px;border-radius:9px;background:#071321;color:#fff;border:1px solid #38526c"></label>',
    '<label class="lb-small-label">Pronounced like',
    '<input maxlength="100" id="lbVocabPronunciation" placeholder="Jake-in" autocomplete="off" style="display:block;width:100%;margin-top:5px;padding:11px;border-radius:9px;background:#071321;color:#fff;border:1px solid #38526c"></label>',
    '<label class="lb-small-label">Common incorrect transcriptions (separate with commas)',
    '<textarea id="lbVocabMistakes" rows="2" placeholder="Jack in, Jacqueline" style="display:block;width:100%;margin-top:5px;padding:11px;border-radius:9px;background:#071321;color:#fff;border:1px solid #38526c"></textarea></label>',
    '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">',
    '<button type="submit" class="lb-button primary" id="lbVocabSave">Save Word</button>',
    '<button type="button" class="lb-button secondary" id="lbVocabClear">Clear</button>',
    '<span id="lbVocabStatus" class="lb-muted" role="status" aria-live="polite"></span>',
    '</div></form>',
    '<div style="margin-top:17px;font-weight:900;color:#fff;font-size:14px">Saved vocabulary <span id="lbVocabCount" class="lb-muted"></span></div>',
    '<div id="lbVocabularyList" style="display:grid;gap:9px;margin-top:10px"></div>'
  ].join("");

  const form = document.getElementById("lbVocabularyForm");
  const status = document.getElementById("lbVocabStatus");
  const list = document.getElementById("lbVocabularyList");
  const count = document.getElementById("lbVocabCount");
  const spelling = document.getElementById("lbVocabSpelling");
  const pronunciation = document.getElementById("lbVocabPronunciation");
  const mistakes = document.getElementById("lbVocabMistakes");
  const save = document.getElementById("lbVocabSave");

  function setStatus(message, error) {
    status.textContent = message || "";
    status.style.color = error ? "#ff9b9b" : "#80e7c5";
  }

  function displayEntries(entries) {
    list.replaceChildren();
    count.textContent = "(" + entries.length + "/100)";
    if (!entries.length) {
      const empty = document.createElement("div");
      empty.className = "lb-muted";
      empty.textContent = "No custom words yet. Add your first one above.";
      list.appendChild(empty);
      return;
    }
    for (const entry of entries) {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:12px;background:#0c1c2e;border:1px solid rgba(255,255,255,.09);border-radius:11px";
      const details = document.createElement("div");
      const name = document.createElement("strong");
      name.style.color = "#fff";
      name.textContent = entry.spelling;
      details.appendChild(name);
      const guide = document.createElement("div");
      guide.className = "lb-muted";
      guide.style.marginTop = "4px";
      guide.textContent = [
        entry.pronunciation ? "Sounds like: " + entry.pronunciation : "",
        (entry.mistakenForms || []).length ? "Misheard as: " + entry.mistakenForms.join(", ") : ""
      ].filter(Boolean).join(" · ") || "Custom spelling";
      details.appendChild(guide);
      row.appendChild(details);
      const actions = document.createElement("div");
      actions.style.cssText = "display:flex;gap:7px";
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "lb-button secondary";
      edit.textContent = "Edit";
      edit.addEventListener("click", function () {
        spelling.value = entry.spelling;
        pronunciation.value = entry.pronunciation || "";
        mistakes.value = (entry.mistakenForms || []).join(", ");
        spelling.focus();
        setStatus("Edit the fields, then save.");
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "lb-button secondary";
      remove.textContent = "Remove";
      remove.addEventListener("click", async function () {
        if (!window.confirm("Remove " + entry.spelling + " from your organization's dictionary?")) return;
        remove.disabled = true;
        try {
          await window.liveBridgeAccountApi("/account/vocabulary", {
            method: "POST",
            body: JSON.stringify({ action: "delete", id: entry.id })
          });
          await load();
          setStatus("Removed " + entry.spelling + ".");
        } catch (error) {
          setStatus(error.message || "Could not remove word.", true);
          remove.disabled = false;
        }
      });
      actions.append(edit, remove);
      row.appendChild(actions);
      list.appendChild(row);
    }
  }

  async function load() {
    list.textContent = "Loading dictionary...";
    try {
      const data = await window.liveBridgeAccountApi("/account/vocabulary", { method: "GET" });
      displayEntries(data.entries || []);
    } catch (error) {
      list.textContent = "";
      setStatus(error.message || "Could not load dictionary.", true);
    }
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    save.disabled = true;
    setStatus("Saving...");
    try {
      await window.liveBridgeAccountApi("/account/vocabulary", {
        method: "POST",
        body: JSON.stringify({
          spelling: spelling.value,
          pronunciation: pronunciation.value,
          mistakenForms: mistakes.value.split(",").map(function (value) { return value.trim(); }).filter(Boolean)
        })
      });
      form.reset();
      await load();
      setStatus("Saved. Your next live transcription session will use these hints.");
    } catch (error) {
      setStatus(error.message || "Could not save word.", true);
    } finally {
      save.disabled = false;
    }
  });

  document.getElementById("lbVocabClear").addEventListener("click", function () {
    form.reset();
    setStatus("");
  });

  // Delay loading until a signed-in client opens the panel.
  card.addEventListener("toggle", function () {
    if (card.open) load();
  });
})();
