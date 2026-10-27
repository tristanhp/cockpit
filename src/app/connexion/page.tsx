import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-sm py-16">
      <p className="font-serif text-xl italic text-ink-soft">le carnet est fermé</p>
      <h1 className="mb-8 font-serif text-4xl leading-tight">Connexion</h1>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
