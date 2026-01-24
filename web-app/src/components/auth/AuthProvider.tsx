'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { User, LinkedAccount, UserPreferences } from '@/types';
import { getLinkedAccounts } from '@/lib/api/episodes';

interface AuthContextType {
  user: User | null;
  linkedAccounts: LinkedAccount[];
  preferences: UserPreferences;
  isLoading: boolean;
  isLinked: boolean;
  signIn: (email: string, name?: string) => void;
  signOut: () => void;
  refreshLinkedAccounts: () => Promise<void>;
  linkAccount: (provider: string, email: string, service?: 'gmail' | 'calendar') => void;
  updatePreferences: (updates: Partial<UserPreferences>) => void;
  toggleBookmark: (topicId: string) => void;
  hideTopic: (topicId: string) => void;
  unhideTopic: (topicId: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const USER_STORAGE_KEY = 'audexa-user';
const LINKED_ACCOUNTS_KEY = 'audexa-linked-accounts';
const PREFERENCES_KEY = 'audexa-preferences';

const DEFAULT_PREFERENCES: UserPreferences = {
  voiceHost1: 'alloy',
  voiceHost2: 'nova',
  language: 'en',
  includeEmail: true,
  includeCalendar: true,
  bookmarkedTopicIds: [],
  hiddenTopicIds: [],
  // Notification defaults
  notificationsEnabled: false,
  briefingHour: 7,
  briefingMinute: 0,
  briefingTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  includeTopicUpdates: true,
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccount[]>([]);
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [isLoading, setIsLoading] = useState(true);

  // Load from localStorage on mount
  useEffect(() => {
    const storedUser = localStorage.getItem(USER_STORAGE_KEY);
    const storedAccounts = localStorage.getItem(LINKED_ACCOUNTS_KEY);
    const storedPrefs = localStorage.getItem(PREFERENCES_KEY);

    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch {
        localStorage.removeItem(USER_STORAGE_KEY);
      }
    }

    if (storedAccounts) {
      try {
        setLinkedAccounts(JSON.parse(storedAccounts));
      } catch {
        localStorage.removeItem(LINKED_ACCOUNTS_KEY);
      }
    }

    if (storedPrefs) {
      try {
        setPreferences({ ...DEFAULT_PREFERENCES, ...JSON.parse(storedPrefs) });
      } catch {
        localStorage.removeItem(PREFERENCES_KEY);
      }
    }

    setIsLoading(false);
  }, []);

  // Refresh linked accounts from server
  const refreshLinkedAccounts = useCallback(async () => {
    if (!user?.email) return;

    try {
      const accountsRes = await getLinkedAccounts(user.email).catch(() => ({ linkedAccounts: [] }));

      const accounts = accountsRes.linkedAccounts || [];
      setLinkedAccounts(accounts);
      localStorage.setItem(LINKED_ACCOUNTS_KEY, JSON.stringify(accounts));
    } catch (err) {
      console.error('Failed to refresh linked accounts:', err);
    }
  }, [user?.email]);

  // Refresh accounts when user changes
  useEffect(() => {
    if (user?.email) {
      refreshLinkedAccounts();
    }
  }, [user?.email, refreshLinkedAccounts]);

  const signIn = useCallback((email: string, name?: string) => {
    const newUser: User = {
      id: email,
      email,
      name: name || email.split('@')[0],
    };
    setUser(newUser);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(newUser));
  }, []);

  const signOut = useCallback(() => {
    setUser(null);
    setLinkedAccounts([]);
    localStorage.removeItem(USER_STORAGE_KEY);
    localStorage.removeItem(LINKED_ACCOUNTS_KEY);
  }, []);

  const updatePreferences = useCallback((updates: Partial<UserPreferences>) => {
    setPreferences((prev) => {
      const newPrefs = { ...prev, ...updates };
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(newPrefs));
      return newPrefs;
    });
  }, []);

  const toggleBookmark = useCallback((topicId: string) => {
    setPreferences((prev) => {
      const isBookmarked = prev.bookmarkedTopicIds.includes(topicId);
      const newBookmarks = isBookmarked
        ? prev.bookmarkedTopicIds.filter((id) => id !== topicId)
        : [...prev.bookmarkedTopicIds, topicId];
      const newPrefs = { ...prev, bookmarkedTopicIds: newBookmarks };
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(newPrefs));
      return newPrefs;
    });
  }, []);

  const hideTopic = useCallback((topicId: string) => {
    setPreferences((prev) => {
      if (prev.hiddenTopicIds.includes(topicId)) return prev;
      const newPrefs = { ...prev, hiddenTopicIds: [...prev.hiddenTopicIds, topicId] };
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(newPrefs));
      return newPrefs;
    });
  }, []);

  const unhideTopic = useCallback((topicId: string) => {
    setPreferences((prev) => {
      const newPrefs = { ...prev, hiddenTopicIds: prev.hiddenTopicIds.filter((id) => id !== topicId) };
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(newPrefs));
      return newPrefs;
    });
  }, []);

  // Link account after OAuth callback
  // service parameter determines which capability was enabled (gmail or calendar)
  const linkAccount = useCallback((provider: string, email: string, service?: 'gmail' | 'calendar') => {
    console.log('[linkAccount] Called with:', { provider, email, service });

    // Update user with the actual email from OAuth
    const newUser: User = {
      id: email,
      email,
      name: email.split('@')[0],
    };
    setUser(newUser);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(newUser));

    // Determine which capabilities are enabled based on service
    // Default to gmail if not specified (backwards compatibility)
    const emailEnabled = service !== 'calendar'; // gmail or undefined
    const calendarEnabled = service === 'calendar';
    console.log('[linkAccount] Computed flags:', { emailEnabled, calendarEnabled });

    // Check if we already have an account for this provider and email
    const existingAccountIndex = linkedAccounts.findIndex(
      (a) => a.provider === provider && a.email === email
    );

    let newAccounts: LinkedAccount[];
    if (existingAccountIndex !== -1) {
      // Update existing account - only set the capability being linked
      // This allows incremental linking (Gmail first, then Calendar, or vice versa)
      const existingAccount = linkedAccounts[existingAccountIndex];
      newAccounts = linkedAccounts.map((a, index) => {
        if (index === existingAccountIndex) {
          return {
            ...a,
            // When linking Gmail: set emailEnabled=true, preserve existing calendarEnabled
            // When linking Calendar: set calendarEnabled=true, preserve existing emailEnabled
            emailEnabled: service === 'calendar' ? existingAccount.emailEnabled : true,
            calendarEnabled: service === 'calendar' ? true : existingAccount.calendarEnabled,
          };
        }
        return a;
      });
    } else {
      // Add new linked account
      const newAccount: LinkedAccount = {
        id: `${provider}_${Date.now()}`,
        provider: provider as 'google' | 'microsoft',
        email,
        emailEnabled,
        calendarEnabled,
        createdAt: new Date().toISOString(),
      };
      newAccounts = [...linkedAccounts, newAccount];
    }

    console.log('[linkAccount] Final accounts:', newAccounts);
    setLinkedAccounts(newAccounts);
    localStorage.setItem(LINKED_ACCOUNTS_KEY, JSON.stringify(newAccounts));
  }, [linkedAccounts]);

  const isLinked = linkedAccounts.length > 0;

  return (
    <AuthContext.Provider
      value={{
        user,
        linkedAccounts,
        preferences,
        isLoading,
        isLinked,
        signIn,
        signOut,
        refreshLinkedAccounts,
        linkAccount,
        updatePreferences,
        toggleBookmark,
        hideTopic,
        unhideTopic,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
