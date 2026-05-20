import React, { SVGProps } from "react";

export type PixelIconProps = SVGProps<SVGSVGElement> & { size?: number | string };

function icon(
  name: string,
  d: string,
  opts?: { fillRule?: "evenodd" | "nonzero"; extra?: React.ReactNode },
) {
  const C = ({ size = "1em", className, style, ...rest }: PixelIconProps) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      style={{ shapeRendering: "crispEdges", imageRendering: "pixelated", ...style }}
      aria-hidden="true"
      {...rest}
    >
      <path d={d} fillRule={opts?.fillRule} />
      {opts?.extra}
    </svg>
  );
  C.displayName = name;
  return C;
}

function iconEl(name: string, children: React.ReactNode) {
  const C = ({ size = "1em", className, style, ...rest }: PixelIconProps) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      style={{ shapeRendering: "crispEdges", imageRendering: "pixelated", ...style }}
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
  C.displayName = name;
  return C;
}

const OCTAGON = "M4,0h8v2h2v2h2v8h-2v2h-2v2H4v-2H2v-2H0V4h2V2h2Z";
const INNER_OCTAGON = "M5,2h6v1h1v1h1v6h-1v1h-1v1H5v-1H4v-1H3V4h1V3h1Z";
const CIRCLE_RING = OCTAGON + " " + INNER_OCTAGON;

const SHIELD_BODY =
  "M3,0h10v1h1v1h1v8h-1v1h-1v1h-1v1h-1v1H8v1H8v-1H7v-1H6v-1H5v-1H4v-1H3V2h1V1h1V0Z";

export const AlertCircle = icon(
  "AlertCircle",
  CIRCLE_RING + " M7,4h2v4H7Z M7,10h2v2H7Z",
  { fillRule: "evenodd" },
);

export const AlertTriangle = icon(
  "AlertTriangle",
  "M8,0L16,16H0ZM7,7h2v4H7ZM7,13h2v2H7Z",
  { fillRule: "evenodd" },
);

export const Anchor = iconEl("Anchor", (
  <>
    <path d="M6,0h4v2h-1v1H7V2H6ZM5,3h6v1H5Z" />
    <path d="M7,4h2v9H7Z" />
    <path d="M0,7h4v2H0ZM12,7h4v2h-4Z" />
    <path d="M1,8C2,12,4,14,7,15H9C12,14,14,12,15,8H13C12,12,10,13,8,13C6,13,4,12,3,8Z" />
  </>
));

export const ArrowLeft = icon("ArrowLeft", "M8,2L2,8L8,14V11H14V5H8Z");
export const ArrowRight = icon("ArrowRight", "M8,2V5H2V11H8V14L14,8Z");
export const ArrowLeftRight = icon(
  "ArrowLeftRight",
  "M0,8L4,4V7H12V4L16,8L12,12V9H4V12Z",
);

export const Award = iconEl("Award", (
  <>
    <path d="M8,0L10,5H15L11,8L13,13L8,10L3,13L5,8L1,5H6Z" />
    <path d="M6,13h4v3H6Z" />
  </>
));

export const Axe = icon(
  "Axe",
  "M14,0L16,2L5,13H8L4,16H0V12L3,8V11L14,0Z",
);

export const Bell = icon(
  "Bell",
  "M8,0C5,0,3,3,3,6V11H1V13H15V11H13V6C13,3,11,0,8,0ZM6,13C6,15,7,16,8,16C9,16,10,15,10,13Z",
);

export const BellRing = iconEl("BellRing", (
  <>
    <path d="M8,2C6,2,4,4,4,6V11H2V13H14V11H12V6C12,4,10,2,8,2ZM6,13C6,15,7,16,8,16C9,16,10,15,10,13Z" />
    <rect x="0" y="4" width="2" height="4" />
    <rect x="14" y="4" width="2" height="4" />
  </>
));

export const BookOpen = icon(
  "BookOpen",
  "M0,2h6C7,2,8,3,8,4V14C7,13,6,13,5,13H0ZM16,2h-6C9,2,8,3,8,4V14C9,13,10,13,11,13H16Z",
);

export const Calendar = iconEl("Calendar", (
  <>
    <rect x="0" y="3" width="16" height="13" />
    <rect x="0" y="3" width="16" height="4" fill="currentColor" />
    <rect x="1" y="8" width="3" height="2" fill="var(--color-background,#09090B)" />
    <rect x="6" y="8" width="3" height="2" fill="var(--color-background,#09090B)" />
    <rect x="11" y="8" width="3" height="2" fill="var(--color-background,#09090B)" />
    <rect x="1" y="12" width="3" height="2" fill="var(--color-background,#09090B)" />
    <rect x="6" y="12" width="3" height="2" fill="var(--color-background,#09090B)" />
    <rect x="11" y="12" width="3" height="2" fill="var(--color-background,#09090B)" />
    <rect x="4" y="0" width="2" height="4" />
    <rect x="10" y="0" width="2" height="4" />
  </>
));

export const Check = icon("Check", "M0,9L2,7L6,11L14,3L16,5L6,13Z");

export const CheckCircle2 = icon(
  "CheckCircle2",
  CIRCLE_RING + " M4,8L6,6L8,9L12,5L14,7L8,12Z",
  { fillRule: "evenodd" },
);

export const ChevronDown = icon("ChevronDown", "M1,5L8,12L15,5h-2L8,9L3,5Z");
export const ChevronUp = icon("ChevronUp", "M1,11L8,4L15,11h-2L8,7L3,11Z");
export const ChevronLeft = icon("ChevronLeft", "M11,1L4,8L11,15v-2L7,8L11,3Z");
export const ChevronRight = icon("ChevronRight", "M5,1L12,8L5,15v-2L9,8L5,3Z");
export const ChevronsUpDown = icon("ChevronsUpDown", "M4,5L8,1L12,5ZM4,11L8,15L12,11Z");

export const Clock = iconEl("Clock", (
  <>
    <path
      fillRule="evenodd"
      d={CIRCLE_RING}
    />
    <rect x="7" y="3" width="2" height="6" />
    <rect x="7" y="8" width="5" height="2" />
  </>
));

export const Compass = icon(
  "Compass",
  CIRCLE_RING + " M8,2L11,8L8,14L5,8Z",
  { fillRule: "evenodd" },
);

export const Copy = iconEl("Copy", (
  <>
    <rect x="4" y="0" width="12" height="12" rx="1" />
    <rect x="0" y="4" width="11" height="12" fill="var(--color-background,#09090B)" />
    <rect x="0" y="4" width="11" height="12" />
    <rect x="1" y="5" width="9" height="10" fill="var(--color-background,#09090B)" />
  </>
));

export const Cross = icon(
  "Cross",
  "M5,0h6v5h5v6H11v5H5v-5H0V5h5Z",
);

export const Dice5 = iconEl("Dice5", (
  <>
    <rect x="1" y="1" width="14" height="14" rx="2" />
    <rect x="3" y="3" width="3" height="3" fill="var(--color-background,#09090B)" />
    <rect x="10" y="3" width="3" height="3" fill="var(--color-background,#09090B)" />
    <rect x="3" y="10" width="3" height="3" fill="var(--color-background,#09090B)" />
    <rect x="10" y="10" width="3" height="3" fill="var(--color-background,#09090B)" />
    <rect x="6.5" y="6.5" width="3" height="3" fill="var(--color-background,#09090B)" />
  </>
));

export const Dices = iconEl("Dices", (
  <>
    <rect x="5" y="0" width="11" height="11" rx="2" />
    <rect x="7" y="2" width="2" height="2" fill="var(--color-background,#09090B)" />
    <rect x="11" y="2" width="2" height="2" fill="var(--color-background,#09090B)" />
    <rect x="7" y="7" width="2" height="2" fill="var(--color-background,#09090B)" />
    <rect x="11" y="7" width="2" height="2" fill="var(--color-background,#09090B)" />
    <rect x="0" y="5" width="11" height="11" rx="2" />
    <rect x="2" y="7" width="2" height="2" fill="var(--color-background,#09090B)" />
    <rect x="2" y="12" width="2" height="2" fill="var(--color-background,#09090B)" />
    <rect x="7" y="12" width="2" height="2" fill="var(--color-background,#09090B)" />
    <rect x="4.5" y="9.5" width="2" height="2" fill="var(--color-background,#09090B)" />
  </>
));

export const Download = icon(
  "Download",
  "M7,0h2v9l3-3L14,8l-6,6L2,8l2-2l3,3V0ZM0,14h16v2H0Z",
);

export const Edit = icon(
  "Edit",
  "M11,0L16,5L5,16H0V11ZM11,3L13,5L4,14H2V12Z",
  { fillRule: "evenodd" },
);

export const Eraser = icon(
  "Eraser",
  "M2,11L8,5L14,11L11,14H5ZM0,14h16v2H0Z",
);

export const ExternalLink = icon(
  "ExternalLink",
  "M8,0h8v8h-2V3L8,9L7,8L13,2H8ZM2,4H6V6H2V14H10V10H12V16H0V4Z",
);

export const Eye = iconEl("Eye", (
  <>
    <path d="M0,8C2,4,5,2,8,2C11,2,14,4,16,8C14,12,11,14,8,14C5,14,2,12,0,8Z" />
    <circle cx="8" cy="8" r="3" fill="var(--color-background,#09090B)" />
    <circle cx="8" cy="8" r="1.5" />
  </>
));

export const EyeOff = iconEl("EyeOff", (
  <>
    <path d="M0,8C2,4,5,2,8,2C9,2,10,2,11,3L3,11C1,10,0,9,0,8Z" />
    <path d="M13,5C15,6,16,7,16,8C14,12,11,14,8,14C7,14,6,14,5,13L13,5Z" />
    <rect x="1" y="14" width="2" height="2" transform="rotate(-45,2,15)" />
    <path d="M1,15L15,1L14,0L0,14Z" />
  </>
));

export const FileText = iconEl("FileText", (
  <>
    <path d="M2,0h8l4,4V16H2ZM10,0V4h4" />
    <rect x="4" y="7" width="8" height="2" fill="var(--color-background,#09090B)" />
    <rect x="4" y="10" width="8" height="2" fill="var(--color-background,#09090B)" />
    <rect x="4" y="13" width="5" height="2" fill="var(--color-background,#09090B)" />
  </>
));

export const Flame = icon(
  "Flame",
  "M8,0C8,4,4,5,4,9C4,12,6,14,8,16C10,14,12,12,12,9C12,7,10,5,9,3C9,5,7,6,7,8C7,9,8,10,8,10C8,10,6,9,6,8C6,6,8,0,8,0Z",
);

export const GitCompare = iconEl("GitCompare", (
  <>
    <circle cx="4" cy="4" r="3" />
    <circle cx="12" cy="12" r="3" />
    <path d="M4,7V9C4,11,6,12,8,12" />
    <path d="M12,9V7C12,5,10,4,8,4" />
    <path d="M10,2L12,4L10,6" />
    <path d="M6,10L4,12L6,14" />
  </>
));

export const Globe = iconEl("Globe", (
  <>
    <path
      fillRule="evenodd"
      d={
        OCTAGON +
        " " +
        INNER_OCTAGON +
        " M7,0h2v16H7Z M0,7h16v2H0Z"
      }
    />
  </>
));

export const GripVertical = icon(
  "GripVertical",
  "M4,2h2v2H4ZM10,2h2v2H10ZM4,7h2v2H4ZM10,7h2v2H10ZM4,12h2v2H4ZM10,12h2v2H10Z",
);

export const Hand = icon(
  "Hand",
  "M6,0h2V8H6ZM10,2h2V8H10ZM2,4h2v6H2ZM14,4h2v6H14V12C14,14,12,16,9,16H7C4,16,2,14,2,12V10h2v2C4,13,5,14,7,14H9C11,14,12,13,12,12V2h2Z",
);

export const Heart = icon(
  "Heart",
  "M4,1C1,1,0,4,0,6C0,10,4,13,8,16C12,13,16,10,16,6C16,4,15,1,12,1C10,1,9,3,8,4C7,3,6,1,4,1Z",
);

export const HelpCircle = icon(
  "HelpCircle",
  CIRCLE_RING + " M7,4h2C10,4,11,5,11,6C11,8,8,8,8,10 M8,11h0v2h0Z",
  { fillRule: "evenodd" },
);

export const History = iconEl("History", (
  <>
    <path
      fillRule="evenodd"
      d={CIRCLE_RING}
    />
    <rect x="7" y="4" width="2" height="5" />
    <rect x="7" y="8" width="4" height="2" />
    <path d="M0,8L4,4V7H2A6,6,0,1,0,3,4L2,3A8,8,0,1,1,0,8Z" />
  </>
));

export const Home = icon("Home", "M8,0L0,8h2V16h5V11h2v5h5V8h2Z");

export const Leaf = icon(
  "Leaf",
  "M2,14C2,14,2,6,10,2C14,0,16,0,16,0C16,0,16,2,14,6C10,14,2,14,2,14ZM2,14L7,9",
);

export const Library = iconEl("Library", (
  <>
    <rect x="0" y="0" width="4" height="16" />
    <rect x="6" y="0" width="4" height="16" />
    <rect x="12" y="2" width="4" height="14" />
  </>
));

export const Link = icon(
  "Link",
  "M7,9C6,8,6,6,7,5L10,2C11,0,14,0,15,2C16,3,16,6,15,7L13,9 M9,7C10,8,10,10,9,11L6,14C5,16,2,16,1,14C0,13,0,10,1,9L3,7",
);

export const Loader2 = icon(
  "Loader2",
  OCTAGON + " M14,7h2v2h-2Z",
  { fillRule: "evenodd" },
);

export const Lock = iconEl("Lock", (
  <>
    <rect x="2" y="7" width="12" height="9" rx="1" />
    <path fillRule="evenodd" d="M5,7V5C5,3,6,1,8,1C10,1,11,3,11,5V7h-2V5C9,4,9,3,8,3C7,3,7,4,7,5V7Z" />
    <rect x="7" y="10" width="2" height="3" fill="var(--color-background,#09090B)" />
  </>
));

export const LogOut = iconEl("LogOut", (
  <>
    <path d="M10,3H14V13H10V11H12V5H10Z" />
    <path d="M0,1H9V5H7V3H2V13H7V11H9V15H0Z" />
    <path d="M6,7h8v2H6ZM11,5L15,8L11,11V5Z" />
  </>
));

export const Mail = icon(
  "Mail",
  "M0,2L8,9L16,2V14H0Z",
);

export const MailX = icon(
  "MailX",
  "M0,2L8,9L16,2V14H0Z M9,5L10,4L12,6L11,7L9,5L7,7L6,6L8,4Z M9,7L10,6L12,8L11,9L9,7L7,9L6,8L8,6Z",
  { fillRule: "evenodd" },
);

export const MailQuestion = iconEl("MailQuestion", (
  <>
    <path d="M0,2L8,9L16,2V14H0Z" />
    <path d="M7,6C7,4,9,4,9,6C9,7,8,7,8,9 M8,10h0v1.5h0Z" fill="var(--color-background,#09090B)" />
  </>
));

export const MailWarning = iconEl("MailWarning", (
  <>
    <path d="M0,2L8,9L16,2V14H0Z" />
    <rect x="7" y="5" width="2" height="4" fill="var(--color-background,#09090B)" />
    <rect x="7" y="10" width="2" height="2" fill="var(--color-background,#09090B)" />
  </>
));

export const Map = icon(
  "Map",
  "M0,0V13L5,16L11,12L16,15V2L11,0L5,4ZM5,4V16h2V4ZM11,0V12h-2V0Z",
  { fillRule: "evenodd" },
);

export const Menu = icon("Menu", "M0,2h16v2H0ZM0,7h16v2H0ZM0,12h16v2H0Z");

export const MoreHorizontal = icon("MoreHorizontal", "M2,7h2v2H2ZM7,7h2v2H7ZM12,7h2v2H12Z");

export const MessageSquare = icon(
  "MessageSquare",
  "M0,0H16V12H10L6,16V12H0Z",
);

export const Mic = iconEl("Mic", (
  <>
    <rect x="5" y="0" width="6" height="10" rx="3" />
    <path d="M2,7C2,11,5,13,8,13C11,13,14,11,14,7H12C12,10,10,11,8,11C6,11,4,10,4,7Z" />
    <rect x="7" y="13" width="2" height="3" />
    <rect x="4" y="15" width="8" height="1" />
  </>
));

export const Minus = icon("Minus", "M0,7h16v2H0Z");

export const Mountain = icon(
  "Mountain",
  "M6,2L0,16H16L10,2ZM8,5L12,13H4Z",
  { fillRule: "evenodd" },
);

export const MousePointer2 = icon(
  "MousePointer2",
  "M0,0L6,16L8,10L14,8ZM8,10L10,12L14,16L12,16L8,12L10,14Z",
);

export const Music = iconEl("Music", (
  <>
    <path d="M6,0V12C5,11,4,11,3,12C1,13,1,15,3,15C5,16,7,15,7,13V4H14V2H6Z" />
  </>
));

export const Pause = icon("Pause", "M2,0h4v16H2ZM10,0h4v16H10Z");

export const Pencil = icon(
  "Pencil",
  "M12,0L16,4L4,16H0V12ZM12,3L13,4L3,14H2V13Z",
  { fillRule: "evenodd" },
);

export const Play = icon("Play", "M2,1L14,8L2,15Z");

export const Plus = icon("Plus", "M6,0h4v6h6v4H10v6H6v-6H0V6h6Z");

export const Printer = iconEl("Printer", (
  <>
    <rect x="3" y="0" width="10" height="4" />
    <path fillRule="evenodd" d="M0,4h16v8H12v4H4v-4H0ZM2,6h2v2H2Z" />
    <rect x="4" y="10" width="8" height="6" />
    <rect x="5" y="12" width="6" height="1" fill="var(--color-background,#09090B)" />
    <rect x="5" y="14" width="4" height="1" fill="var(--color-background,#09090B)" />
  </>
));

export const RefreshCw = icon(
  "RefreshCw",
  "M14,4C12,2,10,1,8,1C4,1,1,4,1,8C1,12,4,15,8,15C11,15,14,13,15,10H13C12,12,10,13,8,13C5,13,3,11,3,8C3,5,5,3,8,3C10,3,11,4,12,5H10V7H16V1H14Z",
);

export const Repeat = icon(
  "Repeat",
  "M0,6h12V3L16,7L12,11V8H2V12H0ZM16,10H4V13L0,9L4,5V8H14V4H16Z",
);

export const RotateCcw = icon(
  "RotateCcw",
  "M2,4C4,2,6,1,8,1C12,1,15,4,15,8C15,12,12,15,8,15C4,15,1,12,1,8H3C3,11,5,13,8,13C11,13,13,11,13,8C13,5,11,3,8,3C6,3,5,4,4,5H6V7H0V1H2Z",
);

export const Save = iconEl("Save", (
  <>
    <path d="M0,0H12L16,4V16H0ZM4,0V6H12V0 M4,9H12V16H4Z" />
    <rect x="6" y="1" width="4" height="4" fill="var(--color-background,#09090B)" />
    <rect x="5" y="10" width="6" height="5" fill="var(--color-background,#09090B)" />
  </>
));

export const Scroll = iconEl("Scroll", (
  <>
    <path d="M4,0C2,0,1,1,1,2C1,3,2,4,4,4H13C14,4,15,5,15,6C15,7,14,8,13,8H3C1,8,0,9,0,11C0,13,1,14,3,14H12V16H3C1,16,0,14,0,11" />
    <path d="M4,4V14H12V0H4ZM4,0C5,0,4,0,4,2C4,4,4,4,4,4Z" fill="none" />
    <rect x="4" y="0" width="8" height="14" />
    <rect x="2" y="2" width="2" height="12" />
    <path d="M1,2C1,1,2,0,4,0V4C2,4,1,3,1,2Z" />
  </>
));

export const ScrollText = iconEl("ScrollText", (
  <>
    <rect x="4" y="0" width="8" height="14" />
    <rect x="2" y="2" width="2" height="12" />
    <path d="M1,2C1,1,2,0,4,0V4C2,4,1,3,1,2Z" />
    <path d="M4,14H12V16H3C1,16,0,14,0,11C0,9,1,8,3,8H4" />
    <rect x="5" y="3" width="5" height="2" fill="var(--color-background,#09090B)" />
    <rect x="5" y="6" width="5" height="2" fill="var(--color-background,#09090B)" />
    <rect x="5" y="9" width="4" height="2" fill="var(--color-background,#09090B)" />
  </>
));

export const Search = iconEl("Search", (
  <>
    <path
      fillRule="evenodd"
      d="M6,0A6,6,0,1,0,6,12A6,6,0,1,0,6,0ZM6,2A4,4,0,1,0,6,10A4,4,0,1,0,6,2Z"
    />
    <path d="M10,10L15,15L14,16L9,11Z" />
  </>
));

export const Send = icon(
  "Send",
  "M16,0L0,9L4,10L5,16ZM4,10L16,0L4,10Z",
  { fillRule: "evenodd" },
);

export const Share2 = iconEl("Share2", (
  <>
    <circle cx="13" cy="3" r="2" />
    <circle cx="3" cy="8" r="2" />
    <circle cx="13" cy="13" r="2" />
    <path d="M5,8L11,4L11,6L5,10ZM5,9L11,12L11,14L5,11Z" />
  </>
));

export const Shield = icon("Shield", SHIELD_BODY);

export const ShieldAlert = icon(
  "ShieldAlert",
  SHIELD_BODY + " M7,4h2v5H7Z M7,11h2v2H7Z",
  { fillRule: "evenodd" },
);

export const ShieldCheck = icon(
  "ShieldCheck",
  SHIELD_BODY + " M4,8L6,6L8,9L12,5L14,7L8,12Z",
  { fillRule: "evenodd" },
);

export const Skull = icon(
  "Skull",
  "M4,0h8v2h2v5h-1v2h1v1h-3v2H4v-2H1V9h1V7H1V2h2ZM4,3h3v3H4ZM9,3h3v3H9ZM4,11h2v2H4ZM7,11h2v2H7ZM10,11h2v2H10Z",
  { fillRule: "evenodd" },
);

export const Sparkles = icon(
  "Sparkles",
  "M8,0L9,6L15,7L9,8L8,14L7,8L1,7L7,6ZM13,11l1,3 3,1-3,1-1,3-1-3-3-1 3-1ZM3,0l1,2 2,1-2,1-1,2-1-2-2-1 2-1Z",
);

export const Square = icon(
  "Square",
  "M0,0h16v16H0ZM2,2h12v12H2Z",
  { fillRule: "evenodd" },
);

export const Star = icon("Star", "M8,0L10,6H16L11,9L13,16L8,12L3,16L5,9L0,6H6Z");

export const Sword = iconEl("Sword", (
  <>
    <path d="M16,0L10,6L14,10L16,0Z" />
    <rect x="9" y="5" width="2" height="8" transform="rotate(-45,10,9)" />
    <path d="M3,11L0,16L5,13Z" />
    <path d="M7,9L9,11L8,12L6,10Z" />
  </>
));

export const Swords = icon(
  "Swords",
  "M0,1L1,0L8,7L7,8ZM16,1L15,0L8,7L9,8ZM8,8L7,9L0,16L1,15ZM8,8L9,9L16,15L15,16Z",
);

export const Target = icon(
  "Target",
  OCTAGON + " " + INNER_OCTAGON + " M6,6h4v4H6Z",
  { fillRule: "evenodd" },
);

export const Tent = iconEl("Tent", (
  <>
    <path d="M8,0L0,16H16ZM8,3L4,16H12Z" fillRule="evenodd" />
  </>
));

export const Trash2 = iconEl("Trash2", (
  <>
    <rect x="2" y="4" width="12" height="12" />
    <rect x="0" y="2" width="16" height="3" />
    <rect x="6" y="0" width="4" height="3" />
    <rect x="4" y="6" width="2" height="8" fill="var(--color-background,#09090B)" />
    <rect x="10" y="6" width="2" height="8" fill="var(--color-background,#09090B)" />
  </>
));

export const TrendingUp = icon(
  "TrendingUp",
  "M0,11L4,7L8,9L15,2L16,2V7L9,11L8,9L4,9L0,13ZM11,2h5v5h-2V4h-3Z",
);

export const Upload = icon(
  "Upload",
  "M7,16h2V7l3,3L14,8l-6-6L2,8l2,2l3-3v9ZM0,14h16v2H0Z",
);

export const User = icon(
  "User",
  "M8,0C5,0,4,2,4,4C4,6,5,8,8,8C11,8,12,6,12,4C12,2,11,0,8,0ZM0,16C0,12,3,10,8,10C13,10,16,12,16,16Z",
);

export const UserPlus = iconEl("UserPlus", (
  <>
    <path d="M6,0C3,0,2,2,2,4C2,6,3,8,6,8C9,8,10,6,10,4C10,2,9,0,6,0ZM0,16C0,12,2,10,6,10C8,10,9,11,10,12" />
    <rect x="12" y="5" width="4" height="2" />
    <rect x="13" y="4" width="2" height="4" />
  </>
));

export const Users = iconEl("Users", (
  <>
    <path d="M10,2C8,2,7,4,7,5C7,7,8,9,10,9C12,9,13,7,13,5C13,4,12,2,10,2Z" />
    <path d="M6,16C6,12,7,10,10,10C13,10,16,12,16,16Z" />
    <path d="M5,3C3,3,2,5,2,6C2,8,3,9,5,9C6,9,7,8,7,7" />
    <path d="M0,16C0,13,1,11,4,10H6C5,11,4,12,4,16Z" />
  </>
));

export const VenetianMask = iconEl("VenetianMask", (
  <>
    <path d="M0,5C0,3,2,2,4,2H7C8,4,8,4,8,4C8,4,8,4,9,2H12C14,2,16,3,16,5V7C16,9,14,11,12,11H10C9,10,8,9,8,9C8,9,7,10,6,11H4C2,11,0,9,0,7ZM7,5H9V8H7Z" fillRule="evenodd" />
    <rect x="0" y="9" width="3" height="5" rx="1" />
    <rect x="13" y="9" width="3" height="5" rx="1" />
  </>
));

export const Wand2 = iconEl("Wand2", (
  <>
    <path d="M2,14L12,4L14,6L4,16Z" />
    <path d="M8,0L9,2L11,2L10,4L11,5L9,5L8,7L7,5L5,5L6,4L5,2L7,2Z" />
    <rect x="1" y="3" width="1" height="1" />
    <rect x="3" y="1" width="1" height="1" />
    <rect x="0" y="5" width="1" height="1" />
    <rect x="13" y="9" width="1" height="1" />
  </>
));

export const X = icon(
  "X",
  "M2,0L0,2l6,6L0,14l2,2l6-6l6,6l2-2L10,8l6-6L14,0L8,6Z",
);

export const Zap = icon("Zap", "M10,0L4,9H9L6,16L14,7H9Z");

