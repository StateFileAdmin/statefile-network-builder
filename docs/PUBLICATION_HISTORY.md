# Deleting publication history

Administrators can delete an individual publication from the history dialog. The confirmation identifies its version, location and publication time. Cancelling preserves it. Deleting does not change the current draft, other publications, or automatic register revision backups.

The hosted DELETE endpoint requires an authenticated administrator and a valid CSRF request. A missing/deleted publication returns 404. Deleted entries cannot be listed, viewed or restored.

Deletion clears the publication snapshot, release note, publisher, timestamp and register version. A minimal internal row containing its ID and location remains to preserve the existing per-location numbering. New publications continue the sequence, even after deleting the most recent or all visible entries. Local browser mode uses an equivalent empty numbering slot.

This is removal of an application checkpoint, not a purge of independently held database backups or exported files. No real history was deleted during implementation or testing. Changes are local and not deployed.

Checks: node tests/publication-delete.cjs; npm run typecheck; npm run build. SQL checks cover snapshot removal, numbering and location isolation; isolated browser checks cover cancellation, deletion and unchanged draft data.
