import { useState } from "react";
import { BookOpen, ChevronRight, Plus, User } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useListCharacters } from "@workspace/api-client-react";
import type { Character } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import CharacterCreateForm from "./character-create";
import CharacterDetail from "./character-detail";
import { EntityNameWithAsk } from "@/components/ask-popover";

const TAG_COLOR_MAP: Record<string, string> = {
  Friendly: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  Hostile: "bg-red-500/20 text-red-300 border-red-500/40",
  Neutral: "bg-slate-500/20 text-slate-300 border-slate-500/40",
  Mysterious: "bg-violet-500/20 text-violet-300 border-violet-500/40",
  Ally: "bg-sky-500/20 text-sky-300 border-sky-500/40",
  Rival: "bg-orange-500/20 text-orange-300 border-orange-500/40",
  Unknown: "bg-zinc-500/20 text-zinc-400 border-zinc-500/40",
};

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
        className="h-14 w-14 rounded-xl object-cover shrink-0 border border-[rgba(255,255,255,0.08)] [image-rendering:auto]"
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
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const allTags = Array.from(
    new Set(((characters ?? []) as Character[]).flatMap((c) => c.relationshipTags ?? [])),
  ).sort();

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const filteredCharacters = ((characters ?? []) as Character[]).filter((char) => {
    if (selectedTags.length === 0) return true;
    const tags = char.relationshipTags ?? [];
    return selectedTags.some((t) => tags.includes(t));
  });

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
        <>
          {allTags.length > 0 && (
            <div
              className="flex flex-wrap items-center gap-2"
              data-testid="character-tag-filter-bar"
            >
              <span className="text-xs uppercase tracking-wide text-muted-foreground mr-1">
                Filter by tag:
              </span>
              {allTags.map((tag) => {
                const active = selectedTags.includes(tag);
                const baseColor =
                  TAG_COLOR_MAP[tag] ?? "bg-primary/15 text-primary/80 border-primary/30";
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    aria-pressed={active}
                    className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium leading-tight transition ${baseColor} ${
                      active ? "ring-2 ring-primary/60" : "opacity-70 hover:opacity-100"
                    }`}
                    data-testid={`filter-tag-${tag}`}
                  >
                    {tag}
                  </button>
                );
              })}
              {selectedTags.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedTags([])}
                  className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline ml-1"
                  data-testid="filter-tag-clear"
                >
                  Clear
                </button>
              )}
            </div>
          )}
          {filteredCharacters.length === 0 ? (
            <div
              className="rounded-2xl border border-dashed border-[rgba(255,255,255,0.08)] p-8 text-center"
              data-testid="character-list-no-matches"
            >
              <p className="text-muted-foreground">No characters match the selected tags.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredCharacters.map((char) => (
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
                  <h3 className="font-semibold text-foreground truncate">
                    <EntityNameWithAsk
                      entity={{ name: char.name, entityType: "character", entityId: char.id, entityKind: "character" }}
                    >
                      {char.name}
                    </EntityNameWithAsk>
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Level <span className="font-mono tabular-nums">{char.level}</span> {char.race} {char.class}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 truncate">Played by {char.ownerDisplayName}</p>
                  {(char.relationshipTags ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2" data-testid={`card-tags-${char.id}`}>
                      {(char.relationshipTags ?? []).slice(0, 4).map((tag) => (
                        <span
                          key={tag}
                          className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium leading-tight ${TAG_COLOR_MAP[tag] ?? "bg-primary/15 text-primary/80 border-primary/30"}`}
                          data-testid={`card-tag-${char.id}-${tag}`}
                        >
                          {tag}
                        </span>
                      ))}
                      {(char.relationshipTags ?? []).length > 4 && (
                        <span className="inline-block rounded-full border border-muted px-2 py-0.5 text-[10px] font-medium leading-tight text-muted-foreground">
                          +{(char.relationshipTags ?? []).length - 4}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
            </motion.button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
