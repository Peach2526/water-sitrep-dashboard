const DEFAULT_TIMEOUT_MS = 12000;

export async function fetchJson(url, options = {}) {
  const startedAt = new Date();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "accept": "application/json,text/plain,*/*",
        "user-agent": "ChaoPhrayaDashboardMVP/0.1 (+public data dashboard)",
        ...(options.headers ?? {})
      },
      signal: controller.signal
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return {
      ok: true,
      url,
      status: response.status,
      fetchedAt: new Date().toISOString(),
      elapsedMs: Date.now() - startedAt.getTime(),
      data: parseJsonMaybe(text)
    };
  } catch (error) {
    return {
      ok: false,
      url,
      fetchedAt: new Date().toISOString(),
      elapsedMs: Date.now() - startedAt.getTime(),
      error: error.name === "AbortError" ? "request_timeout" : error.message
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchTextHead(url, options = {}) {
  const startedAt = new Date();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "accept": "text/html,application/pdf,*/*",
        "user-agent": "ChaoPhrayaDashboardMVP/0.1 (+public data dashboard)",
        ...(options.headers ?? {})
      },
      signal: controller.signal
    });

    return {
      ok: response.ok,
      url,
      status: response.status,
      contentType: response.headers.get("content-type") ?? "",
      fetchedAt: new Date().toISOString(),
      elapsedMs: Date.now() - startedAt.getTime()
    };
  } catch (error) {
    return {
      ok: false,
      url,
      fetchedAt: new Date().toISOString(),
      elapsedMs: Date.now() - startedAt.getTime(),
      error: error.name === "AbortError" ? "request_timeout" : error.message
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchText(url, options = {}) {
  const startedAt = new Date();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "accept": "text/html,text/plain,*/*",
        "user-agent": "ChaoPhrayaDashboardMVP/0.1 (+public data dashboard)",
        ...(options.headers ?? {})
      },
      signal: controller.signal
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return {
      ok: true,
      url,
      status: response.status,
      fetchedAt: new Date().toISOString(),
      elapsedMs: Date.now() - startedAt.getTime(),
      text
    };
  } catch (error) {
    return {
      ok: false,
      url,
      fetchedAt: new Date().toISOString(),
      elapsedMs: Date.now() - startedAt.getTime(),
      error: error.name === "AbortError" ? "request_timeout" : error.message
    };
  } finally {
    clearTimeout(timeout);
  }
}

function parseJsonMaybe(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
