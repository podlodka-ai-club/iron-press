import { useState } from "react";

export function useCopyToClipboard(
  text: string,
  resetMs = 1500,
): [copied: boolean, copy: () => void] {
  const [copied, setCopied] = useState(false);

  function copy() {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), resetMs);
    });
  }

  return [copied, copy];
}
