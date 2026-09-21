export function operatorHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Trinetra Edge Operator</title>
  <style>
    :root { color: #e7eef3; background: #071422; font-family: "Segoe UI", sans-serif; }
    body { margin: 0; padding: 1.5rem; }
    h1 { font-weight: 600; letter-spacing: 0.04em; }
    .banner { padding: 1rem; border: 1px solid #c4a35a; color: #c4a35a; margin: 1rem 0; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); gap: 0.75rem; }
    article { background: #12263a; padding: 1rem; border: 1px solid #27445c; }
    span { display: block; color: #2eb7c9; text-transform: uppercase; font-size: 0.7rem; letter-spacing: 0.12em; }
    button { margin: 0.35rem 0.35rem 0 0; min-height: 2.5rem; background: #c4a35a; border: 0; padding: 0 0.9rem; cursor: pointer; }
    pre { white-space: pre-wrap; background: #12263a; padding: 1rem; }
  </style>
</head>
<body>
  <p style="color:#2eb7c9;letter-spacing:0.16em;text-transform:uppercase">Trinetra Edge</p>
  <h1>Local operator console</h1>
  <p>This page talks to the Edge Gateway on this machine. It does not duplicate the central Trinetra backend.</p>
  <div id="banner" class="banner" hidden></div>
  <div id="status" class="grid"></div>
  <p>
    <button type="button" data-action="create">New local visit</button>
    <button type="button" data-action="anpr">ANPR</button>
    <button type="button" data-action="gross">Gross</button>
    <button type="button" data-action="tare">Tare</button>
    <button type="button" data-action="complete">Complete locally</button>
    <button type="button" data-action="anomaly">Local anomaly</button>
    <button type="button" data-action="offline">Simulate internet failure</button>
    <button type="button" data-action="online">Restore internet</button>
  </p>
  <pre id="log">Loading…</pre>
  <script>
    let localTransactionId = null;
    async function refresh() {
      const status = await (await fetch("/operator/status")).json();
      localTransactionId = status.transactions.at(-1)?.localTransactionId ?? localTransactionId;
      const banner = document.getElementById("banner");
      banner.hidden = !status.offlineBanner && !status.configMessage && !status.lastLocalAlert;
      banner.textContent = [status.offlineBanner, status.configMessage, status.lastLocalAlert].filter(Boolean).join(" ");
      document.getElementById("status").innerHTML = [
        ["Gateway", status.gateway.code],
        ["Connectivity", status.connectivity.connectivityState],
        ["Internet", status.connectivity.internetStatus],
        ["Backend", status.connectivity.backendStatus],
        ["Hardware", status.connectivity.hardwareStatus],
        ["Sync", status.connectivity.syncStatus],
        ["Queued", status.queue.pending],
        ["Synced", status.queue.synced],
        ["Dead letter", status.queue.deadLetter],
        ["Local visit", localTransactionId ?? "—"],
      ].map(([k,v]) => "<article><span>"+escapeHtml(k)+"</span>"+escapeHtml(v)+"</article>").join("");
      document.getElementById("log").textContent = JSON.stringify(status, null, 2);
    }
    async function post(path, body = {}) {
      const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (payload.transaction?.localTransactionId) localTransactionId = payload.transaction.localTransactionId;
      await refresh();
    }
    document.body.addEventListener("click", (event) => {
      const action = event.target?.dataset?.action;
      if (action === "create") void post("/operator/transaction", { vehicleNumber: "APXX1234" });
      if (action === "anpr") void post("/operator/anpr", { localTransactionId });
      if (action === "gross") void post("/operator/gross", { localTransactionId });
      if (action === "tare") void post("/operator/tare", { localTransactionId });
      if (action === "complete") void post("/operator/complete", { localTransactionId });
      if (action === "anomaly") void post("/operator/anomaly", { weightKg: 850, platformState: "EMPTY" });
      if (action === "offline") void post("/simulate/disconnect-backend");
      if (action === "online") void post("/simulate/reconnect-backend");
    });
    void refresh();
    setInterval(() => void refresh(), 4000);
    function escapeHtml(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    }
  </script>
</body>
</html>`;
}
