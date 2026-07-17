import{c}from"./index-CnxWXA3R.js";/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const h=[["path",{d:"m5 12 7-7 7 7",key:"hav0vg"}],["path",{d:"M12 19V5",key:"x0mq9r"}]],p=c("ArrowUp",h);async function w(a,i,o={}){const n=new AbortController,s=globalThis.setTimeout(()=>n.abort(),o.timeoutMs??9e4);try{const r=await fetch(a,{method:"POST",headers:{"Content-Type":"application/json",...o.token?{Authorization:`Bearer ${o.token}`}:{}},body:JSON.stringify(i),signal:n.signal}),t=await r.text();let e={};try{e=t?JSON.parse(t):{}}catch{}if(!r.ok)throw new Error(String(e.error||t||`Alpha returned HTTP ${r.status}.`));return e}catch(r){throw r instanceof DOMException&&r.name==="AbortError"?new Error("Alpha took too long to respond. Try again."):r instanceof TypeError?new Error("Could not reach Alpha. Confirm the Render service is running with `npm start`."):r}finally{globalThis.clearTimeout(s)}}export{p as A,w as p};
