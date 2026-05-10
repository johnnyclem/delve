import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Globe } from "@/components/ui/pixel-icons";
import { cn } from "@/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface TimezoneComboboxProps {
  value: string;
  onChange: (tz: string) => void;
  options: string[];
  disabled?: boolean;
  triggerClassName?: string;
  contentClassName?: string;
  testId?: string;
}

export default function TimezoneCombobox({
  value,
  onChange,
  options,
  disabled,
  triggerClassName,
  contentClassName,
  testId = "select-timezone",
}: TimezoneComboboxProps) {
  const [open, setOpen] = useState(false);

  const grouped = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const tz of options) {
      const region = tz.includes("/") ? tz.split("/")[0] : "Other";
      const arr = groups.get(region) ?? [];
      arr.push(tz);
      groups.set(region, arr);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([region, zones]) => ({
        region,
        zones: zones.sort((a, b) => a.localeCompare(b)),
      }));
  }, [options]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        role="combobox"
        aria-expanded={open}
        disabled={disabled}
        data-testid={testId}
        className={cn(
          "flex items-center gap-1 bg-transparent text-xs text-foreground rounded px-1 py-0.5 max-w-[140px] focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50",
          triggerClassName,
        )}
      >
        <span className="truncate">{value}</span>
        <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className={cn("w-[280px] p-0 border-[rgba(255,255,255,0.08)]", contentClassName)}
      >
        <Command>
          <CommandInput placeholder="Search timezones..." data-testid={`${testId}-search`} />
          <CommandList>
            <CommandEmpty>No timezones found.</CommandEmpty>
            {grouped.map(({ region, zones }) => (
              <CommandGroup key={region} heading={region}>
                {zones.map((tz) => {
                  const label = tz.includes("/") ? tz.split("/").slice(1).join("/") : tz;
                  const selected = tz === value;
                  return (
                    <CommandItem
                      key={tz}
                      value={tz}
                      onSelect={() => {
                        if (tz !== value) onChange(tz);
                        setOpen(false);
                      }}
                      data-testid={`${testId}-option-${tz}`}
                    >
                      <Globe className="opacity-60" />
                      <span className="truncate">{label.replace(/_/g, " ")}</span>
                      <Check
                        className={cn(
                          "ml-auto",
                          selected ? "opacity-100" : "opacity-0",
                        )}
                      />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
