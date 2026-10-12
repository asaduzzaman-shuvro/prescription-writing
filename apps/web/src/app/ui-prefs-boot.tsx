"use client";

import { useServerInsertedHTML } from "next/navigation";

/** Apply saved display prefs before paint (avoids a flash of default size). */
const UI_PREFS_BOOT = `(function(){try{var p=JSON.parse(localStorage.getItem("rx.uiPrefs")||"{}");var legF={small:0.5,default:1,large:1.5};var legS={compact:0.5,default:1,roomy:1.5};function n(v,leg){if(typeof v==="number"&&isFinite(v))return Math.min(2.5,Math.max(0.5,Math.round(v*2)/2));if(typeof v==="string"&&leg[v]!=null)return leg[v];var x=Number(v);return isFinite(x)?Math.min(2.5,Math.max(0.5,Math.round(x*2)/2)):1}var d=document.documentElement;d.style.setProperty("--rx-font-scale",String(n(p.font,legF)));d.style.setProperty("--rx-pad-scale",String(n(p.padding,legS)));d.style.setProperty("--rx-gap-scale",String(n(p.gap,legS)));}catch(e){}})();`;

/** Server-only inline script. React 19 does not run <script> tags it renders on the client. */
export function UiPrefsBoot() {
  useServerInsertedHTML(() => <script id="rx-ui-prefs" dangerouslySetInnerHTML={{ __html: UI_PREFS_BOOT }} />);
  return null;
}
