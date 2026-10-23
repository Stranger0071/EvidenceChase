'use client';

import { loginInputSchema, type LoginInput } from '@evidencechase/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, fieldAria } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useLogin } from '@/hooks/use-auth';
import { errorMessage } from '@/lib/api-client';
import { safeNextPath } from '@/lib/safe-redirect';

function LoginForm() {
  const router = useRouter();
  const next = safeNextPath(useSearchParams().get('next'));
  const login = useLogin();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({ resolver: zodResolver(loginInputSchema) });

  const onSubmit = handleSubmit((values) =>
    login.mutate(values, { onSuccess: () => router.replace(next) }),
  );

  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold">Sign in</h1>
      <p className="mt-1 text-sm text-muted">Manage your audits and evidence requests.</p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        <Field id="email" label="Work email" error={errors.email?.message}>
          <Input
            type="email"
            autoComplete="email"
            {...fieldAria('email', errors.email?.message)}
            {...register('email')}
          />
        </Field>
        <Field id="password" label="Password" error={errors.password?.message}>
          <Input
            type="password"
            autoComplete="current-password"
            {...fieldAria('password', errors.password?.message)}
            {...register('password')}
          />
        </Field>

        {login.isError && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {errorMessage(login.error)}
          </p>
        )}

        <Button type="submit" className="w-full" loading={login.isPending}>
          Sign in
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        New here?{' '}
        <Link href="/signup" className="font-medium text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </Card>
  );
}

export default function LoginPage() {
  // useSearchParams needs a Suspense boundary so the rest of the page can render statically.
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
