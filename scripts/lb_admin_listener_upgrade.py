from pathlib import Path

def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 match, found {count}")
    return text.replace(old, new, 1)

path = Path("frontend/public/admin/index.html")
text = path.read_text(encoding="utf-8")

admin_toggle = r'''            <div class="lb-card" style="margin-top:16px;">

              <div class="lb-card-title" style="margin-bottom:7px;">
                Listener Data Usage Display
              </div>

              <div class="lb-muted" style="line-height:1.5;margin-bottom:14px;">
                Site Admin only. When enabled, listeners for this organization see a small “Data this visit” estimate on /t. The organization cannot change this setting from its account.
              </div>

              <label style="
                display:flex;
                align-items:center;
                justify-content:space-between;
                gap:14px;
                padding:12px;
                border:1px solid rgba(45,151,255,.18);
                border-radius:11px;
                background:rgba(45,151,255,.06);
                cursor:pointer;
              ">
                <div>
                  <div style="font-weight:900;color:#dce9f5;margin-bottom:3px;">
                    Show data counter to listeners
                  </div>
                  <div class="lb-muted">
                    Default is off.
                  </div>
                </div>

                <input
                  id="editListenerDataDisplay"
                  type="checkbox"
                  style="width:19px;height:19px;flex:0 0 auto;"
                >
              </label>

            </div>


'''

anchor = '''            <div class="lb-card" style="margin-top:16px;">

              <div class="lb-card-title" style="margin-bottom:7px;">
                Return Visitor Recognition
'''

text = replace_once(
    text,
    anchor,
    admin_toggle + anchor,
    "listener data toggle card"
)

text = replace_once(
    text,
    '''  const featureOverrides =
    account.featureOverrides || {};

  document.getElementById("overrideTranscriptAccess").checked =''',
    '''  const featureOverrides =
    account.featureOverrides || {};

  document.getElementById(
    "editListenerDataDisplay"
  ).checked =
    !!featureOverrides.listenerDataDisplay;

  document.getElementById("overrideTranscriptAccess").checked =''',
    "load listener data toggle"
)

text = replace_once(
    text,
    '''function collectFeatureOverrides(){
  return {
    transcriptAccess:''',
    '''function collectFeatureOverrides(){
  return {
    listenerDataDisplay:
      document.getElementById(
        "editListenerDataDisplay"
      )?.checked === true,

    transcriptAccess:''',
    "save listener data toggle"
)

text = replace_once(
    text,
    '''  const labels = {
    transcriptAccess:"Transcripts",''',
    '''  const labels = {
    listenerDataDisplay:
      "Listener Data Usage Display",
    transcriptAccess:"Transcripts",''',
    "listener data summary label"
)

path.write_text(text, encoding="utf-8")
print("admin patched")
