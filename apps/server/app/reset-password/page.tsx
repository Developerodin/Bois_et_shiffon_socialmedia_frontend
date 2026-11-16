import { AuthCard, AuthLink } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "@/app/reset-password/reset-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) {
    return (
      <AuthCard title="Link not valid" description="This reset link is missing its token or is incomplete.">
        <AuthLink href="/forgot-password">Request a new link</AuthLink>
      </AuthCard>
    );
  }
  return <ResetPasswordForm token={token} />;
}
