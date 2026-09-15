"use client";

import { Button } from "@cmis/ui/components/button";
import { Checkbox } from "@cmis/ui/components/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@cmis/ui/components/dialog";
import { Input } from "@cmis/ui/components/input";
import { Label } from "@cmis/ui/components/label";
import { Textarea } from "@cmis/ui/components/textarea";
import { Bug } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import { useUpdaterOptional } from "@/features/updater/use-updater";
import { openExternal } from "@/lib/open-external";

import {
  AREA_OPTIONS,
  buildIssueUrl,
  clampField,
  DEFAULT_SEVERITY,
  hasErrors,
  type IssueDraft,
  type IssueDraftErrors,
  MAX_FIELD_LENGTH,
  SEVERITY_OPTIONS,
  validateIssueDraft,
} from "../lib/github-issue-url";
import { detectPlatform, PLATFORM_OPTIONS } from "../lib/platform-info";

const FOOTER_NOTE = "Opens github.com in your browser — requires internet.";
const OPEN_FAILURE_TOAST =
  "Couldn't open your browser. A connection is required to submit an issue.";
const UNKNOWN_VERSION = "unknown";
/** Counter turns amber past this share of the cap so the ceiling is never a surprise. */
const COUNTER_WARN_RATIO = 0.9;

type TextFieldId = "summary" | "repro" | "expected" | "actual";

const EMPTY_TEXT_FIELDS: Record<TextFieldId, string> = {
  actual: "",
  expected: "",
  repro: "",
  summary: "",
};

/**
 * Version shown in the report: the updater's already-resolved version first
 * (no extra round-trip), then `getVersion()` from the Tauri app API, then a
 * literal fallback for browser dev.
 */
function useAppVersion(currentVersion: string | null | undefined): string {
  const [fallback, setFallback] = useState<string>(UNKNOWN_VERSION);

  useEffect(() => {
    if (currentVersion) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { getVersion } = await import("@tauri-apps/api/app");
        const version = await getVersion();
        if (!cancelled && version) {
          setFallback(version);
        }
      } catch {
        // browser dev preview — keep the literal fallback
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentVersion]);

  return currentVersion ?? fallback;
}

/**
 * Screen-reader status line for the form.
 *
 * Empty before the first submit attempt — announcing "all fields complete"
 * before the user has typed anything would be a lie.
 */
function statusMessage(submitAttempted: boolean, showErrors: boolean): string {
  if (!submitAttempted) {
    return "";
  }
  return showErrors
    ? "Some required fields need attention."
    : "All required fields are complete.";
}

function FieldShell({
  children,
  controlId,
  error,
  hint,
  label,
  required,
}: {
  children: React.ReactNode;
  controlId: string;
  error?: string;
  hint?: React.ReactNode;
  label: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="font-medium" htmlFor={controlId}>
          {label}
          {required ? (
            <>
              <span aria-hidden className="text-destructive">
                *
              </span>
              <span className="sr-only"> (required)</span>
            </>
          ) : null}
        </Label>
        {hint}
      </div>
      {children}
      {error ? (
        <p
          className="text-[11px] text-destructive"
          id={`${controlId}-error`}
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * One area row — its own component so the change handler stays referentially
 * stable across the 14 options.
 */
function AreaOption({
  area,
  checked,
  id,
  onToggle,
}: {
  area: string;
  checked: boolean;
  id: string;
  onToggle: (area: string, checked: boolean) => void;
}) {
  const handleChange = useCallback(
    (isChecked: boolean) => onToggle(area, isChecked),
    [area, onToggle]
  );

  return (
    <div className="flex items-center gap-2">
      <Checkbox checked={checked} id={id} onCheckedChange={handleChange} />
      <Label
        className="min-w-0 flex-1 cursor-pointer text-[11.5px] leading-tight"
        htmlFor={id}
      >
        {area}
      </Label>
    </div>
  );
}

function areaOptionId(groupId: string, area: string): string {
  const slug = area
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "");
  return `${groupId}-${slug}`;
}

/**
 * Checkbox list for the template's `multiple: true` area dropdown.
 *
 * A `<fieldset>`/`<legend>` pair keeps the group properly labelled for screen
 * readers and lets a failed submit move focus to the group itself.
 */
function AreaGroup({
  areas,
  error,
  groupRef,
  id,
  onToggle,
}: {
  areas: string[];
  error?: string;
  groupRef: React.RefObject<HTMLFieldSetElement | null>;
  id: string;
  onToggle: (area: string, checked: boolean) => void;
}) {
  return (
    <fieldset
      aria-describedby={error ? `${id}-error` : undefined}
      aria-invalid={Boolean(error)}
      className="rounded-[var(--radius-field)] border border-input p-2 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20"
      id={id}
      ref={groupRef}
      tabIndex={-1}
    >
      <legend className="px-1 font-medium text-xs">
        Area / Module
        <span aria-hidden className="text-destructive">
          *
        </span>
        <span className="sr-only"> (required)</span>
      </legend>
      <div className="grid max-h-36 grid-cols-1 gap-x-3 gap-y-1 overflow-y-auto sm:grid-cols-2">
        {AREA_OPTIONS.map((area) => (
          <AreaOption
            area={area}
            checked={areas.includes(area)}
            id={areaOptionId(id, area)}
            key={area}
            onToggle={onToggle}
          />
        ))}
      </div>
      {error ? (
        <p
          className="text-[11px] text-destructive"
          id={`${id}-error`}
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

function CharacterCounter({ value }: { value: string }) {
  const { length } = clampField(value);
  const nearCap = length >= MAX_FIELD_LENGTH * COUNTER_WARN_RATIO;
  return (
    <span
      aria-hidden
      className={
        nearCap
          ? "text-[10.5px] text-warning-foreground tabular-nums"
          : "text-[10.5px] text-muted-foreground tabular-nums"
      }
    >
      {length}/{MAX_FIELD_LENGTH}
    </span>
  );
}

/**
 * Report Issue dialog — pre-fills GitHub's structured bug form and hands the
 * URL to the system browser.
 *
 * Controls are native form elements (select / checkbox / input / textarea)
 * rather than portalled menu popups: everything stays inside the dialog's focus
 * trap, which matters for keyboard and screen-reader users.
 */
export function ReportIssueDialog({
  open,
  onOpenChange,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const updater = useUpdaterOptional();
  const appVersion = useAppVersion(updater?.currentVersion);
  const groupId = useId();

  const [areas, setAreas] = useState<string[]>([]);
  const [severity, setSeverity] = useState<string>(DEFAULT_SEVERITY);
  const [platform, setPlatform] = useState<string>(
    () => detectPlatform() ?? PLATFORM_OPTIONS[0]
  );
  const [text, setText] =
    useState<Record<TextFieldId, string>>(EMPTY_TEXT_FIELDS);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const areaGroupRef = useRef<HTMLFieldSetElement>(null);
  const summaryRef = useRef<HTMLInputElement>(null);
  const reproRef = useRef<HTMLTextAreaElement>(null);
  const expectedRef = useRef<HTMLTextAreaElement>(null);
  const actualRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setSubmitAttempted(false);
      setSubmitting(false);
    }
  }, [open]);

  const draft = useMemo<IssueDraft>(
    () => ({
      actual: text.actual,
      appVersion,
      areas,
      expected: text.expected,
      platform,
      repro: text.repro,
      severity,
      summary: text.summary,
    }),
    [appVersion, areas, platform, severity, text]
  );

  // Errors appear on the first submit attempt, then track edits live.
  const errors = useMemo<IssueDraftErrors>(
    () => (submitAttempted ? validateIssueDraft(draft) : {}),
    [draft, submitAttempted]
  );

  const setTextField = useCallback((id: TextFieldId, value: string) => {
    setText((prev) => ({ ...prev, [id]: value }));
  }, []);

  const handleSeverityChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      setSeverity(event.target.value);
    },
    []
  );

  const handlePlatformChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      setPlatform(event.target.value);
    },
    []
  );

  const handleSummaryChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setTextField("summary", event.target.value);
    },
    [setTextField]
  );

  const handleReproChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      setTextField("repro", event.target.value);
    },
    [setTextField]
  );

  const handleExpectedChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      setTextField("expected", event.target.value);
    },
    [setTextField]
  );

  const handleActualChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      setTextField("actual", event.target.value);
    },
    [setTextField]
  );

  const toggleArea = useCallback((area: string, checked: boolean) => {
    setAreas((prev) =>
      checked ? [...prev, area] : prev.filter((item) => item !== area)
    );
  }, []);

  const focusFirstInvalid = useCallback((next: IssueDraftErrors) => {
    if (next.areas) {
      areaGroupRef.current?.focus();
    } else if (next.summary) {
      summaryRef.current?.focus();
    } else if (next.repro) {
      reproRef.current?.focus();
    } else if (next.expected) {
      expectedRef.current?.focus();
    } else if (next.actual) {
      actualRef.current?.focus();
    }
  }, []);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const next = validateIssueDraft(draft);
      setSubmitAttempted(true);
      if (hasErrors(next)) {
        focusFirstInvalid(next);
        return;
      }

      setSubmitting(true);
      const opened = await openExternal(buildIssueUrl(draft));
      setSubmitting(false);

      if (!opened) {
        toast.error(OPEN_FAILURE_TOAST, { id: "report-issue-open-failed" });
        return;
      }

      setAreas([]);
      setText(EMPTY_TEXT_FIELDS);
      setSeverity(DEFAULT_SEVERITY);
      onOpenChange(false);
    },
    [draft, focusFirstInvalid, onOpenChange]
  );

  const showErrors = submitAttempted && hasErrors(errors);
  const liveMessage = statusMessage(submitAttempted, showErrors);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Report an Issue</DialogTitle>
          <DialogDescription>
            We&apos;ll open GitHub with your details already filled in. Nothing
            is sent from the app itself.
          </DialogDescription>
        </DialogHeader>

        <form
          aria-busy={submitting}
          className="max-h-[62vh] space-y-3 overflow-y-auto pr-1"
          noValidate
          onSubmit={handleSubmit}
        >
          <AreaGroup
            areas={areas}
            error={errors.areas}
            groupRef={areaGroupRef}
            id={`${groupId}-area`}
            onToggle={toggleArea}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <FieldShell
              controlId={`${groupId}-severity`}
              label="Severity"
              required
            >
              <select
                className="h-8 w-full rounded-[var(--radius-field)] border border-input bg-transparent px-2.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 dark:bg-input/30"
                id={`${groupId}-severity`}
                onChange={handleSeverityChange}
                value={severity}
              >
                {SEVERITY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </FieldShell>

            <FieldShell
              controlId={`${groupId}-platform`}
              label="Platform"
              required
            >
              <select
                className="h-8 w-full rounded-[var(--radius-field)] border border-input bg-transparent px-2.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 dark:bg-input/30"
                id={`${groupId}-platform`}
                onChange={handlePlatformChange}
                value={platform}
              >
                {PLATFORM_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </FieldShell>
          </div>

          <FieldShell
            controlId={`${groupId}-summary`}
            error={errors.summary}
            hint={<CharacterCounter value={text.summary} />}
            label="Summary"
            required
          >
            <Input
              aria-describedby={
                errors.summary ? `${groupId}-summary-error` : undefined
              }
              aria-invalid={Boolean(errors.summary)}
              id={`${groupId}-summary`}
              maxLength={MAX_FIELD_LENGTH}
              onChange={handleSummaryChange}
              placeholder="One sentence: what went wrong?"
              ref={summaryRef}
              value={text.summary}
            />
          </FieldShell>

          <FieldShell
            controlId={`${groupId}-repro`}
            error={errors.repro}
            hint={<CharacterCounter value={text.repro} />}
            label="Steps to Reproduce"
            required
          >
            <Textarea
              aria-describedby={
                errors.repro ? `${groupId}-repro-error` : undefined
              }
              aria-invalid={Boolean(errors.repro)}
              className="min-h-24"
              id={`${groupId}-repro`}
              maxLength={MAX_FIELD_LENGTH}
              onChange={handleReproChange}
              placeholder={"1. Go to Inventory\n2. Add a batch…"}
              ref={reproRef}
              value={text.repro}
            />
          </FieldShell>

          <div className="grid gap-3 sm:grid-cols-2">
            <FieldShell
              controlId={`${groupId}-expected`}
              error={errors.expected}
              hint={<CharacterCounter value={text.expected} />}
              label="Expected Result"
              required
            >
              <Textarea
                aria-describedby={
                  errors.expected ? `${groupId}-expected-error` : undefined
                }
                aria-invalid={Boolean(errors.expected)}
                className="min-h-20"
                id={`${groupId}-expected`}
                maxLength={MAX_FIELD_LENGTH}
                onChange={handleExpectedChange}
                ref={expectedRef}
                value={text.expected}
              />
            </FieldShell>

            <FieldShell
              controlId={`${groupId}-actual`}
              error={errors.actual}
              hint={<CharacterCounter value={text.actual} />}
              label="Actual Result"
              required
            >
              <Textarea
                aria-describedby={
                  errors.actual ? `${groupId}-actual-error` : undefined
                }
                aria-invalid={Boolean(errors.actual)}
                className="min-h-20"
                id={`${groupId}-actual`}
                maxLength={MAX_FIELD_LENGTH}
                onChange={handleActualChange}
                ref={actualRef}
                value={text.actual}
              />
            </FieldShell>
          </div>

          <FieldShell controlId={`${groupId}-version`} label="App version">
            <Input
              className="font-mono"
              id={`${groupId}-version`}
              readOnly
              value={appVersion}
            />
          </FieldShell>

          <DialogFooter className="items-center gap-2 sm:justify-between">
            <p className="text-[11px] text-muted-foreground leading-snug">
              {FOOTER_NOTE}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <DialogClose render={<Button type="button" variant="outline" />}>
                Cancel
              </DialogClose>
              <Button
                className="press-feedback"
                disabled={submitting}
                type="submit"
                variant="confirm"
              >
                <Bug className="size-3.5" />
                {submitting ? "Opening…" : "Open GitHub Issue"}
              </Button>
            </div>
          </DialogFooter>

          <p aria-live="polite" className="sr-only">
            {liveMessage}
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
