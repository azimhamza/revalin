'use client';

import { useState } from 'react';
import { CheckCircle2, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  accountFieldClass,
  accountIconTileClass,
  accountInsetClass,
  accountMutedPanelClass,
  accountPanelClass,
  accountPrimaryButtonClass,
} from '../account-theme';
import { getApiErrorMessage, readJsonSafely } from '@/lib/api/client';

export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [passwordExists, setPasswordExists] = useState(hasPassword);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch('/api/account/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: passwordExists ? currentPassword : undefined,
          newPassword,
        }),
      });
      const payload = await readJsonSafely(response);

      if (!response.ok) {
        setError(getApiErrorMessage(payload, 'Unable to update password.'));
        return;
      }

      setPasswordExists(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess(
        passwordExists
          ? 'Password updated successfully.'
          : 'Password created successfully.',
      );
    } catch {
      setError('Unable to update password.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className={`${accountPanelClass} p-5 sm:p-6`}>
      <div className="grid gap-5 lg:grid-cols-[0.78fr_1fr]">
        <div className={`${accountMutedPanelClass} p-5`}>
          <div className={`${accountIconTileClass} rounded-none`}>
            <KeyRound className="size-5 text-[#0B2E2F]" />
          </div>

          <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/45">
            Password access
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#0B2E2F]">
            {passwordExists ? 'Change your password' : 'Create a password'}
          </h2>
          <p className="mt-3 text-sm leading-6 text-foreground/58">
            {passwordExists
              ? 'Use your current password once, then save a new one for future sign-ins.'
              : 'Add a password to this account so you can sign in directly with email and password.'}
          </p>

          <div className={`mt-5 space-y-3 ${accountInsetClass} p-4`}>
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#0B2E2F]" />
              <p className="text-sm leading-6 text-foreground/60">
                Password resets now revoke existing sessions. If you forgot your current password, use the account recovery code flow from the sign-in page.
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className={`${accountInsetClass} p-5`}>
          <div className="border-b border-[#0B2E2F]/10 pb-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/45">
              Security
            </p>
            <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[#0B2E2F]">
              {passwordExists ? 'Update your credentials' : 'Set a password'}
            </h3>
            <p className="mt-2 text-sm leading-6 text-foreground/58">
              Passwords must be at least 8 characters long.
            </p>
          </div>

          <div className="mt-5 space-y-4">
            {passwordExists ? (
              <div className="space-y-1.5">
                <Label htmlFor="current-password">Current password</Label>
                <Input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  autoComplete="current-password"
                  minLength={8}
                  required
                  className={accountFieldClass}
                />
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="new-password">
                {passwordExists ? 'New password' : 'Password'}
              </Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                className={accountFieldClass}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                className={accountFieldClass}
              />
            </div>

            {error ? (
              <div className="rounded-none border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {error}
              </div>
            ) : null}

            {success ? (
              <div className="flex items-start gap-2 rounded-none border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                <span>{success}</span>
              </div>
            ) : null}

            <Button
              type="submit"
              className={`h-11 px-5 text-sm font-semibold ${accountPrimaryButtonClass}`}
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving...
                </>
              ) : passwordExists ? (
                'Change password'
              ) : (
                'Create password'
              )}
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
