#!/usr/bin/env node

import { writeFile } from "node:fs/promises";

const [port = "9226", url = "http://127.0.0.1:8000/", output = "today-ai-news.pdf"] = process.argv.slice(2);
const endpoint = `http://127.0.0.1:${port}`;

const pages = await fetch(`${endpoint}/json/list`).then((response) => response.json());
const page = pages.find((candidate) => candidate.type === "page");
if (!page) throw new Error("No inspectable browser page found");

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
  const handlers = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) handlers.reject(new Error(message.error.message));
  else handlers.resolve(message.result);
});

function send(method, params = {}) {
  const id = ++commandId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

await send("Page.enable");
await send("Page.navigate", { url });
await new Promise((resolve) => setTimeout(resolve, 1200));
await send("Runtime.evaluate", { expression: "renderPrintReport()" });
await send("Emulation.setEmulatedMedia", { media: "print" });
const result = await send("Page.printToPDF", {
  printBackground: true,
  preferCSSPageSize: true,
  displayHeaderFooter: false,
});
await writeFile(output, Buffer.from(result.data, "base64"));
console.log(output);
socket.close();
