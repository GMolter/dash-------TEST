import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { NotFound } from './NotFound';

interface Props {
  shortCode: string;
}

export function URLRedirect({ shortCode }: Props) {
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const redirect = async () => {
      const { data, error } = await supabase
        .from('short_urls')
        .select('target_url, clicks')
        .eq('short_code', shortCode)
        .maybeSingle();

      if (error || !data) {
        setError(true);
        setLoading(false);
        return;
      }

      // Update click count
      await supabase
        .from('short_urls')
        .update({ clicks: data.clicks + 1 })
        .eq('short_code', shortCode);

      // Ensure URL has a protocol
      let targetUrl = data.target_url;
      if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        targetUrl = 'https://' + targetUrl;
      }

      window.location.href = targetUrl;
    };

    redirect();
  }, [shortCode]);

  if (error) {
    return <NotFound />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p className="text-slate-400">Redirecting...</p>
      </div>
    </div>
  );
}
