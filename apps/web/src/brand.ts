/**
 * Product identity, in one place so the product can be renamed without
 * hunting through components. (Package names like `@launchpad/*` are
 * internal and don't need to change with the brand.)
 */
export const BRAND = {
  name: "Launchpad",
  tagline: "Your team's projects, environments and deployments in one place."
} as const;
