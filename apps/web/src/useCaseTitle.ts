import { useEffect } from 'react';

export function useCaseTitle(name?: string) {
  useEffect(() => {
    document.title = name ? `Father Hunter — The ${name} incident` : 'Father Hunter — Bureau of Temporal Nonsense';
  }, [name]);
}
