/**
 * Minimal CDP driver for the Tauri WebView2 window — QA scratch tool.
 *
 * Start the app with a debug port first:
 *   WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222 npx tauri dev
 *
 * Then evaluate expressions in the live window:
 *   node scripts/cdp.mjs 'document.title'
 *   node scripts/cdp.mjs '[...document.querySelectorAll("button")].map(b => b.textContent)'
 *
 * Each argument is evaluated in order in the page's main world; the result is
 * printed as JSON. Console output and page errors are printed to stderr.
 */

const PORT = process.env.CDP_PORT ?? "9222";

const expressions = process.argv.slice(2);
if (expressions.length === 0) {
  console.error("usage: node scripts/cdp.mjs '<js expression>' [...]");
  process.exit(1);
}

/** The WebView2 page target, or undefined while the port has nothing to offer. */
async function pageTarget() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  const targets = await res.json();
  return targets.find(
    (t) => t.type === "page" && !t.url.startsWith("devtools://")
  );
}

const POLL_INTERVAL_MS = 500;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** One poll, then re-arm itself — the port is usually up within a second or two. */
async function pollForPage(deadline) {
  try {
    const page = await pageTarget();
    if (page?.webSocketDebuggerUrl) {
      return page;
    }
  } catch {
    // port not up yet — keep polling
  }
  if (Date.now() >= deadline) {
    throw new Error(`no page target on http://127.0.0.1:${PORT}/json/list`);
  }
  await delay(POLL_INTERVAL_MS);
  return pollForPage(deadline);
}

function findPage() {
  return pollForPage(Date.now() + 20_000);
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    let nextId = 1;
    const pending = new Map();

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) {
        const { resolve: done, reject: fail } = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) {
          fail(new Error(JSON.stringify(message.error)));
        } else {
          done(message.result);
        }
        return;
      }
      if (message.method === "Runtime.consoleAPICalled") {
        const text = (message.params.args ?? [])
          .map((a) => a.value ?? a.description ?? a.type)
          .join(" ");
        console.error(`[console.${message.params.type}] ${text}`);
      }
      if (message.method === "Runtime.exceptionThrown") {
        const d = message.params.exceptionDetails;
        console.error(`[page-error] ${d.exception?.description ?? d.text}`);
      }
    });

    socket.addEventListener("error", () =>
      reject(new Error("websocket error"))
    );
    socket.addEventListener("open", () => {
      const send = (method, params = {}) =>
        new Promise((done, fail) => {
          const id = nextId;
          nextId += 1;
          pending.set(id, { reject: fail, resolve: done });
          socket.send(JSON.stringify({ id, method, params }));
        });
      resolve({ send, socket });
    });
  });
}

const page = await findPage();
console.error(`# attached: ${page.title} — ${page.url}`);
const { send, socket } = await connect(page.webSocketDebuggerUrl);

await send("Runtime.enable");

/** Evaluates one expression in the page's main world and prints its result. */
async function runExpression(expression) {
  try {
    const result = await send("Runtime.evaluate", {
      awaitPromise: true,
      expression,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      console.log(
        `ERROR: ${
          result.exceptionDetails.exception?.description ??
          result.exceptionDetails.text
        }`
      );
    } else {
      console.log(JSON.stringify(result.result?.value ?? null, null, 2));
    }
  } catch (error) {
    console.log(`ERROR: ${error.message}`);
  }
}

// Sequential by design: an expression may inspect what an earlier one did.
await expressions.reduce(
  (previous, expression) => previous.then(() => runExpression(expression)),
  Promise.resolve()
);

socket.close();
process.exit(0);
