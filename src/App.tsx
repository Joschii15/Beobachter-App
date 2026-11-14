import { useEffect } from 'react';
import { useSettings } from './db/db';
import { applyTheme, useHashRoute } from './lib/hooks';
import { LiveMatch } from './screens/LiveMatch';
import { MatchList } from './screens/MatchList';
import { MatchSetup } from './screens/MatchSetup';
import { Review } from './screens/Review';
import { SettingsScreen } from './screens/Settings';

export function App() {
  const route = useHashRoute();
  const settings = useSettings();

  useEffect(() => {
    if (settings) applyTheme(settings.theme);
  }, [settings?.theme]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!settings) return null;

  const m = route.match(/^\/match\/([^/]+)\/(live|review|edit)$/);
  if (m) {
    const [, id, view] = m;
    if (view === 'live') return <LiveMatch key={id} id={id} settings={settings} />;
    if (view === 'review') return <Review key={id} id={id} settings={settings} />;
    return <MatchSetup key={id} editId={id} settings={settings} />;
  }
  if (route === '/new') return <MatchSetup settings={settings} />;
  if (route === '/settings') return <SettingsScreen settings={settings} />;
  return <MatchList settings={settings} />;
}
