import { Button } from "@cmis/ui/components/button";
import { cn } from "@cmis/ui/lib/utils";
import { Check, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ChangeEvent, useCallback, useEffect, useState } from "react";

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
const FIELD_CLASS =
  "mt-1 h-8 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring";

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

function getEmailError(
  emailEmpty: boolean,
  emailMalformed: boolean,
  emailTaken: boolean
): string | null {
  if (emailEmpty) {
    return "Email is required.";
  }
  if (emailMalformed) {
    return "Enter a valid email address.";
  }
  if (emailTaken) {
    return "That email is already in use.";
  }
  return null;
}

function getPasswordError(
  editing: boolean,
  passwordLength: number
): string | null {
  if (passwordLength < 8 && (!editing || passwordLength > 0)) {
    return "Use at least 8 characters.";
  }
  return null;
}

interface DraftErrors {
  emailError: string | null;
  nameError: string | null;
  passwordError: string | null;
}

function deriveDraftErrors(
  draft: UserDraft,
  editing: boolean,
  isEmailTaken: (email: string, excludeId?: string) => boolean,
  userId?: string
): DraftErrors {
  const nameError =
    draft.name.trim().length < 2 ? "Enter the user's full name." : null;
  const emailEmpty = draft.email.trim().length === 0;
  const emailMalformed = !(
    emailEmpty || EMAIL_PATTERN.test(draft.email.trim())
  );
  const emailTaken = !emailMalformed && isEmailTaken(draft.email, userId);
  return {
    emailError: getEmailError(emailEmpty, emailMalformed, emailTaken),
    nameError,
    passwordError: getPasswordError(editing, draft.password.length),
  };
}

function useEscapeToClose(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
}

function stepCircleClass(index: number, step: number): string {
  if (index < step) {
    return "border-primary bg-primary text-primary-foreground";
  }
  if (index === step) {
    return "border-primary text-primary";
  }
  return "border-border text-muted-foreground";
}

function WizardHeader({
  editing,
  name,
  step,
  onClose,
}: {
  editing: boolean;
  name?: string;
  step: number;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-border/50 border-b px-4 py-3">
      <div>
        <h2 className="font-semibold text-foreground text-sm">
          {editing ? `Edit ${name}` : "Create user"}
        </h2>
        <p className="text-caption text-muted-foreground">
          Step {step + 1} of {STEPS.length} — {STEPS[step]}
        </p>
      </div>
      <Button
        aria-label="Close"
        className="press-feedback"
        onClick={onClose}
        size="icon-sm"
        variant="ghost"
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}

function WizardFooter({
  step,
  editing,
  onBack,
  onClose,
  onNext,
  onSubmit,
}: {
  step: number;
  editing: boolean;
  onBack: () => void;
  onClose: () => void;
  onNext: () => void;
  onSubmit: () => void;
}) {
  const isLastStep = step === STEPS.length - 1;
  return (
    <div className="flex items-center justify-between gap-2 border-border/50 border-t px-4 py-3">
      <Button
        className="press-feedback"
        disabled={step === 0}
        onClick={onBack}
        size="sm"
        variant="ghost"
      >
        Back
      </Button>
      <div className="flex items-center gap-2">
        <Button
          className="press-feedback"
          onClick={onClose}
          size="sm"
          variant="ghost"
        >
          Cancel
        </Button>
        {isLastStep ? (
          <Button className="press-feedback" onClick={onSubmit} size="sm">
            {editing ? "Save changes" : "Create user"}
          </Button>
        ) : (
          <Button className="press-feedback" onClick={onNext} size="sm">
            Next
          </Button>
        )}
      </div>
    </div>
  );
}

function StepIndicator({ step }: { step: number }) {
  return (
    <ol className="flex shrink-0 items-center gap-1 px-4 pt-3">
      {STEPS.map((label, index) => (
        <li className="flex flex-1 items-center gap-1" key={label}>
          <span
            aria-current={index === step ? "step" : undefined}
            className={cn(
              "flex size-5 items-center justify-center rounded-full border font-semibold text-[10px]",
              stepCircleClass(index, step)
            )}
          >
            {index < step ? <Check className="size-3" /> : index + 1}
          </span>
          <span
            className={cn(
              "text-caption",
              index === step ? "text-foreground" : "text-muted-foreground"
            )}
          >
            {label}
          </span>
          {index < STEPS.length - 1 ? (
            <span aria-hidden className="ml-1 h-px flex-1 bg-border" />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function FieldError({ message }: { message: string | null }) {
  if (message === null) {
    return null;
  }
  return <span className="mt-1 block text-destructive">{message}</span>;
}

function IdentityStep({
  draft,
  editing,
  touched,
  nameError,
  emailError,
  passwordError,
  onUpdate,
}: {
  draft: UserDraft;
  editing: boolean;
  touched: Record<string, boolean>;
  nameError: string | null;
  emailError: string | null;
  passwordError: string | null;
  onUpdate: <K extends keyof UserDraft>(key: K, value: UserDraft[K]) => void;
}) {
  const showErrors = touched["step-0"] === true;

  const handleNameChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      onUpdate("name", event.target.value),
    [onUpdate]
  );
  const handleEmailChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      onUpdate("email", event.target.value),
    [onUpdate]
  );
  const handlePasswordChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      onUpdate("password", event.target.value),
    [onUpdate]
  );

  return (
    <div className="space-y-3">
      <label className="block text-caption text-foreground">
        Full name
        <input
          className={cn(
            FIELD_CLASS,
            showErrors && nameError && "border-destructive"
          )}
          onChange={handleNameChange}
          value={draft.name}
        />
        {showErrors ? <FieldError message={nameError} /> : null}
      </label>

      <label className="block text-caption text-foreground">
        Email
        <input
          className={cn(
            FIELD_CLASS,
            showErrors && emailError && "border-destructive"
          )}
          onChange={handleEmailChange}
          type="email"
          value={draft.email}
        />
        {draft.email.trim() && !emailError ? (
          <span className="mt-1 flex items-center gap-1 text-[var(--success)]">
            <Check className="size-3" /> Email available
          </span>
        ) : null}
        {showErrors ? <FieldError message={emailError} /> : null}
      </label>

      <label className="block text-caption text-foreground">
        {editing
          ? "New password (leave blank to keep current)"
          : "Temporary password"}
        <input
          className={cn(
            FIELD_CLASS,
            showErrors && passwordError && "border-destructive"
          )}
          onChange={handlePasswordChange}
          type="password"
          value={draft.password}
        />
        {showErrors ? <FieldError message={passwordError} /> : null}
      </label>
    </div>
  );
}

function RoleOption({
  role,
  selected,
  onSelectRole,
}: {
  role: UserRole;
  selected: boolean;
  onSelectRole: (role: UserRole) => void;
}) {
  const handleSelect = useCallback(
    () => onSelectRole(role),
    [onSelectRole, role]
  );

  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-2 rounded-md border p-3",
        selected
          ? "border-primary/50 bg-primary/5"
          : "border-border hover:bg-muted/50"
      )}
    >
      <input
        checked={selected}
        className="mt-0.5 accent-primary"
        name="user-role"
        onChange={handleSelect}
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
  );
}

function RoleStep({
  role,
  onSelectRole,
}: {
  role: UserRole;
  onSelectRole: (role: UserRole) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-caption text-foreground">
        Assign a role
      </legend>
      {USER_ROLES.map((option) => (
        <RoleOption
          key={option}
          onSelectRole={onSelectRole}
          role={option}
          selected={role === option}
        />
      ))}
    </fieldset>
  );
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
  originRect: _originRect,
}: {
  isEmailTaken: (email: string, excludeId?: string) => boolean;
  onConfirm: (draft: UserDraft) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  originRect?: DOMRect | null;
  user: AdminUser | null;
}) {
  const editing = user !== null;
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<UserDraft>(EMPTY_USER_DRAFT);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const reduceMotion = useReducedMotion();
  const variants = reduceMotion ? materializeEnterReduced : materializeEnter;

  useEffect(() => {
    if (open) {
      setStep(0);
      setDraft(user ? draftFromUser(user) : EMPTY_USER_DRAFT);
      setTouched({});
    }
  }, [open, user]);

  const handleClose = useCallback(() => onOpenChange(false), [onOpenChange]);
  useEscapeToClose(open, handleClose);

  const { emailError, nameError, passwordError } = deriveDraftErrors(
    draft,
    editing,
    isEmailTaken,
    user?.id ?? undefined
  );

  const stepValid =
    step === 0 ? !(nameError || emailError || passwordError) : true;

  const handleUpdate = useCallback(
    <K extends keyof UserDraft>(key: K, value: UserDraft[K]) => {
      setDraft((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const handleSelectRole = useCallback((role: UserRole) => {
    setDraft((prev) => ({ ...prev, role }));
  }, []);

  const handleBack = useCallback(() => {
    setStep((prev) => Math.max(0, prev - 1));
  }, []);

  const handleNext = useCallback(() => {
    setTouched((prev) => ({ ...prev, [`step-${step}`]: true }));
    if (!stepValid) {
      return;
    }
    setStep((prev) => Math.min(prev + 1, STEPS.length - 1));
  }, [step, stepValid]);

  const handleSubmit = useCallback(() => {
    setTouched({ "step-0": true });
    if (nameError || emailError || passwordError) {
      setStep(0);
      return;
    }
    onConfirm(draft);
    onOpenChange(false);
  }, [draft, emailError, nameError, onConfirm, onOpenChange, passwordError]);

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
            onClick={handleClose}
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
              <WizardHeader
                editing={editing}
                name={user?.name}
                onClose={handleClose}
                step={step}
              />

              <StepIndicator step={step} />

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
                      <IdentityStep
                        draft={draft}
                        editing={editing}
                        emailError={emailError}
                        nameError={nameError}
                        onUpdate={handleUpdate}
                        passwordError={passwordError}
                        touched={touched}
                      />
                    ) : null}

                    {step === 1 ? (
                      <RoleStep
                        onSelectRole={handleSelectRole}
                        role={draft.role}
                      />
                    ) : null}
                  </motion.div>
                </AnimatePresence>
              </div>

              <WizardFooter
                editing={editing}
                onBack={handleBack}
                onClose={handleClose}
                onNext={handleNext}
                onSubmit={handleSubmit}
                step={step}
              />
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
