"use client";

import { useCallback, useState } from "react";
import { api } from "@/lib/api";
import { useAsync, useUserId } from "@/lib/hooks";
import { isDemoMode, isDemoUserId } from "@/lib/user";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/shadcn/dialog";
import { ProfileForm } from "./ProfileForm";
import { useT } from "@/lib/i18n";

/** Opens once for a brand-new real account (never for demo personas or guest sandboxes). Skippable; editable later on /profile. */
export function OnboardingGate() {
  const userId = useUserId();
  const { t } = useT();
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
          <DialogTitle>{t("ob.title")}</DialogTitle>
          <DialogDescription>{t("ob.desc")}</DialogDescription>
        </DialogHeader>
        <ProfileForm userId={userId} onDone={() => setClosed(true)} onSkip={skip} />
      </DialogContent>
    </Dialog>
  );
}
