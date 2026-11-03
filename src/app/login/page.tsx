"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, apiErrorMessage } from "@/components/ui/field-error";
import { loginSchema } from "@/lib/validation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);
    // Client-side validation first: clear inline errors per field.
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".") || "form";
        if (!errors[key]) errors[key] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        const message = await apiErrorMessage(
          response,
          "Sign-in failed. Check your details and try again.",
        );
        // Wrong credentials (401) vs server errors: say so plainly.
        setFormError(
          response.status === 401
            ? "Wrong email or password. Check both and try again."
            : message,
        );
        toast.error(
          response.status === 401
            ? "Wrong email or password"
            : "Sign-in failed",
        );
        return;
      }
      toast.success("Signed in. Welcome back.");
      router.push("/");
      router.refresh();
    } catch {
      setFormError("Could not reach the server. Check your connection and retry.");
      toast.error("Could not reach the server");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8">
      <div className="grid w-full max-w-3xl items-center gap-6 md:grid-cols-2">
        <div className="hidden md:block" aria-hidden="true">
          <Image
            src="/images/login-illustration.svg"
            alt=""
            width={520}
            height={360}
            priority
            className="h-auto w-full"
          />
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">
              CraftThink <span className="text-brand-600">Business OS</span>
            </CardTitle>
            <CardDescription>
              Sign in with your internal account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={!!fieldErrors.email}
                />
                <FieldError message={fieldErrors.email} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={!!fieldErrors.password}
                />
                <FieldError message={fieldErrors.password} />
              </div>
              {formError ? (
                <p
                  role="alert"
                  className="rounded-md bg-red-50 px-3 py-3 text-base text-red-700"
                >
                  {formError}
                </p>
              ) : null}
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
