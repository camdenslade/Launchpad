import { useState } from "react";
import { languageColor } from "../lib/languages.js";

interface ProjectAvatarProps {
  name: string;
  avatarUrl: string | null;
  size?: number;
}

/**
 * The owner's avatar (for imported repos), falling back to a letter tile when
 * there's no avatar or the image fails to load (e.g. offline installs).
 */
export function ProjectAvatar({ name, avatarUrl, size = 40 }: ProjectAvatarProps) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };

  if (avatarUrl && !failed) {
    return (
      <img
        className="project-avatar"
        style={style}
        // GitHub avatars accept a size param; request 2x for sharp retina rendering.
        src={withSize(avatarUrl, size * 2)}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div className="project-avatar project-avatar--letter" style={{ ...style, fontSize: size * 0.42 }} aria-hidden="true">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

/** Coloured dot + language name, GitHub style. */
export function LanguageBadge({ language }: { language: string }) {
  return (
    <span className="meta-item">
      <span className="language-dot" style={{ background: languageColor(language) }} />
      {language}
    </span>
  );
}

function withSize(url: string, px: number): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.endsWith("githubusercontent.com")) parsed.searchParams.set("s", String(px));
    return parsed.toString();
  } catch {
    return url;
  }
}
