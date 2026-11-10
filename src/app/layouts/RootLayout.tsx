import { Outlet } from 'react-router-dom';
import { DevRoleSwitcher } from '@/components/shared';

/** Wraps every route so the dev role switcher is available everywhere, including sign-in. */
export function RootLayout() {
  return (
    <>
      <Outlet />
      <DevRoleSwitcher />
    </>
  );
}
