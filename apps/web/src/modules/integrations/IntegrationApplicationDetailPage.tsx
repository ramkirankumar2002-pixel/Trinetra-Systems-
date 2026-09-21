import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { isApiError } from "../../shared/api/client.ts";
import { useAuth } from "../../shared/auth/AuthContext.tsx";
import { hasPermission } from "../../shared/auth/permissions.ts";
import { formatDateTime, StatusPill } from "../../shared/ui/StatusPill.tsx";
import {
  createCredential,
  createWebhook,
  getApplication,
  getCatalog,
  listCredentials,
  listWebhooks,
  revokeCredential,
  rotateCredential,
  rotateWebhookSecret,
  testWebhook,
  updateApplication,
  updateWebhook,
  type IntegrationCatalog,
  type PublicApplication,
  type PublicCredential,
  type PublicWebhook,
} from "./api.ts";

export function IntegrationApplicationDetailPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const canManage = hasPermission(user, "integration.manage");
  const [application, setApplication] = useState<PublicApplication | null>(null);
  const [catalog, setCatalog] = useState<IntegrationCatalog | null>(null);
  const [credentials, setCredentials] = useState<PublicCredential[]>([]);
  const [webhooks, setWebhooks] = useState<PublicWebhook[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState("https://example.com/webhooks/trinetra");
  const [selectedEvents, setSelectedEvents] = useState<string[]>(["TRANSACTION_COMPLETED"]);
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);

  async function reload(): Promise<void> {
    const [app, creds, hooks, cat] = await Promise.all([
      getApplication(id),
      listCredentials(id),
      listWebhooks(id),
      getCatalog(),
    ]);
    setApplication(app.application);
    setSelectedScopes(app.application.scopes);
    setCredentials(creds.items);
    setWebhooks(hooks.items);
    setCatalog(cat);
  }

  useEffect(() => {
    void reload().catch((caught: unknown) => setError(isApiError(caught) ? caught.message : "Unable to load application"));
  }, [id]);

  async function run(action: () => Promise<unknown>): Promise<void> {
    try {
      await action();
      await reload();
      setError(null);
    } catch (caught: unknown) {
      setError(isApiError(caught) ? caught.message : "Request failed");
    }
  }

  function showSecret(secret: string): void {
    setRevealedSecret(secret);
  }

  if (!application) {
    return error ? <p className="form-error">{error}</p> : <p className="login-note">Loading application…</p>;
  }

  return (
    <>
      {error ? <p className="form-error">{error}</p> : null}
      {revealedSecret ? (
        <section className="panel-form">
          <h2>New secret</h2>
          <p className="form-error">Store this secret securely. It will not be shown again.</p>
          <p>
            <code>{revealedSecret}</code>
          </p>
          <button type="button" className="ghost-button" onClick={() => setRevealedSecret(null)}>
            Hide
          </button>
        </section>
      ) : null}

      <section className="identity-card">
        <strong>{application.name}</strong>
        <StatusPill value={application.status} />
        <StatusPill value={application.environment} />
        <p>{application.description ?? "No description"}</p>
        <p>Default rate limit {application.requestsPerMinute}/min, {application.requestsPerHour}/hour</p>
      </section>

      {canManage ? (
        <form
          className="panel-form"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            void run(() => updateApplication(id, { scopes: selectedScopes }));
          }}
        >
          <h2>Scopes</h2>
          <p className="login-note">Do not grant every scope. Keep access to the minimum required.</p>
          {(catalog?.scopes ?? []).map((scope) => (
            <label key={scope}>
              <input
                type="checkbox"
                checked={selectedScopes.includes(scope)}
                onChange={() =>
                  setSelectedScopes((current) =>
                    current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope],
                  )
                }
              />
              {scope}
            </label>
          ))}
          <div className="button-row">
            <button type="submit">Save scopes</button>
            {application.status === "ACTIVE" ? (
              <button type="button" className="ghost-button" onClick={() => void run(() => updateApplication(id, { status: "SUSPENDED" }))}>
                Suspend
              </button>
            ) : (
              <button type="button" onClick={() => void run(() => updateApplication(id, { status: "ACTIVE" }))}>
                Activate
              </button>
            )}
          </div>
        </form>
      ) : null}

      <section className="panel-form">
        <h2>API credentials</h2>
        {canManage ? (
          <button
            type="button"
            onClick={() =>
              void createCredential(id).then((result) => {
                showSecret(result.secret);
                return reload();
              })
            }
          >
            Create credential
          </button>
        ) : null}
        {credentials.map((credential) => (
          <article key={credential.id} className="identity-card">
            <strong>{credential.clientId}</strong>
            <StatusPill value={credential.status} />
            <p>Prefix {credential.secretPrefix}…</p>
            <p>Last used {credential.lastUsedAt ? formatDateTime(credential.lastUsedAt) : "never"}</p>
            {canManage && credential.status === "ACTIVE" ? (
              <div className="button-row">
                <button
                  type="button"
                  onClick={() =>
                    void rotateCredential(credential.id).then((result) => {
                      showSecret(result.secret);
                      return reload();
                    })
                  }
                >
                  Rotate
                </button>
                <button type="button" className="ghost-button" onClick={() => void run(() => revokeCredential(credential.id))}>
                  Revoke
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </section>

      <section className="panel-form">
        <h2>Webhooks</h2>
        {canManage ? (
          <form
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              void createWebhook(id, { url: webhookUrl, eventTypes: selectedEvents }).then((result) => {
                showSecret(result.secret);
                return reload();
              });
            }}
          >
            <label>
              Endpoint URL
              <input value={webhookUrl} onChange={(event) => setWebhookUrl(event.target.value)} required />
            </label>
            {(catalog?.webhookEventTypes ?? []).map((eventType) => (
              <label key={eventType}>
                <input
                  type="checkbox"
                  checked={selectedEvents.includes(eventType)}
                  onChange={() =>
                    setSelectedEvents((current) =>
                      current.includes(eventType) ? current.filter((item) => item !== eventType) : [...current, eventType],
                    )
                  }
                />
                {eventType}
              </label>
            ))}
            <button type="submit">Create webhook</button>
          </form>
        ) : null}
        {webhooks.map((webhook) => (
          <article key={webhook.id} className="identity-card">
            <strong>{webhook.url}</strong>
            <StatusPill value={webhook.status} />
            <p>{webhook.eventTypes.join(", ")}</p>
            <p>Secret prefix {webhook.secretPrefix}…</p>
            {canManage ? (
              <div className="button-row">
                {webhook.status === "ACTIVE" ? (
                  <button type="button" className="ghost-button" onClick={() => void run(() => updateWebhook(webhook.id, { status: "DISABLED" }))}>
                    Disable
                  </button>
                ) : (
                  <button type="button" onClick={() => void run(() => updateWebhook(webhook.id, { status: "ACTIVE" }))}>
                    Enable
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    void rotateWebhookSecret(webhook.id).then((result) => {
                      showSecret(result.secret);
                      return reload();
                    })
                  }
                >
                  Rotate secret
                </button>
                <button type="button" onClick={() => void testWebhook(webhook.id).then(() => reload())}>
                  Send test event
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </section>
    </>
  );
}
