import {
  DocsCallout,
  DocsP,
  DocsRoute,
  DocsSection,
  DocsStep,
  DocsSteps,
  DocsSubHeading,
} from "../docs-primitives";

export function DataSection() {
  return (
    <DocsSection id="data-import" title="Data & Imports">
      <DocsP>
        <DocsRoute to="/admin/data">Data → Import</DocsRoute> brings inventory
        workbooks into the database. Dropping a file shows a preview first — the
        preview never writes anything. Nothing changes until you confirm.
      </DocsP>

      <DocsSubHeading>Import an inventory workbook</DocsSubHeading>
      <DocsSteps>
        <DocsStep title="Pick the file.">
          Drag an `.xlsx` or `.csv` workbook onto the drop zone, or choose
          Browse files. The workbook layout matches the Stock Report export, so
          an export re-imports cleanly.
        </DocsStep>
        <DocsStep title="Read the preview.">
          The card counts inserts against updates, shows which dispensing month
          the grid days land in, and lists up to five warnings with a three-row
          sample. A month chip names the dispensing month read from the file
          name.
        </DocsStep>
        <DocsStep title="Confirm.">
          Choose Confirm import, then type IMPORT. The app snapshots the current
          tables first, then overwrites with the workbook and reports how many
          rows were new, updated, or need details.
        </DocsStep>
      </DocsSteps>

      <DocsCallout title="Put the month in the file name">
        The dispensing month comes from the file name. Without one the preview
        warns you and falls back to a month — rename the file or check the chip
        before confirming.
      </DocsCallout>

      <DocsSubHeading>Files that do not import</DocsSubHeading>
      <DocsP>
        A `.db` file is a database backup, not an import. In the desktop app it
        skips the preview and opens{" "}
        <DocsRoute to="/admin/settings">Settings → Backup</DocsRoute> Restore
        with that file pre-selected. A `.json` file (or anything else) only
        previews — confirming reports Nothing imported and writes no rows.
      </DocsP>

      <DocsCallout title="Confirming overwrites" tone="warning">
        Confirming an inventory import overwrites the current data. The dialog
        backs up the database first and a failed import restores its snapshot —
        still, check the insert and update counts before you type IMPORT.
      </DocsCallout>
    </DocsSection>
  );
}
