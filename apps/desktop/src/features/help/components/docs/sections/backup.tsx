import {
  DocsCallout,
  DocsP,
  DocsRoute,
  DocsSection,
  DocsStep,
  DocsSteps,
  DocsSubHeading,
} from "../docs-primitives";

export function BackupSection() {
  return (
    <DocsSection id="backup-restore" title="Backup & Restore">
      <DocsP>
        Once a day, the first time you open the app, it writes a complete copy
        of its database into a folder called{" "}
        <span className="font-medium text-foreground">CMIS Backups</span> inside
        your Documents. You never have to remember — the file is simply there,
        and the same app can read it back.
      </DocsP>

      <DocsSubHeading>Where the copies live</DocsSubHeading>
      <DocsP>
        Every daily copy is named for its date, and a copy you make by hand
        carries the time too. The newest ten daily copies are kept; anything you
        made by hand is never deleted by the app. If a backup ever fails, a
        banner stays on every page until one succeeds — success itself is
        silent.
      </DocsP>

      <DocsSubHeading>Making a copy by hand</DocsSubHeading>
      <DocsP>
        <span className="font-medium text-foreground">Back up now</span> writes
        a copy immediately, and{" "}
        <span className="font-medium text-foreground">Save a copy…</span> lets
        you put one on a USB stick or a shared folder — that hand-carried copy
        is what actually gets your data off the machine. Both live in{" "}
        <DocsRoute to="/admin/settings">Settings → Backup</DocsRoute>, which
        also lists every copy with its date and size.
      </DocsP>

      <DocsSubHeading>Restoring a copy</DocsSubHeading>
      <DocsSteps>
        <DocsStep title="Pick the copy.">
          Choose Restore beside any listed copy, or “Restore from a backup…” for
          a file on a USB stick.
        </DocsStep>
        <DocsStep title="Let it be checked.">
          The file is opened read-only first: damaged files, files that are not
          CMIS backups, and files made by a newer app are refused, and the
          current data is never touched by a refusal.
        </DocsStep>
        <DocsStep title="Confirm, then restart.">
          Restoring replaces the current database entirely — anything recorded
          since the copy is lost — so it asks you to type RESTORE, then restarts
          the app on the restored data.
        </DocsStep>
      </DocsSteps>

      <DocsCallout title="Wiping writes a copy first" tone="warning">
        Wipe All Data always writes a safety backup before deleting anything. If
        that backup fails, the wipe does not run.
      </DocsCallout>
    </DocsSection>
  );
}
