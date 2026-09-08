/** Demo role buttons on /login. Production stays email/password only unless explicitly enabled. */
export function showDemoLogins(): boolean {
  const flag = process.env.NEXT_PUBLIC_SHOW_DEMO_LOGINS;
  if (flag === "true") return true;
  if (flag === "false") return false;
  return process.env.NODE_ENV !== "production";
}
