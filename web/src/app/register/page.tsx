import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth/auth-form";
import { getAuthSettings } from "@/lib/auth/store";
import { getCurrentUser } from "@/lib/auth/session";
import { getInstallStatus } from "@/lib/server/install-status";

type RegisterPageProps = {
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
    const params = searchParams ? await searchParams : {};
    const nextPath = safeNextPath(firstValue(params.next));
    const referralCode = firstValue(params.ref)?.trim().toUpperCase() || "";
    const inviteError = firstValue(params.invite) === "invalid" ? "邀请链接无效或已停用，你仍可清空邀请码后正常注册。" : undefined;
    const install = await getInstallStatus();
    if (!install.ready) redirect("/install");

    const [user, settings] = await Promise.all([getCurrentUser(), getAuthSettings()]);
    if (user) redirect(nextPath);

    return (
        <AuthForm
            mode="register"
            nextPath={nextPath}
            registrationEnabled={settings.registrationEnabled}
            emailRegistrationEnabled={settings.emailRegistrationEnabled}
            initialReferralCode={referralCode}
            referralSource={referralCode ? "invite-link" : "registration-form"}
            inviteError={inviteError}
        />
    );
}

function firstValue(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value;
}

function safeNextPath(value: string | undefined) {
    return value?.startsWith("/") && !value.startsWith("//") ? value : "/create";
}
