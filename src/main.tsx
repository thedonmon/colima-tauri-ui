import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Surface boot failures on-screen in dev — a thrown module error otherwise
// renders as a silent blank window.
if (import.meta.env.DEV) {
  window.addEventListener("error", (e) => {
    const el = document.createElement("pre");
    el.style.cssText =
      "position:fixed;inset:0;z-index:9999;color:#f87171;background:#15171e;padding:48px 16px;font-size:11px;white-space:pre-wrap;overflow:auto";
    el.textContent = `BOOT ERROR: ${e.message}\n${(e.error as Error | undefined)?.stack ?? ""}`;
    document.body.appendChild(el);
  });
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
