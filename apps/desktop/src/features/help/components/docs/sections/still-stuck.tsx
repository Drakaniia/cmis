"use client";

import { Button } from "@cmis/ui/components/button";
import { Bug, ExternalLink } from "lucide-react";
import { useCallback } from "react";

import { openExternal } from "@/lib/open-external";

import { useHelpDialogs } from "../../../help-dialogs-context";
import { REPO_URL } from "../../../lib/github-issue-url";
import { DocsCallout, DocsP, DocsSection } from "../docs-primitives";

export function StillStuckSection() {
  const { openReportIssue } = useHelpDialogs();

  const handleOpenRepo = useCallback(async () => {
    await openExternal(REPO_URL);
  }, []);

  return (
    <DocsSection id="still-stuck" title="Still stuck?">
      <DocsP>
        If something here does not match what you see on screen, or a page
        refuses to do what this guide says it should, send it to us. A report
        with the exact steps is worth more than a description of the symptom.
      </DocsP>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          className="press-feedback"
          onClick={openReportIssue}
          variant="confirm"
        >
          <Bug className="size-3.5" />
          Report an Issue…
        </Button>
        <Button
          className="press-feedback"
          onClick={handleOpenRepo}
          variant="outline"
        >
          <ExternalLink className="size-3.5" />
          Open the project on GitHub
        </Button>
      </div>
      <DocsCallout title="What to include">
        The area of the app, what you expected, what happened instead, and the
        steps in between. The form fills in your app version and platform
        automatically, so you do not need to look them up.
      </DocsCallout>
      <DocsP>
        Reporting needs an internet connection: the form opens GitHub in your
        browser. Everything else in this guide works offline.
      </DocsP>
    </DocsSection>
  );
}
