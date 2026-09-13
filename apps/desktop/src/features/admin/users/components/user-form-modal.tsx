import { Button } from "@cmis/ui/components/button";
import { cn } from "@cmis/ui/lib/utils";
import { Check, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import * as React from "react";

import {
  branchCrossfadeMs,
  materializeEnter,
  materializeEnterReduced,
  sheetSpring,
} from "@/lib/motion";
import type { AdminUser, UserDraft, UserRole } from "../types";
import { EMPTY_USER_DRAFT, USER_ROLES } from "../types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STEPS = ["Identity", "Role"] as const;

const ROLE_COPY: Record<UserRole, string> = {
  Admin: "Full oversight, including settings and audit.",
  Staff: "Counter operations.",
  Viewer: "Browse and request medicine only.",
};

function draftFromUser(user: AdminUser): UserDraft {
  return {
    email: user.email,
    name: user.name,
    password: "",
    role: user.role,
  };
}

/**
 * CMIS-UI-09 §1.4 — Create/Edit modal wizard (Identity → Role).
 * Validation is inline (00 §16: validate as you go, not on submit) and the
 * email uniqueness check runs live against the current roster.
 */
export function UserFormModal({
  open,
  onOpenChange,
  user,
  isEmailTaken,
  onConfirm,
  originRect,
}: {
  isEmailTaken: (email: string, excludeId?: string) => boolean;
  onConfirm: (draft: UserDraft) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  originRect?: DOMRect | null;
  user: AdminUser | null;
}) {
  const editing = user !== null;
  const [step, setStep] = React.useState(0);
  const [draft, setDraft] = React.useState<UserDraft>(EMPTY_USER_DRAFT);
  const [touched, setTouched] = React.useState<Record<string, boolean>>({});
  const reduceMotion = useReducedMotion();
  const variants = reduceMotion ? materializeEnterReduced : materializeEnter;

  React.useEffect(() => {
    if (open) {
      setStep(0);
      setDraft(user ? draftFromUser(user) : EMPTY_USER_DRAFT);
      setTouched({});
    }
  }, [open, user]);

  React.useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const nameError =
    draft.name.trim().length < 2 ? "Enter the user's full name." : null;
  const emailEmpty = draft.email.trim().length === 0;
  const emailMalformed = !(
    emailEmpty || EMAIL_PATTERN.test(draft.email.trim())
  );
  const emailTaken =
    !emailMalformed && isEmailTaken(draft.email, user?.id ?? undefined);
  const emailError = emailEmpty
    ? "Email is required."
    : emailMalformed
      ? "Enter a valid email address."
      : emailTaken
        ? "That email is already in use."
        : null;
  const passwordError =
    !editing && draft.password.length < 8
      ? "Use at least 8 characters."
      : draft.password.length > 0 && draft.password.length < 8
        ? "Use at least 8 characters."
        : null;

  const stepValid =
    step === 0 ? !(nameError || emailError || passwordError) : true;

  function update<K extends keyof UserDraft>(key: K, value: UserDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function handleNext() {
    setTouched((prev) => ({ ...prev, [`step-${step}`]: true }));
    if (!stepValid) {
      return;
    }
    setStep((prev) => Math.min(prev + 1, STEPS.length - 1));
  }

  function handleSubmit() {
    setTouched({ "step-0": true });
    if (nameError || emailError || passwordError) {
      setStep(0);
      return;
    }
    onConfirm(draft);
    onOpenChange(false);
  }

  const transformOrigin = "center center";

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            animate={{ opacity: 1 }}
            aria-hidden
            className="fixed inset-0 z-50 bg-black/32"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={() => onOpenChange(false)}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.18 }}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
            <motion.div
              animate="animate"
              aria-label={editing ? "Edit user" : "Create user"}
              aria-modal="true"
              className="surface-frosted flex w-full max-w-[480px] flex-col overflow-hidden rounded-xl border border-border/50 shadow-xl"
              exit="exit"
              initial="initial"
              role="dialog"
              style={{
                transformOrigin,
                willChange: reduceMotion
                  ? undefined
                  : "transform, opacity, filter",
              }}
              transition={reduceMotion ? { duration: 0 } : sheetSpring}
              variants={variants}
            >
              <div className="flex items-center justify-between border-border/50 border-b px-4 py-3">
                <div>
                  <h2 className="font-semibold text-foreground text-sm">
                    {editing ? `Edit ${user?.name}` : "Create user"}
                  </h2>
                  <p className="text-caption text-muted-foreground">
                    Step {step + 1} of {STEPS.length} — {STEPS[step]}
                  </p>
                </div>
                <Button
                  aria-label="Close"
                  className="press-feedback"
                  onClick={() => onOpenChange(false)}
                  size="icon-sm"
                  variant="ghost"
                >
                  <X className="size-4" />
                </Button>
              </div>

              <ol className="flex shrink-0 items-center gap-1 px-4 pt-3">
                {STEPS.map((label, index) => (
                  <li className="flex flex-1 items-center gap-1" key={label}>
                    <span
                      aria-current={index === step ? "step" : undefined}
                      className={cn(
                        "flex size-5 items-center justify-center rounded-full border font-semibold text-[10px]",
                        index < step
                          ? "border-primary bg-primary text-primary-foreground"
                          : index === step
                            ? "border-primary text-primary"
                            : "border-border text-muted-foreground"
                      )}
                    >
                      {index < step ? <Check className="size-3" /> : index + 1}
                    </span>
                    <span
                      className={cn(
                        "text-caption",
                        index === step
                          ? "text-foreground"
                          : "text-muted-foreground"
                      )}
                    >
                      {label}
                    </span>
                    {index < STEPS.length - 1 ? (
                      <span
                        aria-hidden
                        className="ml-1 h-px flex-1 bg-border"
                      />
                    ) : null}
                  </li>
                ))}
              </ol>

              <div className="min-h-[180px] p-4">
                <AnimatePresence mode="wait">
                  <motion.div
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    initial={{ opacity: 0 }}
                    key={step}
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { duration: branchCrossfadeMs / 1000 }
                    }
                  >
                    {step === 0 ? (
                      <div className="space-y-3">
                        <label className="block text-caption text-foreground">
                          Full name
                          <input
                            className={cn(
                              "mt-1 h-8 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring",
                              touched["step-0"] &&
                                nameError &&
                                "border-destructive"
                            )}
                            onChange={(event) =>
                              update("name", event.target.value)
                            }
                            value={draft.name}
                          />
                          {touched["step-0"] && nameError ? (
                            <span className="mt-1 block text-destructive">
                              {nameError}
                            </span>
                          ) : null}
                        </label>

                        <label className="block text-caption text-foreground">
                          Email
                          <input
                            className={cn(
                              "mt-1 h-8 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring",
                              touched["step-0"] &&
                                emailError &&
                                "border-destructive"
                            )}
                            onChange={(event) =>
                              update("email", event.target.value)
                            }
                            type="email"
                            value={draft.email}
                          />
                          {draft.email.trim() && !emailError ? (
                            <span className="mt-1 flex items-center gap-1 text-[var(--success)]">
                              <Check className="size-3" /> Email available
                            </span>
                          ) : null}
                          {touched["step-0"] && emailError ? (
                            <span className="mt-1 block text-destructive">
                              {emailError}
                            </span>
                          ) : null}
                        </label>

                        <label className="block text-caption text-foreground">
                          {editing
                            ? "New password (leave blank to keep current)"
                            : "Temporary password"}
                          <input
                            className={cn(
                              "mt-1 h-8 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring",
                              touched["step-0"] &&
                                passwordError &&
                                "border-destructive"
                            )}
                            onChange={(event) =>
                              update("password", event.target.value)
                            }
                            type="password"
                            value={draft.password}
                          />
                          {touched["step-0"] && passwordError ? (
                            <span className="mt-1 block text-destructive">
                              {passwordError}
                            </span>
                          ) : null}
                        </label>
                      </div>
                    ) : null}

                    {step === 1 ? (
                      <fieldset className="space-y-2">
                        <legend className="mb-2 text-caption text-foreground">
                          Assign a role
                        </legend>
                        {USER_ROLES.map((role) => (
                          <label
                            className={cn(
                              "flex cursor-pointer items-start gap-2 rounded-md border p-3",
                              draft.role === role
                                ? "border-primary/50 bg-primary/5"
                                : "border-border hover:bg-muted/50"
                            )}
                            key={role}
                          >
                            <input
                              checked={draft.role === role}
                              className="mt-0.5 accent-primary"
                              name="user-role"
                              onChange={() => update("role", role)}
                              type="radio"
                              value={role}
                            />
                            <span>
                              <span className="block font-medium text-foreground text-sm">
                                {role}
                              </span>
                              <span className="block text-caption text-muted-foreground">
                                {ROLE_COPY[role]}
                              </span>
                            </span>
                          </label>
                        ))}
                      </fieldset>
                    ) : null}
                  </motion.div>
                </AnimatePresence>
              </div>

              <div className="flex items-center justify-between gap-2 border-border/50 border-t px-4 py-3">
                <Button
                  className="press-feedback"
                  disabled={step === 0}
                  onClick={() => setStep((prev) => Math.max(0, prev - 1))}
                  size="sm"
                  variant="ghost"
                >
                  Back
                </Button>
                <div className="flex items-center gap-2">
                  <Button
                    className="press-feedback"
                    onClick={() => onOpenChange(false)}
                    size="sm"
                    variant="ghost"
                  >
                    Cancel
                  </Button>
                  {step < STEPS.length - 1 ? (
                    <Button
                      className="press-feedback"
                      onClick={handleNext}
                      size="sm"
                    >
                      Next
                    </Button>
                  ) : (
                    <Button
                      className="press-feedback"
                      onClick={handleSubmit}
                      size="sm"
                    >
                      {editing ? "Save changes" : "Create user"}
                    </Button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
