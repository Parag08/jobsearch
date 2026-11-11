"use client";

import { useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { makeNonce } from "@/lib/auth/google-one-tap";

const GSI_SRC = "https://accounts.google.com/gsi/client";

interface CredentialResponse {
  credential: string;
}

interface GoogleId {
  initialize(config: {
    client_id: string;
    callback: (response: CredentialResponse) => void;
    nonce: string;
    use_fedcm_for_prompt: boolean;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    context?: "signin" | "signup" | "use";
    itp_support?: boolean;
  }): void;
  prompt(): void;
  cancel(): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

function loadGsi(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
    const script = existing ?? document.createElement("script");
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("gsi_load_failed")), { once: true });
    if (!existing) {
      script.src = GSI_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
  });
}

/**
 * Google One Tap: the "Continue as <name>" card Google shows when this browser is already
 * signed in to Google. The ID token goes straight to Supabase (signInWithIdToken), so there is
 * no redirect at all. Renders nothing; the page only mounts it when a client ID and Supabase
 * are both configured (shouldOfferOneTap), and it stays quiet for a visitor already signed in.
 */
export function GoogleOneTap({
  clientId,
  supabaseUrl,
  supabaseKey,
  next = "/app",
}: {
  clientId: string;
  supabaseUrl: string;
  supabaseKey: string;
  next?: string;
}) {
  useEffect(() => {
    let cancelled = false;
    const supabase = createBrowserClient(supabaseUrl, supabaseKey);

    (async () => {
      // getSession reads the auth cookie locally - no network call for a returning visitor.
      const { data } = await supabase.auth.getSession();
      if (cancelled || data.session) return;

      const nonce = await makeNonce();
      try {
        await loadGsi();
      } catch {
        return; // blocked by an extension or offline: the buttons still work
      }
      if (cancelled || !window.google) return;

      window.google.accounts.id.initialize({
        client_id: clientId,
        nonce: nonce.hashed,
        use_fedcm_for_prompt: true,
        cancel_on_tap_outside: true,
        context: "signin",
        itp_support: true,
        callback: async ({ credential }) => {
          const { error } = await supabase.auth.signInWithIdToken({
            provider: "google",
            token: credential,
            nonce: nonce.raw,
          });
          // Full navigation, so the server components read the new session cookie.
          window.location.assign(error ? `/signin?error=${encodeURIComponent(error.message)}` : next);
        },
      });
      window.google.accounts.id.prompt();
    })();

    return () => {
      cancelled = true;
      window.google?.accounts?.id?.cancel();
    };
  }, [clientId, supabaseUrl, supabaseKey, next]);

  return null;
}
