import { useState } from "react";
import { BookOpen, ChevronRight, Plus, User } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useListCharacters } from "@workspace/api-client-react";
import type { Character } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import CharacterCreateForm from "./character-create";
import CharacterDetail from "./character-detail";

type View = { mode: "list" } | { mode: "detail"; id: number } | { mode: "create" };

export default function CharacterListPanel() {
  const [view, setView] = useState<View>({ mode: "list" });

  if (view.mode === "create") {
    return (
      <CharacterCreateForm
        onCancel={() => setView({ mode: "list" })}
        onCreated={() => setView({ mode: "list" })}
      />
    );
  }

  if (view.mode === "detail") {
    return <CharacterDetail id={view.id} onBack={() => setView({ mode: "list" })} />;
  }

  return (
    <CharacterGrid
      onSelect={(id) => setView({ mode: "detail", id })}
      onCreate={() => setView({ mode: "create" })}
    />
  );
}

function resolvePortraitSrc(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/objects/")) return `${import.meta.env.BASE_URL}api/storage${url}`;
  return url;
}

function CharacterPortraitThumb({ url, name }: { url: string | null | undefined; name: string }) {
  const src = resolvePortraitSrc(url);
  if (src) {
    return (
      <img
        src={src}
        alt={`${name} portrait`}
        loading="lazy"
        className="h-14 w-14 rounded-xl object-cover shrink-0 border border-[rgba(255,255,255,0.08)]"
        data-testid="img-character-thumb"
      />
    );
  }
  return (
    <div
      className="h-14 w-14 rounded-xl shrink-0 flex items-center justify-center bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)]"
      data-testid="img-character-thumb-placeholder"
    >
      <User className="h-6 w-6 text-muted-foreground" />
    </div>
  );
}

function CharacterGrid({ onSelect, onCreate }: { onSelect: (id: number) => void; onCreate: () => void }) {
  const { data: characters, isLoading } = useListCharacters();

  return (
    <div className="space-y-6" data-testid="character-list-panel">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-foreground flex items-center gap-2 tracking-tight">
          <BookOpen className="h-6 w-6 text-primary" />
          Characters
        </h2>
        <Button onClick={onCreate} size="sm" data-testid="button-new-character">
          <Plus className="h-4 w-4 mr-1" />
          New Character
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
      ) : !characters?.length ? (
        <div className="rounded-2xl border border-dashed border-[rgba(255,255,255,0.08)] p-8 text-center">
          <BookOpen className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No characters yet.</p>
          <p className="text-sm text-muted-foreground mt-1">Create your first character to get started!</p>
          <Button onClick={onCreate} className="mt-4" data-testid="button-create-first-character">
            <Plus className="h-4 w-4 mr-1" />
            Create Character
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(characters as Character[]).map((char) => (
            <motion.button
              whileTap={{ scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
              key={char.id}
              onClick={() => onSelect(char.id)}
              className="text-left rounded-2xl glass-panel-hover p-5"
              data-testid={`card-character-${char.id}`}
            >
              <div className="flex items-center gap-4">
                <CharacterPortraitThumb url={char.portraitUrl} name={char.name} />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground truncate">{char.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    Level <span className="font-mono tabular-nums">{char.level}</span> {char.race} {char.class}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 truncate">Played by {char.ownerDisplayName}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
            </motion.button>
          ))}
        </div>
      )}
    </div>
  );
}
