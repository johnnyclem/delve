import { useMemo } from "react";
import DOMPurify from "dompurify";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderBasicMarkdown(md: string): string {
  const escaped = escapeHtml(md);
  return escaped
    .replace(/\[([CRHM]\d+)\]/g, '<span class="inline-flex items-center rounded bg-primary/20 text-primary px-1 py-0 text-[10px] font-mono align-middle">$1</span>')
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-3 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-semibold mt-4 mb-2">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/\n\n/g, "</p><p>")
    .replace(/^(?!<)(.+)$/gm, "<p>$1</p>");
}

export function SafeMarkdown({
  content,
  loading,
  cursor,
  className,
  testId,
}: {
  content: string;
  loading?: boolean;
  cursor?: boolean;
  className?: string;
  testId?: string;
}) {
  const sanitized = useMemo(() => {
    const html = renderBasicMarkdown(content) + (cursor ? '<span class="inline-block w-2 h-4 ml-0.5 align-middle bg-primary/70 animate-pulse" data-testid="chat-cursor"></span>' : "");
    return DOMPurify.sanitize(html);
  }, [content, cursor]);

  return (
    <div
      className={className ?? "prose prose-sm prose-invert max-w-none text-foreground/90"}
      data-testid={testId}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}

export function SanitizedHtml({ html, className, testId }: { html: string; className?: string; testId?: string }) {
  const sanitized = useMemo(() => DOMPurify.sanitize(html), [html]);
  return (
    <div
      className={className}
      data-testid={testId}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}
