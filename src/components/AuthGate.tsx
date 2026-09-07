import { useEffect, useState, type ReactNode } from "react";
import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import {
  ArrowLeft,
  ArrowRight,
  Fingerprint,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { setCsrfToken } from "../data/storage";
import "./AuthGate.css";
interface Status {
  setupRequired: boolean;
  standaloneSetup?: boolean;
  authenticated: boolean;
  accessEmail?: string | null;
  csrfToken?: string;
  expiresAt?: string;
}
interface SetupDetails {
  displayName: string;
  email: string;
  setupCode: string;
}
const post = async (path: string, body: unknown) => {
  const response = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    json = (await response.json()) as Record<string, unknown>;
  if (!response.ok)
    throw new Error(
      typeof json.error === "string"
        ? json.error
        : "The secure request failed.",
    );
  return json;
};
export function AuthGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const refresh = async () => {
    try {
      const response = await fetch("/api/auth/status", {
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error("Could not check the secure session.");
      const next = (await response.json()) as Status;
      if (next.csrfToken) setCsrfToken(next.csrfToken);
      setStatus(next);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not check the secure session.",
      );
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    if (!status?.authenticated || !status.expiresAt) return;
    const remaining = new Date(status.expiresAt).getTime() - Date.now();
    const timer = window.setTimeout(
      () => void refresh(),
      Math.max(0, remaining) + 250,
    );
    return () => window.clearTimeout(timer);
  }, [status?.authenticated, status?.expiresAt]);
  if (error && !status)
    return (
      <AuthShell>
        <div className="auth-panel">
          <LockKeyhole />
          <h1>Secure access unavailable</h1>
          <p>{error}</p>
          <button
            className="primary"
            onClick={() => {
              setError("");
              void refresh();
            }}
          >
            Try again
          </button>
        </div>
      </AuthShell>
    );
  if (!status)
    return (
      <AuthShell>
        <div className="auth-panel auth-loading">
          <ShieldCheck />
          <span>Checking secure access…</span>
        </div>
      </AuthShell>
    );
  if (status.authenticated) return <>{children}</>;
  const supported = browserSupportsWebAuthn(),
    inviteToken = window.location.hash.startsWith("#invite/")
      ? window.location.hash.slice(8)
      : "",
    resetToken = window.location.hash.startsWith("#reset/")
      ? window.location.hash.slice(7)
      : "";
  const setup = async (details: SetupDetails) => {
    setBusy(true);
    setError("");
    try {
      const generated = (await post(
          "/api/auth/setup/options",
          details,
        )) as unknown as {
          options: PublicKeyCredentialCreationOptionsJSON;
          challengeId: string;
        },
        response = await startRegistration({ optionsJSON: generated.options }),
        verified = await post("/api/auth/setup/verify", {
          challengeId: generated.challengeId,
          response,
        });
      if (typeof verified.csrfToken === "string")
        setCsrfToken(verified.csrfToken);
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Administrator setup failed.",
      );
    } finally {
      setBusy(false);
    }
  };
  const login = async () => {
    setBusy(true);
    setError("");
    try {
      const generated = (await post(
          "/api/auth/login/options",
          {},
        )) as unknown as {
          options: PublicKeyCredentialRequestOptionsJSON;
          challengeId: string;
        },
        response = await startAuthentication({
          optionsJSON: generated.options,
        }),
        verified = await post("/api/auth/login/verify", {
          challengeId: generated.challengeId,
          response,
        });
      if (typeof verified.csrfToken === "string")
        setCsrfToken(verified.csrfToken);
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Passkey sign-in failed.",
      );
    } finally {
      setBusy(false);
    }
  };
  const invite = async () => {
    setBusy(true);
    setError("");
    try {
      const generated = (await post("/api/auth/invite/options", {
          token: inviteToken,
        })) as unknown as {
          options: PublicKeyCredentialCreationOptionsJSON;
          challengeId: string;
        },
        response = await startRegistration({ optionsJSON: generated.options }),
        verified = await post("/api/auth/invite/verify", {
          challengeId: generated.challengeId,
          response,
        });
      if (typeof verified.csrfToken === "string")
        setCsrfToken(verified.csrfToken);
      window.history.replaceState(null, "", "#dashboard");
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Invitation setup failed.",
      );
    } finally {
      setBusy(false);
    }
  };
  const resetPasskeys = async () => {
    setBusy(true);
    setError("");
    try {
      const generated = (await post("/api/auth/reset/options", {
          token: resetToken,
        })) as unknown as {
          options: PublicKeyCredentialCreationOptionsJSON;
          challengeId: string;
        },
        response = await startRegistration({ optionsJSON: generated.options }),
        verified = await post("/api/auth/reset/verify", {
          challengeId: generated.challengeId,
          response,
        });
      if (typeof verified.csrfToken === "string")
        setCsrfToken(verified.csrfToken);
      window.history.replaceState(null, "", "#dashboard");
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Passkey reset failed.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthShell>
      {status.setupRequired ? (
        <AdminSetup
          email={status.accessEmail ?? ""}
          standalone={Boolean(status.standaloneSetup)}
          supported={supported}
          busy={busy}
          error={error}
          onSubmit={setup}
        />
      ) : inviteToken ? (
        <div className="auth-panel">
          <span className="auth-icon">
            <ShieldCheck size={28} />
          </span>
          <h1>Set up your account</h1>
          <p>Your details are already attached. Create a passkey to finish.</p>
          {error && <div className="auth-error">{error}</div>}
          <button
            className="primary auth-primary"
            disabled={!supported || busy}
            onClick={() => void invite()}
          >
            <Fingerprint size={17} />
            Create your passkey
          </button>
        </div>
      ) : resetToken ? (
        <div className="auth-panel">
          <span className="auth-icon">
            <Fingerprint size={28} />
          </span>
          <h1>Reset your passkeys</h1>
          <p>
            Create a replacement passkey. Your old passkeys and sessions will be
            revoked when this completes.
          </p>
          {error && <div className="auth-error">{error}</div>}
          <button
            className="primary auth-primary"
            disabled={!supported || busy}
            onClick={() => void resetPasskeys()}
          >
            <Fingerprint size={17} />
            {busy ? "Opening passkey provider…" : "Create replacement passkey"}
          </button>
        </div>
      ) : (
        <div className="auth-panel">
          <span className="auth-icon">
            <Fingerprint size={28} />
          </span>
          <h1>Sign in with your passkey</h1>
          <p>
            Use Keeper, Face ID, Touch ID, Windows Hello or your device PIN.
          </p>
          {error && <div className="auth-error">{error}</div>}
          <button
            className="primary auth-primary"
            disabled={!supported || busy}
            onClick={() => void login()}
          >
            <KeyRound size={17} />
            Continue with passkey
          </button>
        </div>
      )}
    </AuthShell>
  );
}
function AdminSetup({
  email,
  standalone,
  supported,
  busy,
  error,
  onSubmit,
}: {
  email: string;
  standalone: boolean;
  supported: boolean;
  busy: boolean;
  error: string;
  onSubmit: (details: SetupDetails) => Promise<void>;
}) {
  const [step, setStep] = useState<1 | 2>(1),
    [identifier, setIdentifier] = useState(email),
    valid = identifier.trim().length >= 2,
    details = {
      displayName: identifier.trim(),
      email: identifier.trim(),
      setupCode: "",
    };
  if (step === 2)
    return (
      <div className="auth-panel setup-panel">
        <span className="auth-icon">
          <Fingerprint size={28} />
        </span>
        <span className="eyebrow">Step 2 of 2</span>
        <h1>Create your passkey</h1>
        <p>
          <b>{identifier.trim()}</b>
        </p>
        <div className="passkey-explainer">
          Chrome will ask where to save it. Choose <b>Keeper</b> or this device.
        </div>
        {error && <div className="auth-error">{error}</div>}
        <button
          className="primary auth-primary"
          disabled={!supported || busy}
          onClick={() => void onSubmit(details)}
        >
          <Fingerprint size={17} />
          {busy ? "Opening passkey provider…" : "Create passkey"}
        </button>
        <button
          className="auth-back"
          disabled={busy}
          onClick={() => setStep(1)}
        >
          <ArrowLeft size={14} /> Back
        </button>
      </div>
    );
  return (
    <form
      className="auth-panel setup-panel"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) setStep(2);
      }}
    >
      <span className="auth-icon">
        <ShieldCheck size={28} />
      </span>
      <span className="eyebrow">Step 1 of 2</span>
      <h1>Create the administrator</h1>
      <p>Choose the name or email used to identify this account.</p>
      <label>
        <span>Name or email</span>
        <input
          autoFocus
          required
          maxLength={254}
          readOnly={!standalone}
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          placeholder="Name or email"
        />
      </label>
      <button
        className="primary auth-primary"
        disabled={!supported || busy || !valid}
      >
        Continue <ArrowRight size={16} />
      </button>
    </form>
  );
}
function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="auth-shell">
      <div className="auth-grid" />
      <header className="auth-brand">
        <span>
          <img src="/statefile-mark.svg" alt="" />
        </span>
        <div>
          <b>Network Builder</b>
          <small>Secure infrastructure documentation</small>
        </div>
      </header>
      {children}
      <footer>Passkey protected · Encrypted storage · Audited access</footer>
    </main>
  );
}
