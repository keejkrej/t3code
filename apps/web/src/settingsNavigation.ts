export type SettingsRouteSearch = {
  readonly returnTo?: string;
};

type RouteLocationLike = {
  readonly href: string;
  readonly pathname: string;
};

function isSafeReturnHref(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/settings");
}

export function parseSettingsRouteSearch(search: Record<string, unknown>): SettingsRouteSearch {
  const returnTo = search.returnTo;
  if (typeof returnTo !== "string" || !isSafeReturnHref(returnTo)) {
    return {};
  }

  return { returnTo };
}

export function settingsSearchForLocation(location: RouteLocationLike): SettingsRouteSearch {
  return isSafeReturnHref(location.href) ? { returnTo: location.href } : {};
}

export function resolveSettingsBackHref(search: SettingsRouteSearch): string {
  return search.returnTo && isSafeReturnHref(search.returnTo) ? search.returnTo : "/";
}
