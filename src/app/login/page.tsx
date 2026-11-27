import { redirect } from "next/navigation";
import { login } from "@/lib/server/auth";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  async function doLogin(form: FormData) {
    "use server";
    const ok = await login(String(form.get("code") ?? "").trim(), String(form.get("password") ?? ""));
    redirect(ok ? "/" : "/login?error=1");
  }
  return (
    <div className="card" style={{ maxWidth: 380, margin: "48px auto" }}>
      <h1>Hi-Tech HRM</h1>
      <form action={doLogin} className="stack">
        <label>Employee code or email<input name="code" required autoComplete="username" /></label>
        <label>Password<input name="password" type="password" required autoComplete="current-password" /></label>
        {error && <p className="error">Wrong code or password.</p>}
        <button type="submit">Sign in</button>
      </form>
    </div>
  );
}
