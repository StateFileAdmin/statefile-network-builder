import { useEffect, useState } from "react";
import { History, RotateCcw, X } from "lucide-react";
import type { Site } from "../types";
import { authenticatedFetch } from "../data/storage";
import { ActionDialog, type ActionDialogRequest } from "./ActionDialog";
import "./PublishDialog.css";

interface Publication {
  id: number;
  register_version: number;
  release_note: string;
  published_at: string;
  published_by: string;
}

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
          {items.length ? (
            items.map((item) => (
              <article key={item.id}>
                <div>
                  <b>Version {item.register_version}</b>
                  <span>
                    {new Date(item.published_at).toLocaleString("en-AU")} ·{" "}
                    {item.published_by}
                  </span>
                  <p>{item.release_note || "No release note."}</p>
                </div>
                {canRestore && (
                  <button
                    className="quiet"
                    disabled={busy}
                    onClick={() =>
                      setActionDialog({
                        title: `Restore version ${item.register_version}?`,
                        message: `This replaces the current ${site.name} draft with the version published on ${new Date(item.published_at).toLocaleString("en-AU")}. Publication history remains available.`,
                        confirmLabel: "Restore version",
                        onConfirm: () => restore(item),
                      })
                    }
                  >
                    <RotateCcw size={14} /> Restore
                  </button>
                )}
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
