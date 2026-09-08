import { useEffect, useState } from "react";
import { ArrowLeft, Eye, History, RotateCcw, X } from "lucide-react";
import type { Site } from "../types";
import { authenticatedFetch } from "../data/storage";
import { ActionDialog, type ActionDialogRequest } from "./ActionDialog";
import "./PublishDialog.css";

interface Publication {
  id: number;
  register_version: number;
  site_version: number;
  release_note: string;
  published_at: string;
  published_by: string;
}

type PublicationPreview = Publication & { site: Site };

export function PublicationHistoryDialog({
  site,
  canRestore,
  onClose,
  onRestored,
}: {
  site: Site;
  canRestore: boolean;
  onClose: () => void;
  onRestored: () => void;
}) {
  const [items, setItems] = useState<Publication[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [preview, setPreview] = useState<PublicationPreview | null>(null),
    [actionDialog, setActionDialog] = useState<ActionDialogRequest | null>(
      null,
    );
  const load = async () => {
    const response = await authenticatedFetch(
      `/api/publications?siteId=${encodeURIComponent(site.id)}`,
    );
    const data = (await response.json()) as {
      publications?: Publication[];
      error?: string;
    };
    if (!response.ok)
      throw new Error(data.error || "Could not load publication history.");
    setItems(data.publications || []);
  };
  useEffect(() => {
    load().catch((cause) =>
      setError(
        cause instanceof Error ? cause.message : "Could not load history.",
      ),
    );
  }, [site.id]);
  const restore = async (item: Publication) => {
    setBusy(true);
    setError("");
    try {
      const response = await authenticatedFetch(
        `/api/publications/${item.id}/restore`,
        { method: "POST", body: "{}" },
      );
      const data = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(data.error || "Could not restore this publication.");
      onRestored();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not restore.");
    } finally {
      setBusy(false);
    }
  };
  const view = async (item: Publication) => {
    setBusy(true);
    setError("");
    try {
      const response = await authenticatedFetch(`/api/publications/${item.id}`),
        data = (await response.json()) as {
          publication?: PublicationPreview;
          error?: string;
        };
      if (!response.ok || !data.publication)
        throw new Error(data.error || "Could not load this publication.");
      setPreview(data.publication);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load preview.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="publish-dialog">
        <header>
          <div>
            <span className="eyebrow">Release checkpoints</span>
            <h2>Publication history</h2>
            <p>
              Review approved versions of {site.name} or restore an earlier
              publication.
            </p>
          </div>
          <button className="icon-button" onClick={onClose}>
            <X />
          </button>
        </header>
        {error && <div className="account-error">{error}</div>}
        <div className="publication-history">
          <h3>
            <History size={16} /> Publication history
          </h3>
          {preview ? (
            <div className="publication-preview">
              <div className="publication-preview-heading">
                <button className="quiet" onClick={() => setPreview(null)}>
                  <ArrowLeft size={14} /> Back
                </button>
                <div>
                  <b>Version {preview.site_version}</b>
                  <span>
                    {new Date(preview.published_at).toLocaleString("en-AU")}
                  </span>
                </div>
              </div>
              <div className="publication-preview-metrics">
                <span>
                  <b>{preview.site.devices.length}</b> Devices
                </span>
                <span>
                  <b>{preview.site.connections.length}</b> Connections
                </span>
                <span>
                  <b>{preview.site.ipPlan.length}</b> IP networks
                </span>
              </div>
              <section>
                <h4>Devices</h4>
                <div className="publication-preview-list">
                  {preview.site.devices.map((device) => (
                    <div key={device.id}>
                      <b>{device.hostname}</b>
                      <span>
                        {device.deviceType} · {device.status}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
              <section>
                <h4>Connections</h4>
                <div className="publication-preview-list">
                  {preview.site.connections.map((connection) => {
                    const names = Object.fromEntries(
                      preview.site.devices.map((device) => [
                        device.id,
                        device.hostname,
                      ]),
                    );
                    return (
                      <div key={connection.id}>
                        <b>
                          {names[connection.source] || "Unknown"} →{" "}
                          {names[connection.target] || "Unknown"}
                        </b>
                        <span>
                          {connection.label ||
                            connection.connectionType ||
                            "Unlabelled connection"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          ) : items.length ? (
            items.map((item) => (
              <article key={item.id}>
                <div>
                  <b>Version {item.site_version}</b>
                  <span>
                    {new Date(item.published_at).toLocaleString("en-AU")} ·{" "}
                    {item.published_by}
                  </span>
                  <p>{item.release_note || "No release note."}</p>
                </div>
                <div className="publication-actions">
                  <button
                    className="quiet"
                    disabled={busy}
                    onClick={() => void view(item)}
                  >
                    <Eye size={14} /> View
                  </button>
                  {canRestore && (
                    <button
                      className="quiet"
                      disabled={busy}
                      onClick={() =>
                        setActionDialog({
                          title: `Restore version ${item.site_version}?`,
                          message: `This replaces the current ${site.name} draft with the version published on ${new Date(item.published_at).toLocaleString("en-AU")}. Publication history remains available.`,
                          confirmLabel: "Restore version",
                          onConfirm: () => restore(item),
                        })
                      }
                    >
                      <RotateCcw size={14} /> Restore
                    </button>
                  )}
                </div>
              </article>
            ))
          ) : (
            <p className="empty-history">No published versions yet.</p>
          )}
        </div>
      </section>
      {actionDialog && (
        <ActionDialog
          request={actionDialog}
          onClose={() => setActionDialog(null)}
        />
      )}
    </div>
  );
}
