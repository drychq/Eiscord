import { useEffect, useState } from 'react';

export type Viewport = 'desktop' | 'tablet' | 'mobile';

export function useViewport(): Viewport {
  const [viewport, setViewport] = useState<Viewport>(() => getViewport());

  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 720px)');
    const tablet = window.matchMedia('(max-width: 980px)');

    const onChange = () => setViewport(getViewport());
    mobile.addEventListener('change', onChange);
    tablet.addEventListener('change', onChange);
    return () => {
      mobile.removeEventListener('change', onChange);
      tablet.removeEventListener('change', onChange);
    };
  }, []);

  return viewport;
}

function getViewport(): Viewport {
  if (window.matchMedia('(max-width: 720px)').matches) return 'mobile';
  if (window.matchMedia('(max-width: 980px)').matches) return 'tablet';
  return 'desktop';
}
