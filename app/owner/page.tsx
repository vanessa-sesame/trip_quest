"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole } from "lucide-react";

// Owner sign-in: the passcode set as TRIPQUEST_OWNER_PASSCODE on the site.
export default function OwnerSignIn() {
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/owner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Sign-in failed.");
      router.push("/orders");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Sign-in failed.");
      setBusy(false);
    }
  }

  return (
    <main className="orders-page">
      <header className="orders-header">
        <div>
          <p className="eyebrow">TripQuest owner</p>
          <h1>Sign in</h1>
          <p className="modal-subtitle">Enter the owner passcode to open orders and the booklet library.</p>
        </div>
      </header>
      <form className="order-card" onSubmit={submit}>
        <label className="field-label" htmlFor="owner-passcode">Owner passcode</label>
        <input
          id="owner-passcode"
          className="owner-passcode"
          type="password"
          autoComplete="current-password"
          value={passcode}
          onChange={(event) => setPasscode(event.target.value)}
          required
        />
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="order-buttons">
          <button className="primary-button" type="submit" disabled={busy || !passcode}>
            <LockKeyhole size={16} /> {busy ? "Checking…" : "Sign in"}
          </button>
        </div>
      </form>
    </main>
  );
}
