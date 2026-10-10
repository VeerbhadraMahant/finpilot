"use client";

import { useCallback, useState } from "react";
import { api } from "@/lib/api";
import { useAsync, useUserId } from "@/lib/hooks";
import { isDemoMode, isDemoUserId } from "@/lib/user";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/shadcn/dialog";
import { ProfileForm } from "./ProfileForm";

/** Opens once for a brand-new real account (never for demo personas or guest sandboxes). Skippable; editable later on /profile. */
export function OnboardingGate() {
  const userId = useUserId();
  const real = !isDemoMode() && !isDemoUserId(userId) && !userId.startsWith("guest-");
  const profile = useAsync(useCallback(() => (real ? api.profile(userId) : Promise.resolve(null)), [real, userId]), [real, userId]);
  const [closed, setClosed] = useState(false);
  const open = real && !closed && profile.data !== null && !profile.data.completed;

  function skip() {
    api.saveProfile(userId, "skipped").catch(() => {});
    setClosed(true);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && skip()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Welcome to FinPilot</DialogTitle>
          <DialogDescription>Tell me a little about you so my advice fits your life. Choose how much to share; you can change it any time.</DialogDescription>
        </DialogHeader>
        <ProfileForm userId={userId} onDone={() => setClosed(true)} onSkip={skip} />
      </DialogContent>
    </Dialog>
  );
}
