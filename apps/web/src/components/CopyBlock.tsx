import { useState } from "react";

/** A code block with a copy button. */
export function CopyBlock({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked (non-HTTPS origins); the text is still selectable.
    }
  }

  return (
    <div className="copy-block">
      {label && <div className="copy-block__label">{label}</div>}
      <pre>
        <code>{text}</code>
      </pre>
      <button type="button" className="button button--ghost button--sm copy-block__button" onClick={copy}>
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
