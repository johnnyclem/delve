import { useState } from "react";
import { useUser } from "@clerk/react";
import { BookOpen, Plus } from "@/components/ui/pixel-icons";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useListCharacters } from "@workspace/api-client-react";
import type { Character } from "@workspace/api-client-react";
import CharacterDetail from "./character-detail";
import CharacterCreateForm from "./character-create";

export default function MyCharacterPanel({ onNavigateToCharacters }: { onNavigateToCharacters?: () => void }) {
  const { user } = useUser();
  const { data: characters, isLoading } = useListCharacters();
  const [creating, setCreating] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="my-character-loading">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (creating) {
    return (
      <CharacterCreateForm
        onCancel={() => setCreating(false)}
        onCreated={() => setCreating(false)}
      />
    );
  }

  // Pick the most recently updated owned character so a player who has rolled multiple
  // PCs lands on the one they last touched.
  const myChars = ((characters ?? []) as Character[])
    .filter((c) => c.ownerUserId === user?.id)
    .slice()
    .sort((a, b) => {
      const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return tb - ta;
    });
  const myChar = myChars[0];

  if (!myChar) {
    return (
      <div className="space-y-6" data-testid="my-character-empty">
        <h2 className="text-2xl font-semibold text-foreground tracking-tight">Your Character</h2>
        <div className="rounded-2xl border border-dashed border-[rgba(255,255,255,0.08)] p-8 text-center">
          <BookOpen className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">You haven't created a character yet.</p>
          <p className="text-sm text-muted-foreground mt-1">Roll one up to get started.</p>
          <Button onClick={() => setCreating(true)} className="mt-4" data-testid="button-create-your-character">
            <Plus className="h-4 w-4 mr-1" />
            Create your character
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <CharacterDetail id={myChar.id} />
      {myChars.length > 1 && onNavigateToCharacters && (
        <p className="text-xs text-muted-foreground">
          You own multiple characters. <button onClick={onNavigateToCharacters} className="text-primary hover:underline" data-testid="link-all-my-characters">View all in Characters</button>.
        </p>
      )}
    </div>
  );
}
