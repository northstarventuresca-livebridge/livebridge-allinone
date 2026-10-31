/* LiveBridge preview-only email-independent broadcast password integration. */
(()=>{"use strict";
if(window.__lbEmailFreePasswordActive)return;window.__lbEmailFreePasswordActive=true;
const API="https://livebridge-broadcast-password-preview.northstarventures-ca.workers.dev";
const el=id=>document.getElementById(id);
const show=(id,message,bad=false)=>{
 const node=el(id);if(!node)return;node.textContent=message;node.style.color=bad?"#ffb5b5":"#91f3bf";
};
const stop=e=>{e.preventDefault();e.stopImmediatePropagation();e.stopPropagation();};
const json=async r=>{const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.error||"Request failed.");return data;};
const url=()=>new URLSearchParams(location.search).get("returnTo")==="/admin"?"/admin":"/account";
function setMode(password){
 const form=el("passwordLoginForm"),host=el("clerk-auth"),toggle=el("passwordLoginToggle");
 if(!form||!host)return;
 form.style.display=password?"block":"none";host.style.display=password?"none":"";
 if(toggle)toggle.textContent=password?"Use email code instead":"Use password instead of email code";
 if(password&&location.hash.includes("factor-two"))history.replaceState(null,"",location.pathname+location.search);
}
function repaint(){
 const button=el("manageAccountButton");if(button)button.textContent="Set or Change Broadcast Password";
 const status=el("passwordAccessEnabled");
 if(status)status.textContent="Optional broadcast password: after setup, use email + password to sign in without an email code.";
 const form=el("accountPasswordForm");
 if(form){
  el("passwordCurrentWrapper").style.display="none";
  el("accountPasswordCurrent").required=false;
  for(const id of ["accountPasswordNew","accountPasswordConfirm"]){const item=el(id);if(item)item.minLength=15;}
  form.querySelectorAll(".lb-muted").forEach(x=>{
   if(x.textContent.includes("Preferred LiveBridge policy:")||x.textContent.includes("Testing note:")){
    x.textContent="Broadcast password: 15 or more characters. This is separate from your Clerk password, but you can choose the same text.";
   }
  });
 }
}
document.addEventListener("click",async event=>{
 const button=event.target?.closest?.("button");if(!button)return;
 if(button.id==="passwordLoginToggle"){stop(event);setMode(el("passwordLoginForm").style.display==="none");return;}
 if(button.id==="passwordEmailCodeButton"){stop(event);el("passwordLoginForm")?.reset();setMode(false);return;}
 if(button.id!=="manageAccountButton")return;
 stop(event);button.disabled=true;show("accountPasswordResult","");
 try{
  if(typeof checkPasswordAccess!=="function"||!(await checkPasswordAccess()))throw Error("Your organization has not enabled optional password sign-in.");
  const token=await getLiveBridgeSessionToken();if(!token)throw Error("Sign in again using email code.");
  const state=await json(await fetch(API+"/status",{headers:{"Authorization":"Bearer "+token},cache:"no-store"}));
  if(!state.ready)throw Error("Email-free password login needs one more setup step.");
  repaint();el("accountPasswordForm").reset();el("accountPasswordForm").style.display="block";
  show("accountPasswordResult",state.enrolled?"Change your existing broadcast password below.":"Set your broadcast password once while you have email access.");
  el("accountPasswordNew")?.focus();
 }catch(e){show("accountPasswordResult",e.message,true);}
 finally{button.disabled=false;}
},true);
document.addEventListener("submit",async event=>{
 const form=event.target;if(!form)return;
 if(form.id==="passwordLoginForm"){
  stop(event);const button=el("passwordLoginSubmit");button.disabled=true;show("passwordLoginError","");
  try{
   const email=el("passwordLoginEmail").value.trim(),password=el("passwordLoginPassword").value;
   const r=await json(await fetch(API+"/login",{method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",body:JSON.stringify({email,password})}));
   if(!r.ticket)throw Error("A sign-in ticket was not returned.");
   const result=await Clerk.client.signIn.create({strategy:"ticket",ticket:r.ticket});
   if(result.status!=="complete"||!result.createdSessionId)throw Error("Sign-in could not be finished.");
   await Clerk.setActive({session:result.createdSessionId});location.replace(url());
  }catch(e){show("passwordLoginError",e.message,true);}
  finally{button.disabled=false;el("passwordLoginPassword").value="";}
  return;
 }
 if(form.id!=="accountPasswordForm")return;
 stop(event);const button=el("saveAccountPassword");button.disabled=true;
 show("accountPasswordMessage","");show("accountPasswordResult","");
 try{
  const pass=el("accountPasswordNew").value;
  if(pass.length<15||pass.length>128)throw Error("Choose a password with 15 to 128 characters.");
  if(pass!==el("accountPasswordConfirm").value)throw Error("Passwords don't match.");
  if(typeof checkPasswordAccess!=="function"||!(await checkPasswordAccess()))throw Error("Password sign-in isn't enabled.");
  const token=await getLiveBridgeSessionToken();if(!token)throw Error("Sign in again using email code.");
  const result=await json(await fetch(API+"/enroll",{method:"POST",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},cache:"no-store",body:JSON.stringify({password:pass})}));
  form.reset();form.style.display="none";
  show("accountPasswordResult","Broadcast password saved. Future sign-ins can use email + password without an email code.");
 }catch(e){show("accountPasswordMessage",e.message,true);}
 finally{button.disabled=false;}
},true);
document.addEventListener("DOMContentLoaded",repaint);
window.addEventListener("load",repaint);
})();