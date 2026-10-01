import { LogOut, Moon, Pencil, Sun, UserPlus } from 'lucide-react';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { authClient } from '@/lib/authClient';
import { initials } from '@/lib/format';
import { useTheme } from '@/lib/themeContext';
import { AuthDialog } from './AuthDialog';
import type { AuthMode } from './AuthDialog';
import { NameDialog } from './NameDialog';

/** Header account menu: rename, upgrade a guest to an account, theme, sign out. */
export function UserMenu(): ReactElement | null {
  const { data: session } = authClient.useSession();
  const { theme, setTheme } = useTheme();
  const [renaming, setRenaming] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const isDark = theme === 'dark';

  const authDialog = authMode !== null && (
    <AuthDialog
      open
      onOpenChange={(open) => {
        if (!open) setAuthMode(null);
      }}
      initialMode={authMode}
      suggestedName={session?.user.name ?? ''}
    />
  );

  if (session === null) {
    return (
      <>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setAuthMode('sign-in');
          }}
        >
          Sign in
        </Button>
        {authDialog}
      </>
    );
  }

  const { name, isAnonymous } = session.user;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="gap-2 px-2" aria-label="Account menu">
            <Avatar className="size-7">
              <AvatarFallback className="text-xs">{initials(name)}</AvatarFallback>
            </Avatar>
            <span className="hidden max-w-32 truncate sm:inline">{name}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="truncate">
            {name}
            <span className="text-muted-foreground block text-xs font-normal">
              {isAnonymous ? 'Guest' : 'Account'}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              setRenaming(true);
            }}
          >
            <Pencil /> Change name
          </DropdownMenuItem>
          {isAnonymous === true && (
            <DropdownMenuItem
              onSelect={() => {
                setAuthMode('sign-up');
              }}
            >
              <UserPlus /> Create account
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onSelect={() => {
              setTheme(isDark ? 'light' : 'dark');
            }}
          >
            {isDark ? <Sun /> : <Moon />} {isDark ? 'Light mode' : 'Dark mode'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void authClient.signOut()}>
            <LogOut /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {renaming && <NameDialog open onOpenChange={setRenaming} currentName={name} />}
      {authDialog}
    </>
  );
}
