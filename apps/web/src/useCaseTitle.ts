import { useEffect } from 'react';

export function useCaseTitle(name?: string) {
  useEffect(() => {
    document.title = name ? `Catch Me If You Can — The ${name} incident` : 'Catch Me If You Can — Bureau of Temporal Nonsense';
  }, [name]);
}
