'use client';

import { signupInputSchema, type SignupInput } from '@evidencechase/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, fieldAria } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useSignup } from '@/hooks/use-auth';
import { ApiError, errorMessage } from '@/lib/api-client';
import { applyServerFieldErrors } from '@/lib/form-errors';

export default function SignupPage() {
  const router = useRouter();
  const signup = useSignup();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<SignupInput>({ resolver: zodResolver(signupInputSchema) });

  const onSubmit = handleSubmit((values) =>
    signup.mutate(values, {
      onSuccess: () => router.replace('/audits'),
      onError: (error) => applyServerFieldErrors(error, ['name', 'email', 'password'], setError),
    }),
  );

  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold">Create your account</h1>
      <p className="mt-1 text-sm text-muted">
        For compliance managers. Control owners never need an account.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        <Field id="name" label="Your name" error={errors.name?.message}>
          <Input
            autoComplete="name"
            {...fieldAria('name', errors.name?.message)}
            {...register('name')}
          />
        </Field>
        <Field id="email" label="Work email" error={errors.email?.message}>
          <Input
            type="email"
            autoComplete="email"
            {...fieldAria('email', errors.email?.message)}
            {...register('email')}
          />
        </Field>
        <Field
          id="password"
          label="Password"
          error={errors.password?.message}
          hint="At least 8 characters."
        >
          <Input
            type="password"
            autoComplete="new-password"
            {...fieldAria('password', errors.password?.message)}
            {...register('password')}
          />
        </Field>

        {/* Field-level errors already show under their inputs; only show other errors here. */}
        {signup.isError && !(signup.error instanceof ApiError && signup.error.fieldErrors) && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {errorMessage(signup.error)}
          </p>
        )}

        <Button type="submit" className="w-full" loading={signup.isPending}>
          Create account
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </Card>
  );
}
