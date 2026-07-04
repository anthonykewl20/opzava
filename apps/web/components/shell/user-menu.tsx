import { signOutAction } from "@/app/(auth)/signout/actions";
import { AccountMenu } from "@/components/shell/account-menu";
import type { AppSessionContext } from "@/lib/session";

export function UserMenu({ context }: { readonly context: AppSessionContext }) {
  return <AccountMenu user={context.user} signOutAction={signOutAction} />;
}
