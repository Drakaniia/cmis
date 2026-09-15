import { Button } from "@cmis/ui/components/button";
import { cn } from "@cmis/ui/lib/utils";
import { Check, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ChangeEvent, useCallback, useEffect, useState } from "react";

import {
  materializeEnter,
  materializeEnterReduced,
  sheetSpring,
} from "@/lib/motion";
import type { AdminUser, UserDraft } from "../types";
import { EMPTY_USER_DRAFT } from "../types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FIELD_CLASS =
  "mt-1 h-8 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring";

function draftFromUser(user: AdminUser): UserDraft {
  return {
    email: user.email,
    name: user.name,
    password: "",
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

function WizardHeader({
  editing,
  name,
  onClose,
}: {
  editing: boolean;
  name?: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-border/50 border-b px-4 py-3">
      <div>
        <h2 className="font-semibold text-foreground text-sm">
          {editing ? `Edit ${name}` : "Create user"}
        </h2>
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
  editing,
  onClose,
  onSubmit,
}: {
  editing: boolean;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-border/50 border-t px-4 py-3">
      <Button
        className="press-feedback"
        onClick={onClose}
        size="sm"
        variant="ghost"
      >
        Cancel
      </Button>
      <Button className="press-feedback" onClick={onSubmit} size="sm">
        {editing ? "Save changes" : "Create user"}
      </Button>
    </div>
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
  const showErrors = touched.identity === true;

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

/**
 * CMIS-UI-09 §1.4 — Create/Edit modal (single step; Role step removed
 * 2026-09-15 for the single-user app).
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
  const [draft, setDraft] = useState<UserDraft>(EMPTY_USER_DRAFT);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const reduceMotion = useReducedMotion();
  const variants = reduceMotion ? materializeEnterReduced : materializeEnter;

  useEffect(() => {
    if (open) {
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

  const handleUpdate = useCallback(
    <K extends keyof UserDraft>(key: K, value: UserDraft[K]) => {
      setDraft((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const handleSubmit = useCallback(() => {
    setTouched({ identity: true });
    if (nameError || emailError || passwordError) {
      return;
    }
    onConfirm(draft);
    onOpenChange(false);
  }, [draft, emailError, nameError, onConfirm, onOpenChange, passwordError]);

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
              />

              <div className="min-h-[180px] p-4">
                <IdentityStep
                  draft={draft}
                  editing={editing}
                  emailError={emailError}
                  nameError={nameError}
                  onUpdate={handleUpdate}
                  passwordError={passwordError}
                  touched={touched}
                />
              </div>

              <WizardFooter
                editing={editing}
                onClose={handleClose}
                onSubmit={handleSubmit}
              />
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
