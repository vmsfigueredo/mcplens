// Fallback port used only when 3333 is already taken (multiple projects).
export function dashboardFallbackPort(projectRoot: string): number {
  let hash = 0
  for (let i = 0; i < projectRoot.length; i++) {
    hash = (hash * 31 + projectRoot.charCodeAt(i)) >>> 0
  }
  return 3334 + (hash % 999)
}
