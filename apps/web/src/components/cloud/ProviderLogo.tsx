/**
 * Cloud provider logos. Each provider's *official* mark lives unmodified in
 * /public/brand/providers (vendors' brand guidelines generally require using
 * their published assets as-is).
 *
 * Adding a provider (e.g. Azure, GCP):
 *   1. Download its official logo/icon from the vendor's architecture icon set.
 *   2. Save it as /public/brand/providers/<provider>.svg
 *   3. Add an entry below.
 */
const PROVIDERS: Record<string, { label: string; logo?: string }> = {
  aws: { label: "Amazon Web Services", logo: "/brand/providers/aws.svg" },
  // azure: { label: "Microsoft Azure", logo: "/brand/providers/azure.svg" },
  // gcp: { label: "Google Cloud", logo: "/brand/providers/gcp.svg" },
};

interface ProviderLogoProps {
  provider: string;
  size?: number;
}

export function ProviderLogo({ provider, size = 40 }: ProviderLogoProps) {
  const entry = PROVIDERS[provider];

  if (entry?.logo) {
    return (
      <img
        className="provider-logo"
        src={entry.logo}
        width={size}
        height={size}
        alt={entry.label}
        title={entry.label}
      />
    );
  }

  // Unknown provider or no logo yet: neutral text tile.
  return (
    <div
      className="project-avatar project-avatar--letter provider-logo"
      style={{ width: size, height: size, fontSize: size * 0.26 }}
      title={entry?.label ?? provider}
    >
      {provider.toUpperCase().slice(0, 4)}
    </div>
  );
}

export function providerLabel(provider: string): string {
  return PROVIDERS[provider]?.label ?? provider;
}
