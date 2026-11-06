'use client'

import * as React from 'react'

import { Fingerprint, Loader2, Plus, ShieldCheck, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  bioSupported,
  fingerprintRegister,
  getBioStatus,
  removeCredential,
  setBioPreference,
  type BioStatus,
} from '@/lib/hajira-client'
import { fmtDateTime, useHajiraToasts } from '@/components/hajira/shared'

/**
 * "Fingerprint sign-in & check-in" management card — shared by the student
 * Profile tab and the teacher dashboard.
 *
 * Registering saves a WebAuthn passkey on THIS device: the fingerprint (or
 * face/PIN) never leaves the phone — the server only keeps a public key.
 * After registering, the user can:
 *   - sign in with the sensor instead of phone + password
 *   - (students) require the sensor at every check-in
 */
export default function FingerprintCard({ role = 'STUDENT' }: { role?: 'TEACHER' | 'STUDENT' }) {
  const { ok, err } = useHajiraToasts()
  const supported = React.useMemo(() => bioSupported(), [])
  const [status, setStatus] = React.useState<BioStatus | null>(null)
  const [busy, setBusy] = React.useState<'register' | 'toggle' | `del-${string}` | null>(null)

  const load = React.useCallback(async () => {
    try {
      setStatus(await getBioStatus())
    } catch {
      // Card is optional decoration — a failed status fetch just hides detail
      setStatus(null)
    }
  }, [])

  React.useEffect(() => {
    if (supported) load()
  }, [supported, load])

  const register = async () => {
    setBusy('register')
    try {
      await fingerprintRegister()
      ok('Fingerprint saved', 'You can now sign in with the sensor on this device')
      await load()
    } catch (e) {
      err('Fingerprint setup failed', e instanceof Error ? e.message : undefined)
    } finally {
      setBusy(null)
    }
  }

  const toggleRequire = async (enabled: boolean) => {
    setBusy('toggle')
    try {
      await setBioPreference(enabled)
      ok(
        enabled ? 'Fingerprint now required' : 'Fingerprint made optional',
        enabled
          ? 'Every check-in will ask for the sensor first'
          : 'The sensor is optional again at check-in'
      )
      await load()
    } catch (e) {
      err('Could not update the setting', e instanceof Error ? e.message : undefined)
    } finally {
      setBusy(null)
    }
  }

  const remove = async (credentialId: string) => {
    setBusy(`del-${credentialId}`)
    try {
      await removeCredential(credentialId)
      ok('Fingerprint removed', 'This device can no longer sign in with the sensor')
      await load()
    } catch (e) {
      err('Could not remove the fingerprint', e instanceof Error ? e.message : undefined)
    } finally {
      setBusy(null)
    }
  }

  if (!supported) {
    return (
      <Card className="card-3d">
        <CardContent className="flex flex-col gap-2 p-6">
          <h3 className="flex items-center gap-2 font-semibold text-heading">
            <Fingerprint className="h-4 w-4 text-label" aria-hidden />
            Fingerprint
          </h3>
          <p className="text-sm text-label">
            This browser does not support fingerprint sign-in. On a phone, open Hajira in Chrome
            or Safari (or install the app) to use the sensor.
          </p>
        </CardContent>
      </Card>
    )
  }

  const enrolled = status?.enrolled ?? false
  const required = status?.biometricRequired ?? false
  const credentials = status?.credentials ?? []

  return (
    <Card className="card-3d">
      <CardContent className="flex flex-col gap-3 p-6">
        <h3 className="flex items-center gap-2 font-semibold text-heading">
          <Fingerprint className="h-4 w-4 text-label" aria-hidden />
          Fingerprint
          {enrolled ? (
            <Badge className="gap-1 border-none bg-green/10 text-green hover:bg-green/10">
              <ShieldCheck className="h-3 w-3" aria-hidden />
              Saved on this device
            </Badge>
          ) : null}
        </h3>
        <p className="text-xs leading-relaxed text-label">
          Your fingerprint never leaves this phone — Hajira stores only a public key. Use it to
          sign in without typing your password, and (for students) to prove it is really you at
          check-in.
        </p>

        {!enrolled ? (
          <Button
            onClick={register}
            disabled={busy === 'register'}
            className="btn-3d btn-ink h-11 w-fit gap-2 font-semibold"
          >
            {busy === 'register' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Plus className="h-4 w-4" aria-hidden />
            )}
            Add this device&rsquo;s fingerprint
          </Button>
        ) : (
          <>
            {role === 'STUDENT' ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-cream-soft/60 px-3.5 py-3">
                <div className="min-w-0">
                  <Label htmlFor="bio-required" className="text-sm font-semibold text-heading">
                    Require fingerprint at check-in
                  </Label>
                  <p className="mt-0.5 text-xs text-label">
                    When on, every check-in asks for the sensor first. Skipping it marks the
                    attendance for your teacher&rsquo;s review.
                  </p>
                </div>
                <Switch
                  id="bio-required"
                  checked={required}
                  onCheckedChange={toggleRequire}
                  disabled={busy === 'toggle'}
                  aria-label="Require fingerprint at check-in"
                />
              </div>
            ) : null}

            <ul className="flex flex-col gap-2">
              {credentials.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-cream-soft/60 px-3.5 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-heading">
                      {c.deviceType === 'singleDevice'
                        ? 'This device (not synced)'
                        : 'Passkey (synced across devices)'}
                    </p>
                    <p className="text-xs text-label">Added {fmtDateTime(c.createdAt)}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(c.credentialId)}
                    disabled={busy === `del-${c.credentialId}`}
                    aria-label="Remove this fingerprint"
                    title="Remove this fingerprint"
                    className="h-9 w-9 shrink-0 text-label hover:bg-rust/10 hover:text-rust"
                  >
                    {busy === `del-${c.credentialId}` ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Trash2 className="h-4 w-4" aria-hidden />
                    )}
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  )
}
