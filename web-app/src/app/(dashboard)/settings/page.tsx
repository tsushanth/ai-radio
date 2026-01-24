'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { User, Mail, Bell, Trash2, Link2, Check, ExternalLink, Info, Smartphone, Clock, Calendar } from 'lucide-react';
import { disconnectAccount } from '@/lib/api/episodes';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://ai-radio-backend-917362189743.us-central1.run.app/api';

const VOICE_OPTIONS = [
  { id: 'alloy', name: 'Alloy' },
  { id: 'echo', name: 'Echo' },
  { id: 'fable', name: 'Fable' },
  { id: 'onyx', name: 'Onyx' },
  { id: 'nova', name: 'Nova' },
  { id: 'shimmer', name: 'Shimmer' },
];

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'pt', name: 'Portuguese' },
];

// Helper to format time for display
function formatTime(hour: number, minute: number): string {
  const amPm = hour < 12 ? 'AM' : 'PM';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:${minute.toString().padStart(2, '0')} ${amPm}`;
}

// Generate time options for select (every 30 minutes)
function generateTimeOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  for (let hour = 0; hour < 24; hour++) {
    for (const minute of [0, 30]) {
      options.push({
        value: `${hour}:${minute}`,
        label: formatTime(hour, minute),
      });
    }
  }
  return options;
}

const TIME_OPTIONS = generateTimeOptions();

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const {
    user,
    linkedAccounts,
    preferences,
    signOut,
    linkAccount,
    refreshLinkedAccounts,
    updatePreferences
  } = useAuth();

  // Handle OAuth callback
  useEffect(() => {
    const success = searchParams.get('success');
    const provider = searchParams.get('provider');
    const email = searchParams.get('email');

    if (success === 'true' && provider && email) {
      // Link the account with the email from OAuth
      linkAccount(provider, decodeURIComponent(email));
      // Clean up URL
      window.history.replaceState({}, '', '/settings');
    }
  }, [searchParams, linkAccount]);

  const handleDisconnect = async (provider: string) => {
    if (!user?.email) return;
    if (!confirm(`Are you sure you want to disconnect your ${provider} account?`)) return;

    try {
      await disconnectAccount(user.email, provider);
      await refreshLinkedAccounts();
    } catch (err) {
      alert('Failed to disconnect account');
    }
  };

  const handleDeleteAccount = () => {
    if (confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
      signOut();
    }
  };

  // Check for Gmail and Calendar connections separately
  const gmailAccount = linkedAccounts.find((a) => a.provider === 'google' && a.emailEnabled);
  const calendarAccount = linkedAccounts.find((a) => a.provider === 'google' && a.calendarEnabled);
  const isGmailConnected = !!gmailAccount;
  const isCalendarConnected = !!calendarAccount;

  const handleConnectGmail = () => {
    // Redirect to backend OAuth endpoint for Gmail scope
    const redirectUrl = `${window.location.origin}/settings`;
    window.location.href = `${API_URL}/auth/oauth/google?redirect_url=${encodeURIComponent(redirectUrl)}&scope=email`;
  };

  const handleConnectCalendar = () => {
    // Redirect to backend OAuth endpoint for Calendar scope
    const redirectUrl = `${window.location.origin}/settings`;
    window.location.href = `${API_URL}/auth/oauth/google?redirect_url=${encodeURIComponent(redirectUrl)}&scope=calendar`;
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      {/* Account */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Account
          </CardTitle>
          <CardDescription>Your account information</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-medium text-lg">
              {user?.email?.[0].toUpperCase() || 'U'}
            </div>
            <div>
              <p className="font-medium">{user?.name}</p>
              <p className="text-sm text-gray-500">{user?.email}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Linked Accounts */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5" />
            Linked Accounts
          </CardTitle>
          <CardDescription>
            Connect your accounts to personalize your daily briefings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Gmail Account */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                <Mail className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="font-medium">Gmail</p>
                {isGmailConnected ? (
                  <>
                    <p className="text-sm text-green-600 flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      Connected
                    </p>
                    {gmailAccount && (
                      <p className="text-xs text-gray-500">{gmailAccount.email}</p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-gray-500">Not connected</p>
                )}
              </div>
            </div>
            {isGmailConnected ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDisconnect('google')}
                className="text-red-500 hover:text-red-600 hover:bg-red-50"
              >
                Disconnect
              </Button>
            ) : (
              <Button
                onClick={handleConnectGmail}
                size="sm"
                className="bg-orange-500 hover:bg-orange-600"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Connect
              </Button>
            )}
          </div>

          {!isGmailConnected && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <p className="text-sm text-orange-800">
                <strong>What we&apos;ll access:</strong>
              </p>
              <ul className="text-sm text-orange-700 mt-2 space-y-1">
                <li>• Read your Gmail messages to include in briefings</li>
                <li>• Basic profile information (email, name)</li>
              </ul>
            </div>
          )}

          {/* Google Calendar */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Calendar className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="font-medium">Google Calendar</p>
                {isCalendarConnected ? (
                  <p className="text-sm text-green-600 flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    Connected
                  </p>
                ) : (
                  <p className="text-sm text-gray-500">Not connected</p>
                )}
              </div>
            </div>
            {isCalendarConnected ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDisconnect('google')}
                className="text-red-500 hover:text-red-600 hover:bg-red-50"
              >
                Disconnect
              </Button>
            ) : (
              <Button
                onClick={handleConnectCalendar}
                size="sm"
                className="bg-orange-500 hover:bg-orange-600"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Connect
              </Button>
            )}
          </div>

          {!isCalendarConnected && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                <strong>What we&apos;ll access:</strong>
              </p>
              <ul className="text-sm text-blue-700 mt-2 space-y-1">
                <li>• Read your calendar events for daily schedule</li>
                <li>• Basic profile information</li>
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Voice Preferences */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5" />
            Voice Preferences
          </CardTitle>
          <CardDescription>Customize your AI hosts</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Host 1 Voice</label>
            <select
              value={preferences.voiceHost1}
              onChange={(e) => updatePreferences({ voiceHost1: e.target.value })}
              className="w-full h-10 rounded-md border border-gray-300 px-3 focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              {VOICE_OPTIONS.map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Host 2 Voice</label>
            <select
              value={preferences.voiceHost2}
              onChange={(e) => updatePreferences({ voiceHost2: e.target.value })}
              className="w-full h-10 rounded-md border border-gray-300 px-3 focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              {VOICE_OPTIONS.map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Language</label>
            <select
              value={preferences.language}
              onChange={(e) => updatePreferences({ language: e.target.value })}
              className="w-full h-10 rounded-md border border-gray-300 px-3 focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.name}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Content Sources */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Content Sources
          </CardTitle>
          <CardDescription>What to include in your briefings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={preferences.includeEmail}
              onChange={(e) => updatePreferences({ includeEmail: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
            />
            <span className="text-sm">Include email summaries</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={preferences.includeCalendar}
              onChange={(e) => updatePreferences({ includeCalendar: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
            />
            <span className="text-sm">Include calendar events</span>
          </label>
        </CardContent>
      </Card>

      {/* Notification Settings */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5" />
            Daily Brief Notifications
          </CardTitle>
          <CardDescription>Configure when you want to be reminded about your daily brief</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <span className="text-sm font-medium">Enable Daily Notifications</span>
              <p className="text-xs text-gray-500">Get notified when your brief is ready</p>
            </div>
            <input
              type="checkbox"
              checked={preferences.notificationsEnabled}
              onChange={(e) => updatePreferences({ notificationsEnabled: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
            />
          </label>

          {preferences.notificationsEnabled && (
            <>
              <div>
                <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Briefing Time
                </label>
                <select
                  value={`${preferences.briefingHour}:${preferences.briefingMinute}`}
                  onChange={(e) => {
                    const [hour, minute] = e.target.value.split(':').map(Number);
                    updatePreferences({ briefingHour: hour, briefingMinute: minute });
                  }}
                  className="w-full h-10 rounded-md border border-gray-300 px-3 focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  {TIME_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Time is set for your local timezone ({preferences.briefingTimezone})
                </p>
              </div>

              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <span className="text-sm font-medium">Include Topic Updates</span>
                  <p className="text-xs text-gray-500">Add headlines from your topics to Daily Brief</p>
                </div>
                <input
                  type="checkbox"
                  checked={preferences.includeTopicUpdates}
                  onChange={(e) => updatePreferences({ includeTopicUpdates: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                />
              </label>
            </>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              <strong>Note:</strong> For the best notification experience, download our mobile apps. Web notifications require the browser to be open.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* About & Apps */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="w-5 h-5" />
            Mobile Apps
          </CardTitle>
          <CardDescription>Get Audexa on your mobile device</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <a
            href="https://apps.apple.com/us/app/audexa/id6756477258"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
              <span>Download on App Store</span>
            </div>
            <ExternalLink className="w-4 h-4 text-gray-400" />
          </a>
          <a
            href="https://play.google.com/store/apps/details?id=com.kreativekoala.audexa"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3,20.5V3.5C3,2.91 3.34,2.39 3.84,2.15L13.69,12L3.84,21.85C3.34,21.6 3,21.09 3,20.5M16.81,15.12L6.05,21.34L14.54,12.85L16.81,15.12M20.16,10.81C20.5,11.08 20.75,11.5 20.75,12C20.75,12.5 20.53,12.9 20.18,13.18L17.89,14.5L15.39,12L17.89,9.5L20.16,10.81M6.05,2.66L16.81,8.88L14.54,11.15L6.05,2.66Z"/>
              </svg>
              <span>Get it on Google Play</span>
            </div>
            <ExternalLink className="w-4 h-4 text-gray-400" />
          </a>
          <Link
            href="/about"
            className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Info className="w-6 h-6" />
              <span>About Audexa</span>
            </div>
            <ExternalLink className="w-4 h-4 text-gray-400" />
          </Link>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600">
            <Trash2 className="w-5 h-5" />
            Danger Zone
          </CardTitle>
          <CardDescription>Irreversible actions</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="destructive"
            onClick={handleDeleteAccount}
            className="bg-red-500 hover:bg-red-600"
          >
            Delete Account
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
