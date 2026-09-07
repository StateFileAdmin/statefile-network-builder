import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  Clipboard,
  LogOut,
  Shield,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import type { Site } from "../types";
import { authenticatedFetch } from "../data/storage";
import { CustomSelect } from "./FormControls";
import "./AccountPanel.css";

export interface CurrentUser {
  email: string;
  displayName: string;
  role: "admin" | "staff";
  scopeAll: boolean;
  siteIds: string[];
  csrfToken: string;
}
interface UserRow {
  id: string;
  email: string;
  display_name: string;
  role: "admin" | "staff";
  scope_all: number;
  status: "active" | "suspended";
  created_at: string;
  site_ids: string[];
}
interface SecurityEvent {
  id: number;
  event_type: string;
  severity: "info" | "warning" | "critical";
  route: string;
  country: string | null;
  created_at: string;
}
const json = async (response: Response) => {
  const result = (await response.json()) as Record<string, unknown>;
  if (!response.ok)
    throw new Error(
      typeof result.error === "string" ? result.error : "The request failed.",
    );
  return result;
};

export function AccountPanel({
  user,
  sites,
  onClose,
}: {
  user: CurrentUser;
  sites: Site[];
  onClose: () => void;
}) {
  const [users, setUsers] = useState<UserRow[]>([]),
    [events, setEvents] = useState<SecurityEvent[]>([]),
    [tab, setTab] = useState<"people" | "security">("people"),
    [error, setError] = useState(""),
    [inviteOpen, setInviteOpen] = useState(false);
  const load = async () => {
    if (user.role !== "admin") return;
    try {
      const [people, security] = await Promise.all([
          authenticatedFetch("/api/admin/users"),
          authenticatedFetch("/api/admin/security-events"),
        ]),
        peopleJson = await json(people),
        securityJson = await json(security);
      setUsers(peopleJson.users as UserRow[]);
      setEvents(securityJson.events as SecurityEvent[]);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load account settings.",
      );
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const logout = async () => {
    await authenticatedFetch("/api/auth/logout", {
      method: "POST",
      body: "{}",
    });
    window.location.reload();
  };
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="account-panel">
        <header>
          <div>
            <span className="eyebrow">Account and access</span>
            <h2>{user.displayName}</h2>
            <p>
              {user.email} · {user.role === "admin" ? "Administrator" : "Staff"}
            </p>
          </div>
          <button className="icon-button" onClick={onClose}>
            <X />
          </button>
        </header>
        {user.role === "admin" ? (
          <>
            <nav>
              <button
                className={tab === "people" ? "active" : ""}
                onClick={() => setTab("people")}
              >
                <Users size={15} /> People
              </button>
              <button
                className={tab === "security" ? "active" : ""}
                onClick={() => setTab("security")}
              >
                <Shield size={15} /> Security events
              </button>
            </nav>
            {error && <div className="account-error">{error}</div>}
            {tab === "people" ? (
              <div className="account-content">
                <div className="account-toolbar">
                  <p>
                    Admins manage the account. Staff can edit and publish their
                    assigned locations but cannot delete.
                  </p>
                  <button onClick={() => setInviteOpen(true)}>
                    <UserPlus size={15} /> Invite person
                  </button>
                </div>
                <div className="user-list">
                  {users.map((person) => (
                    <UserEditor
                      key={person.id}
                      person={person}
                      sites={sites}
                      onSaved={load}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="account-content security-list">
                {events.length ? (
                  events.map((event) => (
                    <div
                      key={event.id}
                      className={`security-row severity-${event.severity}`}
                    >
                      <AlertTriangle size={14} />
                      <span>
                        <b>{event.event_type.replaceAll("_", " ")}</b>
                        <small>
                          {event.route || "Authentication"} ·{" "}
                          {event.country || "Unknown region"} ·{" "}
                          {new Date(event.created_at).toLocaleString("en-AU")}
                        </small>
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="account-empty">
                    <Check />
                    No security events recorded.
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="account-content staff-summary">
            <Shield size={28} />
            <h3>Your access</h3>
            <p>
              {user.scopeAll
                ? "You can edit and publish all locations."
                : "You can edit and publish your assigned locations."}{" "}
              Deletion and account administration require an administrator.
            </p>
          </div>
        )}
        <footer>
          <button className="quiet" onClick={() => void logout()}>
            <LogOut size={15} /> Sign out
          </button>
        </footer>
        {inviteOpen && (
          <InviteModal sites={sites} onClose={() => setInviteOpen(false)} />
        )}
      </section>
    </div>
  );
}

function UserEditor({
  person,
  sites,
  onSaved,
}: {
  person: UserRow;
  sites: Site[];
  onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(person),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await json(
        await authenticatedFetch(
          `/api/admin/users/${encodeURIComponent(person.id)}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              role: draft.role,
              scopeAll: Boolean(draft.scope_all),
              status: draft.status,
              siteIds: draft.site_ids,
            }),
          },
        ),
      );
      await onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save account.",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="user-editor">
      <div className="user-identity">
        <b>{person.display_name}</b>
        <small>{person.email}</small>
      </div>
      <CustomSelect
        label="Role"
        value={draft.role}
        options={[
          { value: "admin", label: "Administrator" },
          { value: "staff", label: "Staff" },
        ]}
        onChange={(role) =>
          setDraft({
            ...draft,
            role: role as "admin" | "staff",
            scope_all: role === "admin" ? 1 : draft.scope_all,
          })
        }
      />
      <CustomSelect
        label="Status"
        value={draft.status}
        options={[
          { value: "active", label: "Active" },
          { value: "suspended", label: "Suspended" },
        ]}
        onChange={(status) =>
          setDraft({ ...draft, status: status as "active" | "suspended" })
        }
      />
      {draft.role === "staff" && (
        <label className="scope-all">
          <input
            type="checkbox"
            checked={Boolean(draft.scope_all)}
            onChange={(event) =>
              setDraft({ ...draft, scope_all: event.target.checked ? 1 : 0 })
            }
          />{" "}
          All locations
        </label>
      )}
      {draft.role === "staff" && !draft.scope_all && (
        <div className="site-assignments">
          {sites.map((site) => (
            <label key={site.id}>
              <input
                type="checkbox"
                checked={draft.site_ids.includes(site.id)}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    site_ids: event.target.checked
                      ? [...draft.site_ids, site.id]
                      : draft.site_ids.filter((id) => id !== site.id),
                  })
                }
              />
              {site.name}
            </label>
          ))}
        </div>
      )}
      <button className="primary" disabled={saving} onClick={() => void save()}>
        {saving ? "Saving…" : "Save"}
      </button>
      {error && <small className="field-error">{error}</small>}
    </div>
  );
}

function InviteModal({
  sites,
  onClose,
}: {
  sites: Site[];
  onClose: () => void;
}) {
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [role, setRole] = useState<"admin" | "staff">("staff"),
    [scopeAll, setScopeAll] = useState(false),
    [siteIds, setSiteIds] = useState<string[]>([]),
    [inviteUrl, setInviteUrl] = useState(""),
    [copied, setCopied] = useState(false),
    [error, setError] = useState("");
  const create = async () => {
    setError("");
    try {
      const result = await json(
        await authenticatedFetch("/api/admin/invites", {
          method: "POST",
          body: JSON.stringify({
            displayName: name,
            email,
            role,
            scopeAll,
            siteIds,
          }),
        }),
      );
      setInviteUrl(result.inviteUrl as string);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not create invitation.",
      );
    }
  };
  return (
    <div className="nested-modal">
      <div>
        <header>
          <h3>Invite person</h3>
          <button className="icon-button" onClick={onClose}>
            <X />
          </button>
        </header>
        {inviteUrl ? (
          <div className="invite-result">
            <Check size={25} />
            <b>Invitation ready</b>
            <p>Send this single-use link securely. It expires in one hour.</p>
            <code>{inviteUrl}</code>
            <button
              className={`primary${copied ? " copied" : ""}`}
              onClick={() => {
                void navigator.clipboard.writeText(inviteUrl).then(() => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 2000);
                });
              }}
            >
              <Clipboard size={15} /> {copied ? "Copied" : "Copy invitation"}
            </button>
          </div>
        ) : (
          <div className="invite-fields">
            <label>
              <span>Name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label>
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label>
              <span>Role</span>
              <CustomSelect
                label="Invite role"
                value={role}
                options={[
                  { value: "staff", label: "Staff" },
                  { value: "admin", label: "Administrator" },
                ]}
                onChange={(value) => setRole(value as "admin" | "staff")}
              />
            </label>
            {role === "staff" && (
              <label className="scope-all">
                <input
                  type="checkbox"
                  checked={scopeAll}
                  onChange={(event) => setScopeAll(event.target.checked)}
                />{" "}
                Access all locations
              </label>
            )}
            {role === "staff" && !scopeAll && (
              <div className="site-assignments">
                {sites.map((site) => (
                  <label key={site.id}>
                    <input
                      type="checkbox"
                      checked={siteIds.includes(site.id)}
                      onChange={(event) =>
                        setSiteIds(
                          event.target.checked
                            ? [...siteIds, site.id]
                            : siteIds.filter((id) => id !== site.id),
                        )
                      }
                    />
                    {site.name}
                  </label>
                ))}
              </div>
            )}
            {error && <div className="account-error">{error}</div>}
            <button
              className="primary"
              disabled={
                !name.trim() ||
                !email.trim() ||
                (role === "staff" && !scopeAll && !siteIds.length)
              }
              onClick={() => void create()}
            >
              Create secure invitation
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
