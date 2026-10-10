// Small dependency-free Chrome harness for optional integration browser checks.
import { spawn } from "node:child_process"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { once } from "node:events"

export async function launchBrowser(executable, profile) {
  const child = spawn(executable, ["--headless=new", "--disable-gpu", "--disable-background-networking", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" })
  child.on("error", () => {})
  let socket
  try {
    let port
    for (let attempt = 0; attempt < 100; attempt++) {
      try { port = Number((await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]); break } catch { /* Chrome is starting. */ }
      if (child.exitCode !== null) throw new Error("Chrome exited before starting the browser check.")
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    if (!port) throw new Error("Chrome did not start its debugging endpoint.")
    const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()
    socket = new WebSocket(version.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }) })
    let nextId = 0
    const pending = new Map()
    const errors = []
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data)
      if (message.id) {
        const callback = pending.get(message.id)
        if (!callback) return
        pending.delete(message.id)
        clearTimeout(callback.timer)
        if (message.error) callback.reject(new Error(message.error.message)); else callback.resolve(message.result)
      } else if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.text)
    })
    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      const id = ++nextId
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Chrome timed out: ${method}`)) }, 15000)
      pending.set(id, { resolve, reject, timer })
      socket.send(JSON.stringify({ id, method, params, sessionId }))
    })
    const evaluate = async (sessionId, expression) => {
      const response = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId)
      if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text)
      return response.result.value
    }
    const waitFor = async (sessionId, expression, timeout = 12000) => {
      const deadline = Date.now() + timeout
      while (Date.now() < deadline) {
        if (await evaluate(sessionId, expression)) return
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      throw new Error(`Browser condition did not become true: ${expression}`)
    }
    const page = async (url, cookie) => {
      const { browserContextId } = await send("Target.createBrowserContext")
      const { targetId } = await send("Target.createTarget", { url: "about:blank", browserContextId })
      const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true })
      await send("Runtime.enable", {}, sessionId)
      await send("Page.enable", {}, sessionId)
      await send("Network.enable", {}, sessionId)
      const index = cookie.indexOf("=")
      await send("Network.setCookie", { name: cookie.slice(0, index), value: cookie.slice(index + 1), url, httpOnly: true, sameSite: "Lax" }, sessionId)
      await send("Page.navigate", { url }, sessionId)
      await waitFor(sessionId, "document.readyState === 'complete'")
      return sessionId
    }
    return { send, evaluate, waitFor, page, errors, close: async () => {
      socket.close()
      if (child.exitCode === null) { const exited = once(child, "exit"); child.kill(); await exited }
    } }
  } catch (error) {
    socket?.close()
    if (child.exitCode === null && child.pid) { const exited = once(child, "exit"); child.kill(); await exited }
    throw error
  }
}
