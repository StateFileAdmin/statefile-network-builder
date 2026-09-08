import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Building2,
  Cable,
  MapPin,
  Network,
  Plus,
  Shield,
  Trash2,
  X,
} from "lucide-react";
import type {
  InfrastructureState,
  RecordStatus,
  Site,
  SiteRelationship,
} from "../types";
import { CustomSelect } from "./FormControls";
import "./Dashboard.css";

interface Props {
  canManage: boolean;
  sites: Site[];
  relationships: SiteRelationship[];
  onOpenSite: (id: string) => void;
  onAddSite: (site: Site) => void;
  onSaveRelationship: (relationship: SiteRelationship) => void;
  onDeleteRelationship: (id: string) => void;
}

const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const emptySite = (): Site => ({
  id: uid("site"),
  name: "",
  address: "",
  description: "",
  devices: [],
  connections: [],
  ipPlan: [],
  risks: [],
  plannedImprovements: [],
});
const blankRelationship = (sites: Site[]): SiteRelationship => ({
  id: uid("site-link"),
  sourceSiteId: sites[0]?.id || "",
  targetSiteId: sites[1]?.id || sites[0]?.id || "",
  name: "Site-to-site VPN",
  technology: "WireGuard",
  notes: "",
  status: "Needs Verification",
  state: "Current",
});

export function Dashboard({
  sites,
  relationships,
  onOpenSite,
  onAddSite,
  onSaveRelationship,
  onDeleteRelationship,
}: Props) {
  const [siteForm, setSiteForm] = useState<Site | null>(null);
  const [relationshipForm, setRelationshipForm] =
    useState<SiteRelationship | null>(null);
  const known = sites.reduce(
    (sum, site) =>
      sum + site.devices.filter((device) => device.status === "Known").length,
    0,
  );
  const unverified = sites.reduce(
    (sum, site) =>
      sum +
      site.devices.filter((device) => device.status === "Needs Verification")
        .length,
    0,
  );
  const planned = sites.reduce(
    (sum, site) =>
      sum + site.devices.filter((device) => device.status === "Planned").length,
    0,
  );
  return (
    <main className="dashboard">
      <section className="dashboard-hero">
        <div>
          <span className="eyebrow">Organisation overview</span>
          <h1>Network locations</h1>
          <p>
            Open a location map or document how sites connect to each other.
          </p>
        </div>
        <div className="dashboard-summary">
          <div>
            <b>{sites.length}</b>
            <span>Locations</span>
          </div>
          <div className="known-stat">
            <b>{known}</b>
            <span>Known</span>
          </div>
          <div className={unverified ? "amber-stat" : ""}>
            <b>{unverified}</b>
            <span>To verify</span>
          </div>
          <div className="planned-stat">
            <b>{planned}</b>
            <span>Planned</span>
          </div>
        </div>
      </section>
      <section className="dashboard-section">
        <header>
          <div>
            <h2>Locations</h2>
            <p>
              Each location has its own network diagram, asset register and IP
              plan.
            </p>
          </div>
          <button onClick={() => setSiteForm(emptySite())}>
            <Plus size={16} /> Add location
          </button>
        </header>
        <div className="location-grid">
          {sites.map((site) => {
            const unknown = site.devices.filter(
              (device) => device.status === "Needs Verification",
            ).length;
            return (
              <button
                className="location-card"
                key={site.id}
                onClick={() => onOpenSite(site.id)}
              >
                <span className="location-card-icon">
                  <Building2 size={20} />
                </span>
                <span className="location-card-copy">
                  <b>{site.name}</b>
                  <small>
                    <MapPin size={12} />
                    {site.address || "Address not recorded"}
                  </small>
                  <span>
                    {site.description || "Network map ready for documentation."}
                  </span>
                </span>
                <span className="location-card-stats">
                  <span>
                    <b>{site.devices.length}</b> devices
                  </span>
                  <span className={unknown ? "warning" : ""}>
                    <b>{unknown}</b> to verify
                  </span>
                </span>
                <ArrowRight size={17} />
              </button>
            );
          })}
        </div>
      </section>
      <section className="dashboard-section relationship-section">
        <header>
          <div>
            <h2>Inter-site relationships</h2>
            <p>
              Document parent VPN hosts, dependent branches and site-to-site
              links.
            </p>
          </div>
          <button
            disabled={sites.length < 2}
            onClick={() => setRelationshipForm(blankRelationship(sites))}
          >
            <Plus size={16} /> Add relationship
          </button>
        </header>
        {relationships.length ? (
          <div className="relationship-list">
            {relationships.map((link) => (
              <RelationshipCard
                key={link.id}
                link={link}
                sites={sites}
                onEdit={() => setRelationshipForm(link)}
                onDelete={() => onDeleteRelationship(link.id)}
              />
            ))}
          </div>
        ) : (
          <div className="relationship-empty">
            <Network size={28} />
            <b>No inter-site relationships documented</b>
            <span>
              Add a relationship when one location hosts a VPN or another shared
              network service.
            </span>
          </div>
        )}
      </section>
      {siteForm && (
        <SiteModal
          site={siteForm}
          onClose={() => setSiteForm(null)}
          onSave={(site) => {
            onAddSite(site);
            setSiteForm(null);
          }}
        />
      )}
      {relationshipForm && (
        <RelationshipModal
          relationship={relationshipForm}
          sites={sites}
          onClose={() => setRelationshipForm(null)}
          onSave={(link) => {
            onSaveRelationship(link);
            setRelationshipForm(null);
          }}
        />
      )}
    </main>
  );
}

function RelationshipCard({
  link,
  sites,
  onEdit,
  onDelete,
}: {
  link: SiteRelationship;
  sites: Site[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  const source = sites.find((site) => site.id === link.sourceSiteId),
    target = sites.find((site) => site.id === link.targetSiteId);
  return (
    <div
      className={`relationship-card status-${link.status.toLowerCase().replace(" ", "-")} state-${link.state.toLowerCase()}`}
    >
      <span className="relationship-icon">
        {link.technology.toLowerCase().includes("vpn") ||
        link.technology.toLowerCase().includes("wireguard") ? (
          <Shield size={18} />
        ) : (
          <Cable size={18} />
        )}
      </span>
      <div className="relationship-copy">
        <div>
          <b>{link.name}</b>
          <span
            className={`relationship-status status-${link.status.toLowerCase().replace(" ", "-")}`}
          >
            {link.state === "Future" ? "Future · " : ""}
            {link.status}
          </span>
        </div>
        <p>
          <strong>{source?.name || "Unknown site"}</strong>
          <ArrowRight size={14} />
          <strong>{target?.name || "Unknown site"}</strong>
        </p>
        <small>
          {link.technology}
          {link.notes ? ` · ${link.notes}` : ""}
        </small>
      </div>
      <button className="quiet" onClick={onEdit}>
        Edit
      </button>
      <button
        className="icon-button danger-text"
        onClick={onDelete}
        aria-label={`Remove ${link.name}`}
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}

function SiteModal({
  site,
  onClose,
  onSave,
}: {
  site: Site;
  onClose: () => void;
  onSave: (site: Site) => void;
}) {
  const [draft, setDraft] = useState(site);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        className="dashboard-modal"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          if (draft.name.trim()) onSave({ ...draft, name: draft.name.trim() });
        }}
      >
        <header>
          <div>
            <span className="eyebrow">Location register</span>
            <h2>Add location</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            <X />
          </button>
        </header>
        <div className="dashboard-modal-fields">
          <label>
            <span>Location name</span>
            <input
              autoFocus
              required
              value={draft.name}
              onChange={(event) =>
                setDraft({ ...draft, name: event.target.value })
              }
            />
          </label>
          <label>
            <span>Address</span>
            <input
              value={draft.address}
              onChange={(event) =>
                setDraft({ ...draft, address: event.target.value })
              }
            />
          </label>
          <label>
            <span>Description</span>
            <textarea
              rows={3}
              value={draft.description}
              onChange={(event) =>
                setDraft({ ...draft, description: event.target.value })
              }
            />
          </label>
        </div>
        <footer>
          <button type="button" className="quiet" onClick={onClose}>
            Cancel
          </button>
          <button className="primary">Add location</button>
        </footer>
      </form>
    </div>
  );
}

function RelationshipModal({
  relationship,
  sites,
  onClose,
  onSave,
}: {
  relationship: SiteRelationship;
  sites: Site[];
  onClose: () => void;
  onSave: (relationship: SiteRelationship) => void;
}) {
  const [draft, setDraft] = useState(relationship);
  useEffect(() => setDraft(relationship), [relationship]);
  const siteOptions = sites.map((site) => ({
      value: site.id,
      label: site.name,
      description: site.address || undefined,
    })),
    statuses: RecordStatus[] = [
      "Known",
      "Needs Verification",
      "Planned",
      "Retired",
      "Compromised",
    ],
    statusOptions = statuses.map((value) => ({ value, label: value })),
    stateOptions = [
      { value: "Current", label: "Current" },
      { value: "Future", label: "Future / planned" },
    ];
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        className="dashboard-modal relationship-modal"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          if (draft.sourceSiteId !== draft.targetSiteId) onSave(draft);
        }}
      >
        <header>
          <div>
            <span className="eyebrow">Organisation diagram</span>
            <h2>Site relationship</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            <X />
          </button>
        </header>
        <div className="dashboard-modal-fields two-column">
          <label>
            <span>From / parent site</span>
            <CustomSelect
              label="Source site"
              value={draft.sourceSiteId}
              options={siteOptions}
              onChange={(value) => setDraft({ ...draft, sourceSiteId: value })}
            />
          </label>
          <label>
            <span>To / dependent site</span>
            <CustomSelect
              label="Target site"
              value={draft.targetSiteId}
              options={siteOptions}
              onChange={(value) => setDraft({ ...draft, targetSiteId: value })}
            />
          </label>
          <label className="span-2">
            <span>Relationship name</span>
            <input
              required
              value={draft.name}
              onChange={(event) =>
                setDraft({ ...draft, name: event.target.value })
              }
            />
          </label>
          <label className="span-2">
            <span>Technology</span>
            <input
              value={draft.technology}
              placeholder="WireGuard, IPsec, SD-WAN…"
              onChange={(event) =>
                setDraft({ ...draft, technology: event.target.value })
              }
            />
          </label>
          <label>
            <span>Status</span>
            <CustomSelect
              label="Relationship status"
              value={draft.status}
              options={statusOptions}
              onChange={(value) =>
                setDraft({ ...draft, status: value as RecordStatus })
              }
            />
          </label>
          <label>
            <span>State</span>
            <CustomSelect
              label="Relationship state"
              value={draft.state}
              options={stateOptions}
              onChange={(value) =>
                setDraft({ ...draft, state: value as InfrastructureState })
              }
            />
          </label>
          <label className="span-2">
            <span>Notes</span>
            <textarea
              rows={3}
              value={draft.notes}
              onChange={(event) =>
                setDraft({ ...draft, notes: event.target.value })
              }
            />
          </label>
          {draft.sourceSiteId === draft.targetSiteId && (
            <p className="form-error span-2">Choose two different locations.</p>
          )}
        </div>
        <footer>
          <button type="button" className="quiet" onClick={onClose}>
            Cancel
          </button>
          <button className="primary">Save relationship</button>
        </footer>
      </form>
    </div>
  );
}
