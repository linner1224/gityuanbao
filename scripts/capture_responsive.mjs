#!/usr/bin/env node

import { writeFile } from "node:fs/promises";

const [port = "9223", url = "http://127.0.0.1:8000/", output = "page.png", width = "390", height = "844", expression = "", media = ""] = process.argv.slice(2);
const endpoint = `http://127.0.0.1:${port}`;

async function findPage() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const pages = await fetch(`${endpoint}/json/list`).then((response) => response.json());
      const page = pages.find((candidate) => candidate.type === "page");
      if (page) return page;
    } catch {
      // Chrome may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Chrome DevTools endpoint did not become ready");
}

const page = await findPage();
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let commandId = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});

function send(method, params = {}) {
  const id = ++commandId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: Number(width),
  height: Number(height),
  deviceScaleFactor: 1,
  mobile: true,
  screenWidth: Number(width),
  screenHeight: Number(height),
});
await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
await send("Emulation.setEmulatedMedia", {
  features: [{ name: "prefers-reduced-motion", value: media === "reduce" ? "reduce" : "no-preference" }],
});
await send("Page.navigate", { url });
await new Promise((resolve) => setTimeout(resolve, 1200));

let evaluationValue;
if (expression) {
  const evaluation = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  evaluationValue = evaluation.result?.value;
  await new Promise((resolve) => setTimeout(resolve, 250));
}

const metrics = await send("Runtime.evaluate", {
  expression: "JSON.stringify({innerWidth, innerHeight, scrollWidth: document.documentElement.scrollWidth})",
  returnByValue: true,
});
const screenshot = await send("Page.captureScreenshot", {
  format: "png",
  fromSurface: true,
  captureBeyondViewport: false,
});

await writeFile(output, Buffer.from(screenshot.data, "base64"));
console.log(JSON.stringify({ metrics: JSON.parse(metrics.result.value), evaluation: evaluationValue }));
socket.close();
